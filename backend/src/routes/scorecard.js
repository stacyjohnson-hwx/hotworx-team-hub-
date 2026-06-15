const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')
const { ensureScorecardSchema } = require('../services/scorecardSchema')
const {
  STATUS_THRESHOLDS, GROUPS, GROUP_ORDER, CATALOG, HERO_KEYS,
} = require('../services/scorecardCatalog')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Best-effort: try to auto-create the tables via the direct pg connection
// (DATABASE_URL). If that connection isn't available in this environment, we do
// NOT block — the tables may already exist (created via the Supabase SQL editor),
// and all reads/writes below go through the Supabase service client regardless.
// If the tables genuinely don't exist, the Supabase queries surface a clear error.
async function withSchema(res, fn) {
  try {
    await ensureScorecardSchema()
  } catch (err) {
    console.warn('[scorecard] auto-bootstrap unavailable, continuing via Supabase client:', err.message)
  }
  return fn()
}

// Build the fully-resolved metric list for a month: catalog + owner goal overrides
// + this month's actuals.
function resolveMetrics(goalRows, actuals) {
  const overrides = {}
  for (const g of goalRows || []) overrides[g.metric_key] = g
  return CATALOG.map((m) => {
    const ov = overrides[m.key] || {}
    const goal = ov.goal != null ? Number(ov.goal) : m.goal
    const lowerIsBetter = ov.lower_is_better != null ? ov.lower_is_better : !!m.lowerIsBetter
    const actual = actuals && actuals[m.key] != null ? actuals[m.key] : null
    return {
      key: m.key,
      label: m.label,
      group: m.group,
      type: m.type,
      source: m.source,
      note: m.note || null,
      goal,
      lowerIsBetter,
      actual,
      isHero: m.group === 'hero',
    }
  })
}

// GET /api/scorecard/:year/:month — resolved metrics + review state for a month.
router.get('/:year/:month', authenticate, requireStudio, requireRole('owner', 'manager'), (req, res) =>
  withSchema(res, async () => {
    const year = Number(req.params.year)
    const month = Number(req.params.month)
    const sb = db()

    const [{ data: monthRow, error: mErr }, { data: goalRows, error: gErr }] = await Promise.all([
      sb.from('scorecard_months').select('*').eq('studio_id', req.studio.id).eq('year', year).eq('month', month).maybeSingle(),
      sb.from('scorecard_goals').select('*').eq('studio_id', req.studio.id),
    ])
    if (mErr) return res.status(500).json({ error: mErr.message })
    if (gErr) return res.status(500).json({ error: gErr.message })

    let reviewedByName = null
    if (monthRow?.reviewed_by) {
      const { data: prof } = await sb.from('user_profiles').select('name').eq('id', monthRow.reviewed_by).maybeSingle()
      reviewedByName = prof?.name || null
    }

    res.json({
      year,
      month,
      metrics: resolveMetrics(goalRows, monthRow?.actuals || {}),
      heroKeys: HERO_KEYS,
      groups: GROUPS,
      groupOrder: GROUP_ORDER,
      thresholds: STATUS_THRESHOLDS,
      reviewedBy: monthRow?.reviewed_by || null,
      reviewedByName,
      reviewedAt: monthRow?.reviewed_at || null,
      updatedAt: monthRow?.updated_at || null,
    })
  }))

// PUT /api/scorecard/:year/:month — save actuals (owner + manager).
// Body: { actuals: { metric_key: value, ... } }  (merged into existing)
router.put('/:year/:month', authenticate, requireStudio, requireRole('owner', 'manager'), (req, res) =>
  withSchema(res, async () => {
    const year = Number(req.params.year)
    const month = Number(req.params.month)
    const incoming = req.body?.actuals
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ error: 'actuals object required' })
    }
    const sb = db()

    const { data: existing, error: exErr } = await sb
      .from('scorecard_months').select('actuals')
      .eq('studio_id', req.studio.id).eq('year', year).eq('month', month).maybeSingle()
    if (exErr) return res.status(500).json({ error: exErr.message })

    const merged = { ...(existing?.actuals || {}), ...incoming }

    const { data, error } = await sb
      .from('scorecard_months')
      .upsert({
        studio_id: req.studio.id, year, month,
        actuals: merged,
        updated_by: req.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'studio_id, year, month' })
      .select().single()
    if (error) return res.status(500).json({ error: error.message })
    res.json(data)
  }))

// PUT /api/scorecard/goals — owner-editable goal overrides (seeds future months).
// Body: { goals: [{ metric_key, goal, lower_is_better }] }
router.put('/goals', authenticate, requireStudio, requireRole('owner'), (req, res) =>
  withSchema(res, async () => {
    const goals = req.body?.goals
    if (!Array.isArray(goals)) return res.status(400).json({ error: 'goals array required' })
    const sb = db()

    const rows = goals
      .filter((g) => g && g.metric_key)
      .map((g) => ({
        studio_id: req.studio.id,
        metric_key: g.metric_key,
        goal: g.goal === '' || g.goal == null ? null : Number(g.goal),
        lower_is_better: g.lower_is_better ?? null,
        updated_by: req.user.id,
        updated_at: new Date().toISOString(),
      }))
    if (!rows.length) return res.json([])

    const { data, error } = await sb
      .from('scorecard_goals')
      .upsert(rows, { onConflict: 'studio_id, metric_key' })
      .select()
    if (error) return res.status(500).json({ error: error.message })
    res.json(data)
  }))

// POST /api/scorecard/:year/:month/review — owner sign-off toggle.
// Body: { reviewed: true|false }
router.post('/:year/:month/review', authenticate, requireStudio, requireRole('owner'), (req, res) =>
  withSchema(res, async () => {
    const year = Number(req.params.year)
    const month = Number(req.params.month)
    const reviewed = req.body?.reviewed !== false
    const sb = db()

    const { data, error } = await sb
      .from('scorecard_months')
      .upsert({
        studio_id: req.studio.id, year, month,
        reviewed_by: reviewed ? req.user.id : null,
        reviewed_at: reviewed ? new Date().toISOString() : null,
        updated_by: req.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'studio_id, year, month' })
      .select().single()
    if (error) return res.status(500).json({ error: error.message })
    res.json(data)
  }))

module.exports = router
