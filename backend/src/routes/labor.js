// Team ROI (owner-only): each employee's labor cost (wage + commission) vs the
// revenue they bring in (monthly POS + retail from SAIL), plus worth-keeping
// metrics. Revenue/commission/hours already exist elsewhere; the only new inputs
// are pay rate (employee_comp) and an optional monthly hours override
// (employee_hours_actual). Everything here is gated to the owner.
const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')
const { calcCommission } = require('../services/commissionCalc')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Owner-only for every route — pay data is sensitive.
router.use(authenticate, requireStudio, requireRole('owner'))

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10

// Scheduled hours per user from the shifts table (mirrors goals.js getMonthlyHours).
async function scheduledHoursMap(sb, studioId, month, year) {
  const m = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  const { data } = await sb.from('shifts')
    .select('tsa_id, start_time, end_time')
    .eq('studio_id', studioId)
    .gte('shift_date', `${year}-${m}-01`)
    .lte('shift_date', `${year}-${m}-${String(lastDay).padStart(2, '0')}`)
  const map = {}
  for (const s of data || []) {
    const [sh, sm] = (s.start_time || '0:0').split(':').map(Number)
    const [eh, em] = (s.end_time || '0:0').split(':').map(Number)
    map[s.tsa_id] = (map[s.tsa_id] || 0) + Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60)
  }
  return map
}

// Active, non-owner members of this studio → [{ id, name, email, role }].
async function studioTeam(sb, studioId) {
  const [{ data: usersRes }, { data: members }, { data: inactive }] = await Promise.all([
    sb.auth.admin.listUsers(),
    sb.from('user_studios').select('user_id, role').eq('studio_id', studioId),
    sb.from('user_profiles').select('id').eq('is_active', false),
  ])
  const roleBy = Object.fromEntries((members || []).map(m => [m.user_id, m.role]))
  const inactiveIds = new Set((inactive || []).map(r => r.id))
  return (usersRes?.users || [])
    .filter(u => roleBy[u.id] && roleBy[u.id] !== 'owner' && !inactiveIds.has(u.id))
    .map(u => ({
      id: u.id,
      name: u.user_metadata?.full_name || u.email?.split('@')[0] || 'Team Member',
      email: u.email,
      role: roleBy[u.id],
    }))
}

