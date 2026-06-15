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
      auto: m.auto || null,        // computeKey when the value is pulled, not entered
      autoGoal: m.autoGoal || null, // computeKey when the GOAL is pulled (e.g. ITB goal)
      isHero: m.group === 'hero',
    }
  })
}

// Pull values that feed auto metrics from other modules (Studio Trends, Events,
// Promotions, Maintenance). Returns { values: { computeKey -> number|null }, extras }.
async function computeAutoValues(sb, studioId, year, month) {
  const pm = month === 1 ? 12 : month - 1
  const py = month === 1 ? year - 1 : year
  const round = (n, d = 0) => { const f = 10 ** d; return Math.round(n * f) / f }
  const pad = (n) => String(n).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  const monthStart = `${year}-${pad(month)}-01`
  const monthEnd = `${year}-${pad(month)}-${pad(lastDay)}`

  const [thisT, prevT, evRes, promoRes, maintRes, taskRes, compRes] = await Promise.all([
    sb.from('studio_trends').select('*').eq('studio_id', studioId).eq('year', year).eq('month', month).maybeSingle(),
    sb.from('studio_trends').select('*').eq('studio_id', studioId).eq('year', py).eq('month', pm).maybeSingle(),
    // Filter by actual date (matches the Events page) so events/promos dated in a
    // prior year never leak in, even if their month/year columns are mis-tagged.
    sb.from('events').select('id, title, start_date, event_type').eq('studio_id', studioId).gte('start_date', monthStart).lte('start_date', monthEnd).order('start_date'),
    sb.from('promotions').select('id, title, promo_type, start_date').eq('studio_id', studioId).gte('start_date', monthStart).lte('start_date', monthEnd).order('start_date'),
    sb.from('maintenance_logs').select('id, status').eq('studio_id', studioId).in('status', ['open', 'in_progress']),
    sb.from('cleaning_tasks').select('*').eq('active', true),
    sb.from('cleaning_completions').select('task_id, completion_date').eq('studio_id', studioId).gte('completion_date', monthStart).lte('completion_date', monthEnd),
  ])

  const t = thisT.data || null
  const prev = prevT.data || null
  const events = evRes.data || []
  const promos = promoRes.data || []
  const openMaint = (maintRes.data || []).length

  const num = (v) => (v == null ? 0 : Number(v))
  const bomEvents = events.filter(e => e.event_type === 'business_of_the_month')
  const influencerEvents = events.filter(e => e.event_type === 'influencer_visit')
  // Events Held excludes "Team" events; Promotions Run excludes "HOTWORX" promos.
  const countedEvents = events.filter(e => e.event_type !== 'team')
  const countedPromos = promos.filter(p => p.promo_type !== 'hotworx')

  // Cleaning compliance, month-to-date: expected task occurrences vs completed.
  const cleaningPct = computeCleaningCompliance(taskRes.data || [], compRes.data || [], year, month, lastDay)

  const values = {
    net_eft_increase:       t ? num(t.eft_increase) - num(t.eft_decrease) : null,
    new_members:            t ? num(t.new_members) : null,
    in_the_bank:            t ? num(t.in_the_bank) : null,
    itb_goal:               t ? num(t.itb_goal) : null,
    close_rate:             t && num(t.red_appts_held) > 0 ? round(num(t.new_members) / num(t.red_appts_held) * 100) : (t ? 0 : null),
    checkin_show_rate:      t && num(t.red_appts_booked) > 0 ? round(num(t.red_appts_held) / num(t.red_appts_booked) * 100) : (t ? 0 : null),
    sweat_elite_mix:        t ? num(t.sweat_elite_pct) : null,
    attrition_rate:         t && prev && num(prev.total_member_count) > 0 ? round(num(t.cancellations) / num(prev.total_member_count) * 100, 1) : null,
    five_star_reviews_delta: t ? num(t.five_star_reviews) - num(prev?.five_star_reviews) : null,
    ig_growth_delta:        t ? num(t.instagram_followers) - num(prev?.instagram_followers) : null,
    events_held:            countedEvents.length,
    promotions_run:         countedPromos.length,
    business_of_the_month:  bomEvents.length,
    influencer_visits:      influencerEvents.length,
    open_maintenance_issues: openMaint,
    cleaning_compliance:    cleaningPct,
  }

  // Business-of-the-Month card: first such event + its linked B2B contact (logo).
  let businessOfMonth = null
  if (bomEvents.length) {
    const ev = bomEvents[0]
    const { data: links } = await sb
      .from('event_b2b_contacts')
      .select('b2b_contacts(id, business_name, logo_url, website)')
      .eq('event_id', ev.id)
      .limit(1)
    const c = links && links[0] && links[0].b2b_contacts
    businessOfMonth = {
      event_title: ev.title,
      business_name: c?.business_name || ev.title,
      logo_url: c?.logo_url || null,
      website: c?.website || null,
      b2b_contact_id: c?.id || null,
    }
  }

  return {
    values,
    extras: {
      eventsThisMonth: countedEvents,
      promosThisMonth: countedPromos,
      bomEventsThisMonth: bomEvents,
      influencerEventsThisMonth: influencerEvents,
      businessOfMonth,
      // Marketing funnel (this month) — Leads → Booked → Showed → Closed.
      funnel: t ? {
        leads: num(t.leads),
        booked: num(t.red_appts_booked),
        showed: num(t.red_appts_held),
        closed: num(t.new_members),
      } : null,
    },
  }
}

