const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')
const authenticate = require('../middleware/authMiddleware')

const supabase = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const REASONS  = ['cost', 'not_using', 'no_results', 'moving', 'medical', 'unhappy', 'competitor', 'other']
const OUTCOMES = ['saved', 'pending', 'cancelled']

// Derive the follow-up date + terminal date from the outcome (PRD §3–4).
// Cancelled → post-cancel learning call 7 days out; Pending → a follow-up date.
function deriveDates({ outcome, date_requested, follow_up_date }) {
  const base = date_requested ? new Date(date_requested + 'T00:00:00') : new Date()
  const plus = (days) => { const d = new Date(base); d.setDate(d.getDate() + days); return d.toISOString().split('T')[0] }
  if (outcome === 'cancelled') return { follow_up_date: follow_up_date || plus(7), date_resolved: null }
  if (outcome === 'pending')   return { follow_up_date: follow_up_date || plus(7), date_resolved: null }
  return { follow_up_date: follow_up_date || null, date_resolved: new Date().toISOString().split('T')[0] } // saved = resolved
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

  res.json((data || []).map(r => ({ ...r, handled_by_name: r.handled_by ? (userMap[r.handled_by] || 'Team Member') : null })))
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

  const byReason = {}, byOutcome = {}
  for (const r of all) {
    byReason[r.cancel_reason] = (byReason[r.cancel_reason] || 0) + 1
    byOutcome[r.outcome] = (byOutcome[r.outcome] || 0) + 1
  }

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

  res.json({ total, saved, cancelled, pending, reactivated, freeMonthGiven, byReason, byOutcome, byRep, feedback })
})

// POST /api/cancellations
router.post('/', authenticate, requireStudio, async (req, res) => {
  const b = req.body
  if (!b.member_name) return res.status(400).json({ error: 'member_name is required' })
  if (!REASONS.includes(b.cancel_reason)) return res.status(400).json({ error: 'valid cancel_reason is required' })
  if (b.cancel_reason === 'other' && !b.reason_notes) return res.status(400).json({ error: 'reason_notes required when reason is Other' })

  const outcome = OUTCOMES.includes(b.outcome) ? b.outcome : 'saved'
  const dates = deriveDates({ outcome, date_requested: b.date_requested, follow_up_date: b.follow_up_date })

  const { data, error } = await supabase().from('cancellation_log').insert({
    studio_id: req.studio.id,
    member_name: b.member_name,
    member_id: b.member_id || null,
    date_requested: b.date_requested || new Date().toISOString().split('T')[0],
    handled_by: b.handled_by || req.user.id,
    cancel_reason: b.cancel_reason,
    reason_notes: b.reason_notes || null,
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
    updates.date_resolved = new Date().toISOString().split('T')[0]
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

module.exports = router
