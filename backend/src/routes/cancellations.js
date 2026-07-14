const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')
const authenticate = require('../middleware/authMiddleware')
const { todayInChicago } = require('../utils/dates')
const { scoreWinback } = require('../services/winbackScore')
const { scheduleWinbacks } = require('../services/winbackSchedule')

const supabase = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const REASONS  = ['non_payment', 'cost', 'not_using', 'no_results', 'moving', 'medical', 'unhappy', 'competitor', 'other']
const OUTCOMES = ['saved', 'pending', 'cancelled']

// A cancellation record and its member-roster record are the same person split across
// two tables. This links them so the Cancellations & Saves page can be the single home:
// it backfills contact info (email/phone) AND workout history (sessions, last visit,
// workouts tried) onto each cancellation. Match by SAIL customer_id first, then by
// normalized name (the cancellation export numbers members differently than the roster,
// so name is the higher-coverage match). Returns row → { email, phone, roster_member_id,
// total_sessions, visit_days, workouts_tried, last_booking_date } (nulls when unmatched).
const normName = (s) => String(s || '').toLowerCase().replace(/\s*-\s*dup$/, '').replace(/\s+/g, ' ').trim()
const EMPTY_MEMBER = { email: null, phone: null, roster_member_id: null, total_sessions: null, visit_days: null, workouts_tried: null, last_booking_date: null }
// Supabase caps a select at 1000 rows; page through so studios with >1000 members
// (Pewaukee) don't silently drop people from the lookup.
async function fetchAll(sb, table, columns, studioId) {
  const PAGE = 1000
  let out = [], from = 0
  for (;;) {
    const { data, error } = await sb.from(table).select(columns).eq('studio_id', studioId).range(from, from + PAGE - 1)
    if (error || !data || !data.length) break
    out = out.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}
async function buildMemberLookup(studioId) {
  const sb = supabase()
  const [members, activity] = await Promise.all([
    fetchAll(sb, 'onboarding_members', 'id, customer_id, full_name, email, phone', studioId),
    fetchAll(sb, 'onboarding_member_activity', 'member_id, visit_days, total_sessions, workouts_tried, last_booking_date', studioId),
  ])
  const actBy = new Map((activity || []).map(a => [a.member_id, a]))
  const byId = new Map(), byName = new Map()
  for (const m of members || []) {
    const a = actBy.get(m.id) || {}
    const info = {
      email: m.email || null, phone: m.phone || null, roster_member_id: m.id,
      total_sessions: a.total_sessions ?? null, visit_days: a.visit_days ?? null,
      workouts_tried: a.workouts_tried ?? null, last_booking_date: a.last_booking_date ?? null,
    }
    if (m.customer_id) byId.set(String(m.customer_id), info)
    const n = normName(m.full_name)
    if (n && !byName.has(n)) byName.set(n, info)
  }
  return (row) => byId.get(String(row.member_id)) || byName.get(normName(row.member_name)) || EMPTY_MEMBER
}

// Derive the follow-up date + terminal date from the outcome (PRD §3–4).
// Cancelled → post-cancel learning call 7 days out; Pending → a follow-up date.
function deriveDates({ outcome, date_requested, follow_up_date }) {
  const base = date_requested ? new Date(date_requested + 'T00:00:00') : new Date()
  const plus = (days) => { const d = new Date(base); d.setDate(d.getDate() + days); return d.toISOString().split('T')[0] }
  if (outcome === 'cancelled') return { follow_up_date: follow_up_date || plus(7), date_resolved: null }
  if (outcome === 'pending')   return { follow_up_date: follow_up_date || plus(7), date_resolved: null }
  return { follow_up_date: follow_up_date || null, date_resolved: todayInChicago() } // saved = resolved
}

// GET /api/cancellations  (filters: reason, outcome, win_back_step, handled_by)
router.get('/', authenticate, requireStudio, async (req, res) => {
  let q = supabase().from('cancellation_log').select('*')
    .eq('studio_id', req.studio.id)
    .order('date_requested', { ascending: false })
  const { reason, outcome, win_back_step, handled_by } = req.query
  if (reason)        q = q.eq('cancel_reason', reason)
  if (outcome)       q = q.eq('outcome', outcome)
  if (win_back_step) q = q.eq('win_back_step', win_back_step)
  if (handled_by)    q = q.eq('handled_by', handled_by)
  const { data, error } = await q
  if (error) return res.status(500).json({ error: error.message })

  const { data: { users } } = await supabase().auth.admin.listUsers({ perPage: 200 })
  const userMap = {}
  for (const u of users || []) userMap[u.id] = u.user_metadata?.full_name || u.email?.split('@')[0] || 'Team Member'

  const memberOf = await buildMemberLookup(req.studio.id)
  const today = todayInChicago()
  res.json((data || []).map(r => {
    const merged = { ...r, ...memberOf(r) }
    return {
      ...merged,
      handled_by_name: r.handled_by ? (userMap[r.handled_by] || 'Team Member') : null,
      ...scoreWinback(merged, today),   // winback_score / winback_tier / winback_parts
    }
  }))
})

// GET /api/cancellations/report  — analytics for the studio
router.get('/report', authenticate, requireStudio, async (req, res) => {
  const { data: rows, error } = await supabase().from('cancellation_log').select('*')
    .eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })

  const { data: { users } } = await supabase().auth.admin.listUsers({ perPage: 200 })
  const nameMap = {}
  for (const u of users || []) nameMap[u.id] = u.user_metadata?.full_name || u.email?.split('@')[0] || 'Team Member'

  const all = rows || []
  const total = all.length
  const saved = all.filter(r => r.outcome === 'saved').length
  const cancelled = all.filter(r => r.outcome === 'cancelled').length
  const pending = all.filter(r => r.outcome === 'pending').length
  const reactivated = all.filter(r => r.win_back_step === 'reactivated').length
  const freeMonthGiven = all.filter(r => r.offer_accepted === 'free_month').length

  const byReason = {}, byOutcome = {}, byCompetitor = {}
  // Monthly recurring revenue at stake, split by outcome.
  let savedMrr = 0, lostMrr = 0, pendingMrr = 0
  for (const r of all) {
    byReason[r.cancel_reason] = (byReason[r.cancel_reason] || 0) + 1
    byOutcome[r.outcome] = (byOutcome[r.outcome] || 0) + 1
    const mrr = Number(r.monthly_payment) || 0
    if      (r.outcome === 'saved')     savedMrr   += mrr
    else if (r.outcome === 'cancelled') lostMrr    += mrr
    else if (r.outcome === 'pending')   pendingMrr += mrr
    // Which competitors are pulling members away.
    if (r.cancel_reason === 'competitor' && r.competitor_name) {
      const key = r.competitor_name.trim()
      byCompetitor[key] = (byCompetitor[key] || 0) + 1
    }
  }
  const round2 = n => Math.round(n * 100) / 100

  // Per-rep: requests handled, saves, free months given — the coaching signal.
  const repAgg = {}
  for (const r of all) {
    if (!r.handled_by) continue
    const a = repAgg[r.handled_by] || (repAgg[r.handled_by] = { id: r.handled_by, name: nameMap[r.handled_by] || 'Team Member', requests: 0, saved: 0, freeMonth: 0 })
    a.requests++
    if (r.outcome === 'saved') a.saved++
    if (r.offer_accepted === 'free_month') a.freeMonth++
  }
  const byRep = Object.values(repAgg).sort((a, b) => b.requests - a.requests)

  // "What could we have done better" feed.
  const feedback = all
    .filter(r => r.postcancel_feedback)
    .sort((a, b) => (b.date_requested || '').localeCompare(a.date_requested || ''))
    .map(r => ({ id: r.id, member_name: r.member_name, date: r.date_requested, would_return: r.would_return, postcancel_feedback: r.postcancel_feedback }))

  res.json({
    total, saved, cancelled, pending, reactivated, freeMonthGiven,
    savedMrr: round2(savedMrr), lostMrr: round2(lostMrr), pendingMrr: round2(pendingMrr),
    byReason, byOutcome, byCompetitor, byRep, feedback,
  })
})