// Replicates the cleaning module's "task active on date" rule so compliance
// matches what the Cleaning screen shows.
function cleaningTaskActiveOnDate(task, dateStr) {
  const d = new Date(dateStr)
  switch (task.frequency) {
    case 'daily':     return true
    case 'weekly':    return task.day_of_week === d.getDay()
    case 'monthly':   return task.day_of_month === d.getDate()
    case 'quarterly': return Array.isArray(task.quarterly_dates) && task.quarterly_dates.includes(dateStr)
    case 'one_off':   return task.one_off_date === dateStr
    default:          return false
  }
}

// Month-to-date compliance: of every task occurrence that should have happened
// from the 1st through today (or the full month, if past), what % were completed.
function computeCleaningCompliance(tasks, completions, year, month, lastDay) {
  const pad = (n) => String(n).padStart(2, '0')
  const now = new Date()
  const curY = now.getFullYear(), curM = now.getMonth() + 1, curD = now.getDate()
  let endDay
  if (year > curY || (year === curY && month > curM)) endDay = 0           // future month
  else if (year < curY || (year === curY && month < curM)) endDay = lastDay // past month
  else endDay = Math.min(curD, lastDay)                                     // current month
  if (endDay === 0 || !tasks.length) return null

  const done = new Set(completions.map(c => `${c.task_id}|${c.completion_date}`))
  let expected = 0, completed = 0
  for (let day = 1; day <= endDay; day++) {
    const dateStr = `${year}-${pad(month)}-${pad(day)}`
    for (const task of tasks) {
      if (cleaningTaskActiveOnDate(task, dateStr)) {
        expected++
        if (done.has(`${task.id}|${dateStr}`)) completed++
      }
    }
  }
  return expected === 0 ? null : Math.round((completed / expected) * 100)
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

    // Resolve manual actuals, then override auto metrics with pulled values.
    const metrics = resolveMetrics(goalRows, monthRow?.actuals || {})
    let extras = { eventsThisMonth: [], promosThisMonth: [], businessOfMonth: null }
    try {
      const auto = await computeAutoValues(sb, req.studio.id, year, month)
      extras = auto.extras
      for (const m of metrics) {
        if (m.auto && auto.values[m.auto] !== undefined) m.actual = auto.values[m.auto]
        if (m.autoGoal && auto.values[m.autoGoal] != null) m.goal = auto.values[m.autoGoal]
      }
    } catch (e) {
      console.error('[scorecard] auto-compute failed:', e.message)
    }

    res.json({
      year,
      month,
      metrics,
      heroKeys: HERO_KEYS,
      groups: GROUPS,
      groupOrder: GROUP_ORDER,
      thresholds: STATUS_THRESHOLDS,
      reviewedBy: monthRow?.reviewed_by || null,
      reviewedByName,
      reviewedAt: monthRow?.reviewed_at || null,
      updatedAt: monthRow?.updated_at || null,
      ...extras,
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
