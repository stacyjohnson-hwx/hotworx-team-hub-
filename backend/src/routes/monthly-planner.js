/**
 * /api/monthly-planner
 *
 * One editable planning document per studio per month (owner/manager). Stores
 * planner-owned content in monthly_plans.content, and surfaces read-only
 * reference numbers that have no single existing endpoint: last-year and
 * prior-month studio numbers, staffed hours by person/week for the prior month,
 * and the month's marked holidays. Everything else (current goals, B2B,
 * territories, events, Team ROI) the page fetches from its existing endpoints.
 */
const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')
const authenticate = require('../middleware/authMiddleware')

const supabase = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const GUARD = [authenticate, requireStudio, requireRole('owner', 'manager')]

const prevMonth = (year, month) => (month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 })

// Last year's ACTUALS, shaped like the planner's goal fields. Studios often have
// no goal row for last year but always have trends, so this is what we surface.
function actualsFromTrends(t) {
  if (!t) return null
  const n = v => (v == null ? 0 : Number(v))
  const rate = (num, den) => (n(den) > 0 ? Math.round((n(num) / n(den)) * 100) : null)
  return {
    eft_target:               t.eft_increase ?? null,
    memberships_target:       t.new_members ?? null,
    retail_target:            t.retail ?? null,
    in_the_bank_target:       t.in_the_bank ?? null,
    total_leads_target:       t.leads ?? null,
    conversion_rate_target:   rate(t.new_members, t.leads),
    checkin_show_rate_target: rate(t.red_appts_held, t.red_appts_booked),
    close_rate_target:        rate(t.new_members, t.red_appts_held),
  }
}

async function oneRow(db, table, studioId, year, month, columns = '*') {
  const { data } = await db.from(table).select(columns)
    .eq('studio_id', studioId).eq('year', year).eq('month', month).maybeSingle()
  return data || null
}

// ─── Custom holidays (recur every year for that month) ────────────────────────
// Declared before /:year/:month so "holidays" isn't parsed as a year.

// POST /api/monthly-planner/holidays  { month, label, day? }
router.post('/holidays', ...GUARD, async (req, res) => {
  const month = parseInt(req.body?.month)
  const label = (req.body?.label || '').trim()
  const day = req.body?.day ? parseInt(req.body.day) : null
  if (!month || month < 1 || month > 12) return res.status(400).json({ error: 'Valid month required' })
  if (!label) return res.status(400).json({ error: 'Label required' })

  const { data, error } = await supabase().from('planner_holidays').insert({
    studio_id: req.studio.id, month, label,
    day: day && day >= 1 && day <= 31 ? day : null,
    created_by: req.user.id,
  }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// DELETE /api/monthly-planner/holidays/:id
router.delete('/holidays/:id', ...GUARD, async (req, res) => {
  const { error } = await supabase().from('planner_holidays')
    .delete().eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── GET /api/monthly-planner/:year/:month ────────────────────────────────────
router.get('/:year/:month', ...GUARD, async (req, res) => {
  const year = parseInt(req.params.year)
  const month = parseInt(req.params.month)
  if (!year || !month || month < 1 || month > 12) return res.status(400).json({ error: 'Invalid year/month' })
  const db = supabase()
  const sid = req.studio.id
  const prev = prevMonth(year, month)

  try {
    const [plan, lastYearGoals, lastYearTrends, priorMonthTrends, customHolidays] = await Promise.all([
      db.from('monthly_plans').select('*').eq('studio_id', sid).eq('year', year).eq('month', month).maybeSingle().then(r => r.data),
      oneRow(db, 'studio_goals',  sid, year - 1, month),
      oneRow(db, 'studio_trends', sid, year - 1, month),
      oneRow(db, 'studio_trends', sid, prev.year, prev.month),
      db.from('planner_holidays').select('*').eq('studio_id', sid).eq('month', month).order('day', { nullsFirst: false }).then(r => r.data || []),
    ])

    res.json({
      plan: plan || { studio_id: sid, year, month, content: {}, reviewed_at: null, reviewed_by: null },
      reference: {
        prior: { year: prev.year, month: prev.month },
        lastYearGoals,                                   // targets set last year (often none)
        lastYearActuals: actualsFromTrends(lastYearTrends), // what actually happened last year
        lastYearTrends, priorMonthTrends,
        customHolidays,
      },
    })
  } catch (err) {
    console.error('GET /monthly-planner', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── PUT /api/monthly-planner/:year/:month ────────────────────────────────────
// Upsert the planner content for this studio/month.
router.put('/:year/:month', ...GUARD, async (req, res) => {
  const year = parseInt(req.params.year)
  const month = parseInt(req.params.month)
  if (!year || !month || month < 1 || month > 12) return res.status(400).json({ error: 'Invalid year/month' })
  const content = (req.body && typeof req.body.content === 'object' && req.body.content) || {}

  const { data, error } = await supabase().from('monthly_plans').upsert({
    studio_id: req.studio.id, year, month, content,
    updated_by: req.user.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'studio_id,year,month' }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── POST /api/monthly-planner/:year/:month/review ────────────────────────────
// Toggle the "plan finalized" sign-off. Body: { reviewed: true|false }
router.post('/:year/:month/review', ...GUARD, async (req, res) => {
  const year = parseInt(req.params.year)
  const month = parseInt(req.params.month)
  if (!year || !month || month < 1 || month > 12) return res.status(400).json({ error: 'Invalid year/month' })
  const reviewed = !!req.body?.reviewed

  const { data, error } = await supabase().from('monthly_plans').upsert({
    studio_id: req.studio.id, year, month,
    reviewed_by: reviewed ? req.user.id : null,
    reviewed_at: reviewed ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'studio_id,year,month' }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

module.exports = router