// GET /api/cancellations/followups — the win-back queue: unresolved entries with
// a follow-up date on or before today, soonest first. Drives the "reach out
// today" workflow so saves in progress don't go stale.
router.get('/followups', authenticate, requireStudio, async (req, res) => {
  const today = todayInChicago()
  const { data, error } = await supabase().from('cancellation_log')
    .select('*')
    .eq('studio_id', req.studio.id)
    .in('outcome', ['pending', 'cancelled'])
    .is('date_resolved', null)
    .not('follow_up_date', 'is', null)
    .lte('follow_up_date', today)
    .order('follow_up_date', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })

  const { data: { users } } = await supabase().auth.admin.listUsers({ perPage: 200 })
  const userMap = {}
  for (const u of users || []) userMap[u.id] = u.user_metadata?.full_name || u.email?.split('@')[0] || 'Team Member'

  const memberOf = await buildMemberLookup(req.studio.id)
  res.json((data || []).map(r => {
    const merged = { ...r, ...memberOf(r) }
    return {
      ...merged,
      handled_by_name: r.handled_by ? (userMap[r.handled_by] || 'Team Member') : null,
      ...scoreWinback(merged, today),
      days_overdue: Math.round((new Date(today) - new Date(r.follow_up_date)) / 86400000),
    }
  }))
})