// ─── GET /api/labor/rates — team + their pay setup ───────────────────────────
router.get('/rates', async (req, res) => {
  try {
    const sb = db()
    const [team, { data: comp }] = await Promise.all([
      studioTeam(sb, req.studio.id),
      sb.from('employee_comp').select('*').eq('studio_id', req.studio.id),
    ])
    const compBy = Object.fromEntries((comp || []).map(c => [c.user_id, c]))
    res.json(team.map(t => {
      const c = compBy[t.id] || {}
      return {
        user_id: t.id, name: t.name, role: t.role,
        pay_type: c.pay_type || 'hourly',
        hourly_rate: c.hourly_rate ?? null,
        monthly_salary: c.monthly_salary ?? null,
        active: c.active !== false,
      }
    }))
  } catch (err) {
    console.error('GET /labor/rates', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── PUT /api/labor/rates/:userId — set pay rate ─────────────────────────────
router.put('/rates/:userId', async (req, res) => {
  const { pay_type, hourly_rate, monthly_salary, active } = req.body
  const num = (v) => (v === '' || v === null || v === undefined) ? null : Number(v)
  const { data, error } = await db().from('employee_comp').upsert({
    studio_id: req.studio.id, user_id: req.params.userId,
    pay_type: pay_type === 'salary' ? 'salary' : 'hourly',
    hourly_rate: num(hourly_rate), monthly_salary: num(monthly_salary),
    ...(active !== undefined ? { active: !!active } : {}),
    updated_by: req.user.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'studio_id,user_id' }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── PUT /api/labor/hours/:userId — override monthly hours (blank = scheduled) ─
router.put('/hours/:userId', async (req, res) => {
  const { month, year, hours } = req.body
  if (!month || !year) return res.status(400).json({ error: 'month and year required' })
  const sb = db()
  const h = (hours === '' || hours === null || hours === undefined) ? null : Number(hours)
  if (h === null) {
    await sb.from('employee_hours_actual').delete()
      .eq('studio_id', req.studio.id).eq('user_id', req.params.userId).eq('month', month).eq('year', year)
    return res.json({ ok: true, hours: null })
  }
  const { data, error } = await sb.from('employee_hours_actual').upsert({
    studio_id: req.studio.id, user_id: req.params.userId, month: Number(month), year: Number(year),
    hours: h, updated_by: req.user.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'studio_id,user_id,month,year' }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Build one employee's ROI row for a given month.
function roiRow(t, { comp, override, goals, studioData, scheduled }) {
  const hours = override != null ? Number(override) : (scheduled || 0)
  const payType = comp?.pay_type || 'hourly'
  const hasRate = comp && (payType === 'salary' ? comp.monthly_salary != null : comp.hourly_rate != null)
  const baseWage = payType === 'salary'
    ? (Number(comp?.monthly_salary) || 0)
    : hours * (Number(comp?.hourly_rate) || 0)
  const commission = calcCommission(goals, t.role, studioData).total || 0
  const totalCost = baseWage + commission
  const revenue = (Number(goals.pos_collected) || 0) + (Number(goals.retail_actual) || 0)
  const net = revenue - totalCost
  return {
    user_id: t.id, name: t.name, role: t.role,
    pay_type: payType,
    hourly_rate: comp?.hourly_rate ?? null,
    monthly_salary: comp?.monthly_salary ?? null,
    has_rate: !!hasRate,
    hours_override: override != null ? Number(override) : null,
    scheduled_hours: round1(scheduled || 0),
    hours: round1(hours),
    base_wage: round2(baseWage),
    commission: round2(commission),
    total_cost: round2(totalCost),
    revenue: round2(revenue),
    net: round2(net),
    ratio: totalCost > 0 ? round2(revenue / totalCost) : null,
    rev_per_hour: hours > 0 ? round2(revenue / hours) : null,
    labor_pct: revenue > 0 ? round2((totalCost / revenue) * 100) : null,
    // Productivity (worth-keeping signals)
    memberships: (Number(goals.sweat_basic) || 0) + (Number(goals.sweat_elite) || 0),
    pos_collected: round2(goals.pos_collected),
    retail_actual: round2(goals.retail_actual),
    outreach: (Number(goals.calls_made) || 0) + (Number(goals.texts_made) || 0),
  }
}

// ─── GET /api/labor/summary?year=&month= — the core comparison ───────────────
router.get('/summary', async (req, res) => {
  const month = Number(req.query.month), year = Number(req.query.year)
  if (!month || !year) return res.status(400).json({ error: 'month and year required' })
  try {
    const sb = db()
    const sid = req.studio.id
    const [team, hoursMap, { data: comp }, { data: overrides }, { data: goalsData }, { data: studioData }] = await Promise.all([
      studioTeam(sb, sid),
      scheduledHoursMap(sb, sid, month, year),
      sb.from('employee_comp').select('*').eq('studio_id', sid),
      sb.from('employee_hours_actual').select('user_id, hours').eq('studio_id', sid).eq('month', month).eq('year', year),
      sb.from('personal_goals').select('*').eq('studio_id', sid).eq('month', month).eq('year', year),
      sb.from('studio_trends').select('*').eq('studio_id', sid).eq('month', month).eq('year', year).maybeSingle(),
    ])
    const compBy = Object.fromEntries((comp || []).map(c => [c.user_id, c]))
    const overrideBy = Object.fromEntries((overrides || []).map(o => [o.user_id, o.hours]))
    const goalsBy = Object.fromEntries((goalsData || []).map(g => [g.tsa_id, g]))
    const GOAL_DEFAULTS = { pos_collected: 0, retail_actual: 0, eft_actual: 0, pif_6mo: 0, pif_12mo: 0, sweat_basic: 0, sweat_elite: 0, calls_made: 0, texts_made: 0 }

    const rows = team
      .filter(t => compBy[t.id]?.active !== false)   // owner can exclude someone
      .map(t => roiRow(t, {
        comp: compBy[t.id],
        override: overrideBy[t.id],
        goals: goalsBy[t.id] || { ...GOAL_DEFAULTS },
        studioData: studioData || {},
        scheduled: hoursMap[t.id] || 0,
      }))
      .sort((a, b) => {
        if (a.ratio == null && b.ratio == null) return b.net - a.net
        if (a.ratio == null) return 1
        if (b.ratio == null) return -1
        return b.ratio - a.ratio
      })

    const sum = (f) => rows.reduce((s, r) => s + (r[f] || 0), 0)
    const totalCost = sum('total_cost'), totalRev = sum('revenue')
    res.json({
      month, year,
      rows,
      totals: {
        total_cost: round2(totalCost),
        revenue: round2(totalRev),
        net: round2(totalRev - totalCost),
        ratio: totalCost > 0 ? round2(totalRev / totalCost) : null,
        hours: round1(sum('hours')),
        headcount: rows.length,
      },
    })
  } catch (err) {
    console.error('GET /labor/summary', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/labor/trend/:userId?months=6 — recent ratio history ────────────
router.get('/trend/:userId', async (req, res) => {
  const months = Math.min(12, Math.max(2, Number(req.query.months) || 6))
  const endM = Number(req.query.month) || (new Date().getMonth() + 1)
  const endY = Number(req.query.year) || new Date().getFullYear()
  try {
    const sb = db()
    const sid = req.studio.id
    const uid = req.params.userId
    const { data: comp } = await sb.from('employee_comp').select('*').eq('studio_id', sid).eq('user_id', uid).maybeSingle()
    const points = []
    for (let i = months - 1; i >= 0; i--) {
      let m = endM - i, y = endY
      while (m <= 0) { m += 12; y -= 1 }
      const [hoursMap, { data: g }, { data: st }, { data: ov }] = await Promise.all([
        scheduledHoursMap(sb, sid, m, y),
        sb.from('personal_goals').select('*').eq('studio_id', sid).eq('tsa_id', uid).eq('month', m).eq('year', y).maybeSingle(),
        sb.from('studio_trends').select('in_the_bank, itb_goal').eq('studio_id', sid).eq('month', m).eq('year', y).maybeSingle(),
        sb.from('employee_hours_actual').select('hours').eq('studio_id', sid).eq('user_id', uid).eq('month', m).eq('year', y).maybeSingle(),
      ])
      const goals = g || { pos_collected: 0, retail_actual: 0 }
      const hours = ov?.hours != null ? Number(ov.hours) : (hoursMap[uid] || 0)
      const baseWage = comp?.pay_type === 'salary' ? (Number(comp.monthly_salary) || 0) : hours * (Number(comp?.hourly_rate) || 0)
      const commission = calcCommission(goals, 'tsa', st || {}).total || 0
      const totalCost = baseWage + commission
      const revenue = (Number(goals.pos_collected) || 0) + (Number(goals.retail_actual) || 0)
      points.push({ month: m, year: y, revenue: round2(revenue), total_cost: round2(totalCost), ratio: totalCost > 0 ? round2(revenue / totalCost) : null })
    }
    res.json(points)
  } catch (err) {
    console.error('GET /labor/trend', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
