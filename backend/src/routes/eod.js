const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { sendEodEmail } = require('../services/eodEmail')
const { todayInChicago } = require('../jobs/eodEmailCron')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ─── GET /api/eod?date=YYYY-MM-DD  OR  ?from=YYYY-MM-DD&to=YYYY-MM-DD ─────────
// Owner/Manager: all submissions; TSA: their own only
router.get('/', authenticate, async (req, res) => {
  const today = todayInChicago()
  const from  = req.query.from || req.query.date || today
  const to    = req.query.to   || req.query.date || today

  let query = db()
    .from('eod_submissions')
    .select('*')
    .gte('shift_date', from)
    .lte('shift_date', to)
    .order('submitted_at', { ascending: false })

  if (req.role === 'tsa') query = query.eq('submitted_by', req.user.id)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  const submissions = data || []
  if (submissions.length === 0) return res.json([])

  // Attach completed tasks per submitter per date
  const userIds = [...new Set(submissions.map(s => s.submitted_by))]
  const { data: completions } = await db()
    .from('cleaning_completions')
    .select('task_id, completed_by, completion_date')
    .gte('completion_date', from)
    .lte('completion_date', to)
    .in('completed_by', userIds)

  const taskMap = {}
  if (completions && completions.length > 0) {
    const taskIds = [...new Set(completions.map(c => c.task_id))]
    const { data: tasks } = await db()
      .from('cleaning_tasks').select('id, title, task_type').in('id', taskIds)
    for (const t of tasks || []) taskMap[t.id] = t
  }

  // Key: `userId:date`
  const tasksByKey = {}
  for (const c of completions || []) {
    const key = `${c.completed_by}:${c.completion_date}`
    if (!tasksByKey[key]) tasksByKey[key] = { cleaning: [], operations: [] }
    const t = taskMap[c.task_id]
    if (!t) continue
    if (t.task_type === 'Operations') tasksByKey[key].operations.push(t.title)
    else tasksByKey[key].cleaning.push(t.title)
  }

  res.json(submissions.map(s => {
    const key = `${s.submitted_by}:${s.shift_date}`
    return {
      ...s,
      completed_cleaning: tasksByKey[key]?.cleaning || [],
      completed_operations: tasksByKey[key]?.operations || [],
      completed_missions: s.mission_titles || [],
    }
  }))
})

// ─── GET /api/eod/mine ────────────────────────────────────────────────────────
// Returns today's submissions by the current user (for the TSA form to show already-submitted shifts)
router.get('/mine', authenticate, async (req, res) => {
  const date = req.query.date || todayInChicago()

  const { data, error } = await db()
    .from('eod_submissions')
    .select('shift_type, submitted_at, id')
    .eq('submitted_by', req.user.id)
    .eq('shift_date', date)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── POST /api/eod ────────────────────────────────────────────────────────────
router.post('/', authenticate, async (req, res) => {
  const {
    shift_date, shift_type,
    drawer_start, cash_collected, credit_collected, drawer_end,
    // Sales
    sweat_basic, sweat_elite, cancellations_count, cancellations_notes,
    retail_amount, sales_notes,
    // Lead generation
    phone_calls, sms_sent, red_appt_scheduled,
    notes_added_missed, followed_up_missed, survey_sent_red_appts,
    leads_notes,
    // Membership engagement
    eng_testimonial, eng_google_review, eng_photos_members, eng_photos_rewards,
    eng_ambassador, eng_app_link, eng_biz_month, eng_ig_tiktok,
    eng_new_member, eng_follow_up, eng_thank_you_cards,
    // Sales training
    watched_training_video, used_sales_gpt, role_played_script,
    // Other
    orders_needed, general_notes,
    // Missions (Growth HQ) — array of title strings
    mission_titles,
  } = req.body

  if (!shift_type) return res.status(400).json({ error: 'shift_type is required' })
  if (shift_type === 'opening') return res.status(400).json({ error: 'Opening shift is not used.' })

  const date = shift_date || todayInChicago()

  const { data, error } = await db()
    .from('eod_submissions')
    .insert({
      submitted_by: req.user.id,
      shift_date: date,
      shift_type,
      drawer_start: drawer_start ?? 0,
      cash_collected: cash_collected ?? 0,
      credit_collected: credit_collected ?? 0,
      drawer_end: drawer_end ?? 0,
      sweat_basic: sweat_basic ?? 0,
      sweat_elite: sweat_elite ?? 0,
      cancellations_count: cancellations_count ?? 0,
      cancellations_notes: cancellations_notes || null,
      retail_amount: retail_amount ?? 0,
      sales_notes: sales_notes || null,
      phone_calls: phone_calls ?? 0,
      sms_sent: sms_sent ?? 0,
      red_appt_scheduled: red_appt_scheduled ?? 0,
      notes_added_missed: !!notes_added_missed,
      followed_up_missed: !!followed_up_missed,
      survey_sent_red_appts: !!survey_sent_red_appts,
      leads_notes: leads_notes || null,
      eng_testimonial: !!eng_testimonial,
      eng_google_review: !!eng_google_review,
      eng_photos_members: !!eng_photos_members,
      eng_photos_rewards: !!eng_photos_rewards,
      eng_ambassador: !!eng_ambassador,
      eng_app_link: !!eng_app_link,
      eng_biz_month: !!eng_biz_month,
      eng_ig_tiktok: !!eng_ig_tiktok,
      eng_new_member: !!eng_new_member,
      eng_follow_up: !!eng_follow_up,
      eng_thank_you_cards: !!eng_thank_you_cards,
      watched_training_video: !!watched_training_video,
      used_sales_gpt: !!used_sales_gpt,
      role_played_script: !!role_played_script,
      orders_needed: orders_needed || null,
      general_notes: general_notes || null,
      mission_titles: Array.isArray(mission_titles) && mission_titles.length > 0 ? mission_titles : [],
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: `You already submitted an EOD for the ${shift_type} shift today.` })
    }
    return res.status(500).json({ error: error.message })
  }

  // Auto-draft a pending order if TSA listed items needed
  if (orders_needed && orders_needed.trim()) {
    const shiftLabel = shift_type.charAt(0).toUpperCase() + shift_type.slice(1)
    db()
      .from('orders')
      .insert({
        item_name: `EOD request — ${shiftLabel} shift (${date})`,
        quantity: 1,
        category: 'supplies',
        notes: orders_needed.trim(),
        status: 'pending',
        requested_by: req.user.id,
      })
      .then(({ error: oErr }) => {
        if (oErr) console.error('[EOD] Auto-order draft error:', oErr.message)
      })
  }

  // Send email immediately if this is a closing shift
  if (shift_type === 'closing') {
    sendEodEmail(date).catch(err => console.error('[EOD] Closing email error:', err.message))
  }

  res.status(201).json(data)
})

// ─── DELETE /api/eod/:id ──────────────────────────────────────────────────────
// Owner/Manager only — remove a submission
router.delete('/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await db()
    .from('eod_submissions')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── POST /api/eod/send-digest ────────────────────────────────────────────────
// Owner/Manager: manually trigger the email digest for any date
router.post('/send-digest', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const date = req.body.date || todayInChicago()
  try {
    await sendEodEmail(date)
    res.json({ ok: true, date })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