// POST /api/cancellations
router.post('/', authenticate, requireStudio, async (req, res) => {
  const b = req.body
  if (!b.member_name) return res.status(400).json({ error: 'member_name is required' })
  if (!REASONS.includes(b.cancel_reason)) return res.status(400).json({ error: 'valid cancel_reason is required' })
  if (b.cancel_reason === 'other' && !b.reason_notes) return res.status(400).json({ error: 'reason_notes required when reason is Other' })

  // Default to 'pending' (not 'saved') so a forgotten dropdown doesn't inflate
  // the save rate — an unset outcome is an in-progress win-back, not a win.
  const outcome = OUTCOMES.includes(b.outcome) ? b.outcome : 'pending'
  const dates = deriveDates({ outcome, date_requested: b.date_requested, follow_up_date: b.follow_up_date })

  const { data, error } = await supabase().from('cancellation_log').insert({
    studio_id: req.studio.id,
    member_name: b.member_name,
    member_id: b.member_id || null,
    date_requested: b.date_requested || todayInChicago(),
    handled_by: b.handled_by || req.user.id,
    cancel_reason: b.cancel_reason,
    reason_notes: b.reason_notes || null,
    competitor_name: b.cancel_reason === 'competitor' ? (b.competitor_name || null) : null,
    likely_to_return: !!b.likely_to_return,
    conversation_notes: b.conversation_notes || null,
    offers_presented: Array.isArray(b.offers_presented) ? b.offers_presented : [],
    offer_accepted: b.offer_accepted || 'none',
    goal_recaptured: !!b.goal_recaptured,
    win_back_step: b.win_back_step || (outcome === 'cancelled' ? 'call_scheduled' : 'at_pos'),
    outcome,
    follow_up_date: dates.follow_up_date,
    date_resolved: dates.date_resolved,
    created_by: req.user.id,
  }).select().single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// PUT /api/cancellations/:id  — update flow / record post-cancel call results
router.put('/:id', authenticate, requireStudio, async (req, res) => {
  const b = req.body
  const outcome = OUTCOMES.includes(b.outcome) ? b.outcome : undefined
  const updates = {
    ...(b.member_name !== undefined ? { member_name: b.member_name } : {}),
    ...(b.member_id !== undefined ? { member_id: b.member_id || null } : {}),
    ...(b.date_requested !== undefined ? { date_requested: b.date_requested } : {}),
    ...(b.handled_by !== undefined ? { handled_by: b.handled_by || null } : {}),
    ...(b.cancel_reason && REASONS.includes(b.cancel_reason) ? { cancel_reason: b.cancel_reason } : {}),
    ...(b.reason_notes !== undefined ? { reason_notes: b.reason_notes || null } : {}),
    ...(b.competitor_name !== undefined ? { competitor_name: b.competitor_name || null } : {}),
    ...(b.likely_to_return !== undefined ? { likely_to_return: !!b.likely_to_return } : {}),
    ...(b.conversation_notes !== undefined ? { conversation_notes: b.conversation_notes || null } : {}),
    ...(Array.isArray(b.offers_presented) ? { offers_presented: b.offers_presented } : {}),
    ...(b.offer_accepted !== undefined ? { offer_accepted: b.offer_accepted || 'none' } : {}),
    ...(b.goal_recaptured !== undefined ? { goal_recaptured: !!b.goal_recaptured } : {}),
    ...(b.win_back_step !== undefined ? { win_back_step: b.win_back_step } : {}),
    ...(outcome ? { outcome } : {}),
    ...(b.postcancel_feedback !== undefined ? { postcancel_feedback: b.postcancel_feedback || null } : {}),
    ...(b.would_return !== undefined ? { would_return: b.would_return || null } : {}),
    ...(b.follow_up_date !== undefined ? { follow_up_date: b.follow_up_date || null } : {}),
    updated_at: new Date().toISOString(),
  }
  // Terminal win-back steps resolve the entry.
  if (['reactivated', 'lost_declined', 'lost_no_response'].includes(b.win_back_step)) {
    updates.date_resolved = todayInChicago()
  }

  const { data, error } = await supabase().from('cancellation_log')
    .update(updates).eq('id', req.params.id).eq('studio_id', req.studio.id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /api/cancellations/:id  — owner/manager only
router.delete('/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await supabase().from('cancellation_log').delete()
    .eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// POST /api/cancellations/schedule-followups — assign follow-up dates to unresolved
// cancellations, hottest-by-win-back-score first, N per day, skipping Sundays.
router.post('/schedule-followups', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const perDay = Math.max(1, Math.min(100, Number(req.body?.per_day) || 15))
    const skipSundays = req.body?.skip_sundays !== false
    const result = await scheduleWinbacks(req.studio.id, { perDay, skipSundays })
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
