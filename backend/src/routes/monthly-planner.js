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

const pad = n => String(n).padStart(2, '0')
const monthBounds = (year, month) => ({
  start: `${year}-${pad(month)}-01`,
  end:   `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`,
})
const prevMonth = (year, month) => (month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 })

// Hours between two 'HH:MM[:SS]' clock strings (same day).
function shiftHours(start, end) {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const mins = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0))
  return mins > 0 ? mins / 60 : 0
}

// Staffed hours for a month, bucketed by person and week-of-month (1–5).
async function hoursByPersonWeek(db, studioId, year, month) {
  const { start, end } = monthBounds(year, month)
  const { data: shifts } = await db.from('shifts')
    .select('tsa_id, shift_date, start_time, end_time')
    .eq('studio_id', studioId).gte('shift_date', start).lte('shift_date', end)

  const { data: { users } } = await db.auth.admin.listUsers({ perPage: 200 })
  const nameMap = {}
  for (const u of users || []) nameMap[u.id] = u.user_metadata?.full_name || u.email?.split('@')[0] || 'Team Member'

  const byPerson = {}
  for (const s of shifts || []) {
    if (!s.tsa_id) continue
    const day = Number((s.shift_date || '').slice(8, 10))
    const wk = Math.min(5, Math.max(1, Math.ceil(day / 7)))
    const h = shiftHours(s.start_time, s.end_time)
    const p = byPerson[s.tsa_id] || (byPerson[s.tsa_id] = { id: s.tsa_id, name: nameMap[s.tsa_id] || 'Team Member', weeks: {}, total: 0 })
    p.weeks[wk] = Math.round(((p.weeks[wk] || 0) + h) * 10) / 10
    p.total = Math.round((p.total + h) * 10) / 10
  }
  return Object.values(byPerson).sort((a, b) => b.total - a.total)
}

async function oneRow(db, table, studioId, year, month, columns = '*') {
  const { data } = await db.from(table).select(columns)
    .eq('studio_id', studioId).eq('year', year).eq('month', month).maybeSingle()
  return data || null
}

// ─── GET /api/monthly-planner/:year/:month ────────────────────────────────────
router.get('/:year/:month', ...GUARD, async (req, res) => {
  const year = parseInt(req.params.year)
  const month = parseInt(req.params.month)
  if (!year || !month || month < 1 || month > 12) return res.status(400).json({ error: 'Invalid year/month' })
  const db = supabase()
  const sid = req.studio.id
  const prev = prevMonth(year, month)

  try {
    const [plan, lastYearGoals, lastYearTrends, priorMonthTrends, hours, holidaysRes] = await Promise.all([
      db.from('monthly_plans').select('*').eq('studio_id', sid).eq('year', year).eq('month', month).maybeSingle().then(r => r.data),
      oneRow(db, 'studio_goals',  sid, year - 1, month),
      oneRow(db, 'studio_trends', sid, year - 1, month),
      oneRow(db, 'studio_trends', sid, prev.year, prev.month),
      hoursByPersonWeek(db, sid, prev.year, prev.month),
      db.from('blocked_days')
        .select('block_date, label, block_type')
        .gte('block_date', monthBounds(year, month).start)
        .lte('block_date', monthBounds(year, month).end)
        .order('block_date'),
    ])

    res.json({
      plan: plan || { studio_id: sid, year, month, content: {}, reviewed_at: null, reviewed_by: null },
      reference: {
        prior: { year: prev.year, month: prev.month },
        lastYearGoals, lastYearTrends, priorMonthTrends,
        hoursByPersonWeek: hours,
        holidays: holidaysRes.data || [],
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
