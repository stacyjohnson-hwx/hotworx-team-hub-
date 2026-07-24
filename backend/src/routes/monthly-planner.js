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
    const [plan, lastYearGoals, lastYearTrends, thisMonthTrends, priorMonthTrends, customHolidays] = await Promise.all([
      db.from('monthly_plans').select('*').eq('studio_id', sid).eq('year', year).eq('month', month).maybeSingle().then(r => r.data),
      oneRow(db, 'studio_goals',  sid, year - 1, month),
      oneRow(db, 'studio_trends', sid, year - 1, month),
      oneRow(db, 'studio_trends', sid, year, month),
      oneRow(db, 'studio_trends', sid, prev.year, prev.month),
      db.from('planner_holidays').select('*').eq('studio_id', sid).eq('month', month).order('day', { nullsFirst: false }).then(r => r.data || []),
    ])

    res.json({
      plan: plan || { studio_id: sid, year, month, content: {}, reviewed_at: null, reviewed_by: null },
      reference: {
        prior: { year: prev.year, month: prev.month },
        lastYearGoals,                                     // targets set last year (often none)
        lastYearActuals: actualsFromTrends(lastYearTrends), // what actually happened last year
        thisYearActuals: actualsFromTrends(thisMonthTrends),// what's happened so far this month (null until logged)
        lastYearTrends, thisMonthTrends, priorMonthTrends,
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

// ─── Team Coaching tab ────────────────────────────────────────────────────────
// Reviews the PREVIOUS month and surfaces employees who ran net-negative on Team
// ROI, with the coaching signals. PAY-SAFE: never returns cost/wage/commission;
// managers get a severity band only, the owner also gets the exact deficit.
const { computeRoiRows } = require('./labor')

// Cleaning "task active on date" rule (mirrors scorecard.js).
function cleaningActiveOnDate(task, dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z'); const dow = d.getUTCDay()
  switch (task.frequency) {
    case 'daily': return true
    case 'weekly': return task.day_of_week === dow
    case 'specific_days': return Array.isArray(task.days_of_week) && task.days_of_week.includes(dow)
    case 'monthly': return task.day_of_month === d.getUTCDate()
    case 'quarterly': return Array.isArray(task.quarterly_dates) && task.quarterly_dates.includes(dateStr)
    case 'one_off': return task.one_off_date === dateStr
    default: return false
  }
}
const bandFor = (deficit) => deficit >= 800 ? 'deep' : deficit >= 250 ? 'under' : 'slight'
const dir = (now, was) => { const a = Number(now) || 0, b = Number(was) || 0; return a > b * 1.02 ? 'up' : a < b * 0.98 ? 'down' : 'flat' }
const uniq = (arr) => [...new Set(arr)]

router.get('/coaching/:year/:month', ...GUARD, async (req, res) => {
  const year = parseInt(req.params.year), month = parseInt(req.params.month)
  if (!year || !month || month < 1 || month > 12) return res.status(400).json({ error: 'Invalid year/month' })
  const isOwner = req.studio.role === 'owner' || req.role === 'owner'
  const sb = supabase(), sid = req.studio.id
  const { year: py, month: pm } = prevMonth(year, month)          // review the previous month
  const p2 = prevMonth(py, pm)                                    // month before that (for trend)
  const mm = String(pm).padStart(2, '0')
  const lastDay = new Date(py, pm, 0).getDate()
  const start = `${py}-${mm}-01`, end = `${py}-${mm}-${String(lastDay).padStart(2, '0')}`

  try {
    const [{ rows }, prev] = await Promise.all([
      computeRoiRows(sb, sid, pm, py),
      computeRoiRows(sb, sid, p2.month, p2.year),
    ])
    const totalHours = rows.reduce((s, r) => s + (r.hours || 0), 0)
    const prevBy = Object.fromEntries(prev.rows.map(r => [r.user_id, r]))
    // Show EVERY employee, worst-first: net-negative (most under first), then
    // people with no pay rate set, then those covering their cost.
    const all = [...rows].sort((a, b) => {
      const g = (r) => !r.has_rate ? 1 : (r.net < 0 ? 0 : 2)
      return g(a) - g(b) || a.net - b.net
    })
    if (!all.length) return res.json({ reviewing: { year: py, month: pm }, is_owner: isOwner, employees: [] })
    const ids = all.map(r => r.user_id)

    // Bulk-load every per-person signal for the reviewed month (all scoped to the flagged set).
    const [goalsRes, targetsRes, shiftsRes, eodRes, mktRes, b2bRes, terrRes, outreachRes, recogRes, tpRes, cleanTasksRes, cleanCompRes] = await Promise.all([
      sb.from('personal_goals').select('tsa_id, pos_collected, retail_actual, eft_actual, sweat_basic, sweat_elite, total_memberships, calls_made, texts_made').eq('studio_id', sid).eq('month', pm).eq('year', py).in('tsa_id', ids),
      sb.from('studio_goals').select('memberships_target, retail_target, eft_target').eq('studio_id', sid).eq('month', pm).eq('year', py).maybeSingle(),
      sb.from('shifts').select('tsa_id, shift_date').eq('studio_id', sid).gte('shift_date', start).lte('shift_date', end).in('tsa_id', ids),
      sb.from('eod_submissions').select('submitted_by, shift_date').eq('studio_id', sid).gte('shift_date', start).lte('shift_date', end).in('submitted_by', ids),
      sb.from('marketing_task_completions').select('staff_id').eq('studio_id', sid).gte('completion_date', start).lte('completion_date', end).in('staff_id', ids),
      sb.from('b2b_interactions').select('logged_by').eq('studio_id', sid).gte('logged_at', `${start}T00:00:00Z`).lte('logged_at', `${end}T23:59:59.999Z`).in('logged_by', ids),
      sb.from('territory_visits').select('visited_by').eq('studio_id', sid).gte('visit_date', start).lte('visit_date', end).in('visited_by', ids),
      sb.from('outreach_logs').select('tsa_id, calls_made, texts_made').eq('studio_id', sid).gte('log_date', start).lte('log_date', end).in('tsa_id', ids),
      sb.from('onboarding_recognition_tasks').select('type, completed_by').eq('studio_id', sid).eq('status', 'completed').gte('completed_at', `${start}T00:00:00Z`).lte('completed_at', `${end}T23:59:59.999Z`).in('completed_by', ids),
      sb.from('onboarding_touchpoint_log').select('completed_by').eq('studio_id', sid).eq('done', true).gte('completed_at', `${start}T00:00:00Z`).lte('completed_at', `${end}T23:59:59.999Z`).in('completed_by', ids),
      sb.from('cleaning_tasks').select('*').eq('studio_id', sid).eq('active', true),
      sb.from('cleaning_completions').select('task_id, completion_date').eq('studio_id', sid).gte('completion_date', start).lte('completion_date', end),
    ])
    const goalsBy = Object.fromEntries((goalsRes.data || []).map(g => [g.tsa_id, g]))
    const targets = targetsRes.data || {}
    const shiftDatesBy = {}; for (const s of shiftsRes.data || []) (shiftDatesBy[s.tsa_id] = shiftDatesBy[s.tsa_id] || []).push(s.shift_date)
    const eodDatesBy = {}; for (const e of eodRes.data || []) (eodDatesBy[e.submitted_by] = eodDatesBy[e.submitted_by] || []).push(e.shift_date)
    const countBy = (arr, key) => arr.reduce((m, r) => { m[r[key]] = (m[r[key]] || 0) + 1; return m }, {})
    const mktBy = countBy(mktRes.data || [], 'staff_id')
    const b2bBy = countBy(b2bRes.data || [], 'logged_by')
    const terrBy = countBy(terrRes.data || [], 'visited_by')
    const birthdayBy = countBy((recogRes.data || []).filter(r => r.type === 'birthday'), 'completed_by')
    const thankyouBy = countBy((recogRes.data || []).filter(r => r.type === 'thank_you_card'), 'completed_by')
    const tpBy = countBy(tpRes.data || [], 'completed_by')
    const outreachBy = {}; for (const o of outreachRes.data || []) { const x = outreachBy[o.tsa_id] = outreachBy[o.tsa_id] || { c: 0, t: 0 }; x.c += o.calls_made || 0; x.t += o.texts_made || 0 }
    const activeTasks = cleanTasksRes.data || []
    const compByDate = {}; for (const c of cleanCompRes.data || []) (compByDate[c.completion_date] = compByDate[c.completion_date] || new Set()).add(c.task_id)

    const allocGoal = (target, hours) => (target != null && totalHours > 0) ? Math.round(Number(target) * (hours / totalHours)) : null
    const employees = all.map(r => {
      const g = goalsBy[r.user_id] || {}
      const deficit = Math.round(-r.net * 100) / 100
      const status = !r.has_rate ? 'no_rate' : (r.net < 0 ? 'negative' : 'covered')
      const dates = uniq(shiftDatesBy[r.user_id] || [])
      // Cleaning coverage on the days they worked (shared credit across staff on-shift).
      let due = 0, doneC = 0
      for (const dt of dates) for (const task of activeTasks) if (cleaningActiveOnDate(task, dt)) { due++; if (compByDate[dt]?.has(task.id)) doneC++ }
      const eodDates = uniq(eodDatesBy[r.user_id] || []).filter(d => dates.includes(d))
      const memActual = (Number(g.sweat_basic) || 0) + (Number(g.sweat_elite) || 0) || (Number(g.total_memberships) || 0)
      const oc = outreachBy[r.user_id] || { c: 0, t: 0 }
      const pr = prevBy[r.user_id] || {}
      return {
        user_id: r.user_id, name: r.name, role: r.role,
        revenue: r.revenue,
        status,                                          // 'negative' | 'covered' | 'no_rate'
        severity_band: status === 'negative' ? bandFor(deficit) : null,
        ...(isOwner && r.has_rate ? { net_exact: r.net } : {}),   // signed; owner sees pay anyway
        goal: {
          members: { goal: allocGoal(targets.memberships_target, r.hours), actual: memActual },
          retail:  { goal: allocGoal(targets.retail_target, r.hours),      actual: Math.round(Number(g.retail_actual) || 0) },
          eft:     { goal: allocGoal(targets.eft_target, r.hours),         actual: Math.round(Number(g.eft_actual) || 0) },
        },
        hours: r.hours,
        cleaning_pct: due > 0 ? Math.round((doneC / due) * 100) : null,
        marketing_count: mktBy[r.user_id] || 0,
        b2b_count: (b2bBy[r.user_id] || 0) + (terrBy[r.user_id] || 0),
        outreach: {
          teamhub_calls: oc.c, teamhub_texts: oc.t, teamhub_touchpoints: tpBy[r.user_id] || 0,
          sail_calls: Number(g.calls_made) || 0, sail_texts: Number(g.texts_made) || 0,
        },
        eod_submission_rate: dates.length ? Math.round((eodDates.length / dates.length) * 100) : null,
        birthday_outreach: birthdayBy[r.user_id] || 0,
        thank_you_cards: thankyouBy[r.user_id] || 0,
        trend: {
          revenue: dir(r.revenue, pr.revenue),          // this month's revenue vs the month before
          outreach: dir(r.outreach, pr.outreach),        // SAIL calls+texts vs the month before
        },
      }
    })
    res.json({ reviewing: { year: py, month: pm }, is_owner: isOwner, employees })
  } catch (err) {
    console.error('GET /monthly-planner/coaching', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── Team Coaching: action items + 1:1 notes (per subject employee) ───────────
router.get('/coaching/items/:userId', ...GUARD, async (req, res) => {
  const [items, notes] = await Promise.all([
    supabase().from('team_coaching_items').select('*').eq('studio_id', req.studio.id).eq('subject_user_id', req.params.userId).order('done').order('due_date', { nullsFirst: false }),
    supabase().from('team_coaching_notes').select('*').eq('studio_id', req.studio.id).eq('subject_user_id', req.params.userId).order('created_at', { ascending: false }),
  ])
  res.json({ items: items.data || [], notes: notes.data || [] })
})
router.post('/coaching/items', ...GUARD, async (req, res) => {
  const { subject_user_id, text, due_date } = req.body
  if (!subject_user_id || !(text || '').trim()) return res.status(400).json({ error: 'subject_user_id and text required' })
  const { data, error } = await supabase().from('team_coaching_items').insert({
    studio_id: req.studio.id, subject_user_id, text: text.trim(), due_date: due_date || null, created_by: req.user.id,
  }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})
router.put('/coaching/items/:id', ...GUARD, async (req, res) => {
  const patch = {}
  if (req.body.done !== undefined) { patch.done = !!req.body.done; patch.done_at = req.body.done ? new Date().toISOString() : null }
  if (req.body.text !== undefined) patch.text = String(req.body.text).trim()
  if (req.body.due_date !== undefined) patch.due_date = req.body.due_date || null
  const { data, error } = await supabase().from('team_coaching_items').update(patch)
    .eq('id', req.params.id).eq('studio_id', req.studio.id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})
router.delete('/coaching/items/:id', ...GUARD, async (req, res) => {
  const { error } = await supabase().from('team_coaching_items').delete().eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})
router.post('/coaching/notes', ...GUARD, async (req, res) => {
  const { subject_user_id, note } = req.body
  if (!subject_user_id || !(note || '').trim()) return res.status(400).json({ error: 'subject_user_id and note required' })
  const { data, error } = await supabase().from('team_coaching_notes').insert({
    studio_id: req.studio.id, subject_user_id, note: note.trim(), created_by: req.user.id,
  }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})
router.delete('/coaching/notes/:id', ...GUARD, async (req, res) => {
  const { error } = await supabase().from('team_coaching_notes').delete().eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── Seasonal Prep tab ────────────────────────────────────────────────────────
// Orders / maintenance / escalations logged in this MONTH across prior years, plus
// this-year trailing (a stand-in until real prior-year history accumulates).
router.get('/seasonal/:year/:month', ...GUARD, async (req, res) => {
  const year = parseInt(req.params.year), month = parseInt(req.params.month)
  if (!year || !month || month < 1 || month > 12) return res.status(400).json({ error: 'Invalid year/month' })
  const sb = supabase(), sid = req.studio.id
  const mm = String(month).padStart(2, '0')
  // Every past instance of this calendar month, back a few years.
  const spans = []
  for (let y = year - 1; y >= year - 4; y--) spans.push({ y, from: `${y}-${mm}-01`, to: `${y}-${mm}-${new Date(y, month, 0).getDate()}` })
  const earliest = spans[spans.length - 1].from
  const latest = `${year}-${mm}-${new Date(year, month, 0).getDate()}`   // include this year's same month if past
  const inMonth = (created) => { const c = String(created).slice(0, 7); return c.slice(5) === mm }
  try {
    const [ord, mnt, esc, thisNote, lastNote] = await Promise.all([
      sb.from('orders').select('item_name, quantity, category, vendor, est_cost, status, created_at').eq('studio_id', sid).gte('created_at', earliest).lte('created_at', `${latest}T23:59:59.999Z`),
      sb.from('maintenance_logs').select('title, area, priority, status, created_at').eq('studio_id', sid).gte('created_at', earliest).lte('created_at', `${latest}T23:59:59.999Z`),
      sb.from('escalation_logs').select('title, type, member_name, priority, status, created_at').eq('studio_id', sid).gte('created_at', earliest).lte('created_at', `${latest}T23:59:59.999Z`),
      sb.from('studio_trends').select('manager_notes, updated_at').eq('studio_id', sid).eq('year', year).eq('month', month).maybeSingle(),
      sb.from('studio_trends').select('manager_notes, updated_at').eq('studio_id', sid).eq('year', year - 1).eq('month', month).maybeSingle(),
    ])
    const shape = (rows) => (rows || []).filter(r => inMonth(r.created_at))
      .map(r => ({ ...r, year: Number(String(r.created_at).slice(0, 4)) }))
      .sort((a, b) => b.created_at < a.created_at ? -1 : 1)
    res.json({
      month, current_year: year,
      orders: shape(ord.data), maintenance: shape(mnt.data), escalations: shape(esc.data),
      // The Studio Trends "manager notes" for this month — last year's to reflect on,
      // this year's to leave for next year.
      trends_notes: {
        this_year: thisNote.data?.manager_notes || '',
        last_year: lastNote.data?.manager_notes || '',
      },
      note: 'History accumulates over time — prior-year data starts May 2026.',
    })
  } catch (err) {
    console.error('GET /monthly-planner/seasonal', err)
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/monthly-planner/seasonal/:year/:month/notes — save this month's Studio
// Trends manager_notes (leave a reflection for next year). Update-or-insert so it
// never nulls the month's other trends fields.
router.put('/seasonal/:year/:month/notes', ...GUARD, async (req, res) => {
  const year = parseInt(req.params.year), month = parseInt(req.params.month)
  if (!year || !month || month < 1 || month > 12) return res.status(400).json({ error: 'Invalid year/month' })
  const notes = typeof req.body?.notes === 'string' ? req.body.notes : ''
  const sb = supabase(), sid = req.studio.id
  try {
    const { data: existing } = await sb.from('studio_trends').select('id').eq('studio_id', sid).eq('year', year).eq('month', month).maybeSingle()
    if (existing) {
      await sb.from('studio_trends').update({ manager_notes: notes, updated_by: req.user.id, updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      await sb.from('studio_trends').insert({ studio_id: sid, year, month, manager_notes: notes, updated_by: req.user.id })
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('PUT /monthly-planner/seasonal/notes', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
