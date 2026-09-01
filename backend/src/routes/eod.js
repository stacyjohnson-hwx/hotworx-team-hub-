const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')
const { sendEodEmail, diagnoseEmail } = require('../services/eodEmail')
const { todayInChicago } = require('../jobs/eodEmailCron')
const { computeOutreachCounts } = require('../services/outreachCounts')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Apply studio middleware to all routes
router.use(authenticate, requireStudio)

// ─── POST /api/eod/test-email — owner/manager: diagnose + send a test email ──
router.post('/test-email', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const result = await diagnoseEmail(req.studio.id)
    // Persist the diagnostic so it can be reviewed (no password is stored)
    await db().from('email_test_results').insert({ studio_id: req.studio.id, result }).catch(() => {})
    res.json(result)
  } catch (err) {
    await db().from('email_test_results').insert({ studio_id: req.studio.id, result: { ok: false, message: err.message } }).catch(() => {})
    res.status(500).json({ ok: false, message: err.message })
  }
})

// ─── GET /api/eod?date=YYYY-MM-DD  OR  ?from=YYYY-MM-DD&to=YYYY-MM-DD ─────────
// Owner/Manager: all submissions; TSA: their own only
router.get('/', async (req, res) => {
  const today = todayInChicago()
  const from  = req.query.from || req.query.date || today
  const to    = req.query.to   || req.query.date || today

  let query = db()
    .from('eod_submissions')
    .select('*')
    .eq('studio_id', req.studio.id)
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

  // Resolve submitter names (who did each EOD)
  const nameMap = {}
  for (const uid of userIds) {
    if (!uid) continue
    const { data: u } = await db().auth.admin.getUserById(uid)
    nameMap[uid] = u?.user?.user_metadata?.full_name || u?.user?.email?.split('@')[0] || 'Team Member'
  }
  // Cleaning tasks are a shared studio checklist — fetch all completions for the
  // date range regardless of who checked them off, then key by date only.
  const { data: completions } = await db()
    .from('cleaning_completions')
    .select('task_id, completion_date')
    .eq('studio_id', req.studio.id)
    .gte('completion_date', from)
    .lte('completion_date', to)

  const taskMap = {}
  if (completions && completions.length > 0) {
    const taskIds = [...new Set(completions.map(c => c.task_id))]
    const { data: tasks } = await db()
      .from('cleaning_tasks').select('id, title, task_type').in('id', taskIds)
    for (const t of tasks || []) taskMap[t.id] = t
  }

  // Key by date only — every EOD for a given date shows all tasks done that day
  const tasksByDate = {}
  for (const c of completions || []) {
    const key = c.completion_date
    if (!tasksByDate[key]) tasksByDate[key] = { cleaning: [], operations: [] }
    const t = taskMap[c.task_id]
    if (!t) continue
    if (t.task_type === 'Operations') tasksByDate[key].operations.push(t.title)
    else tasksByDate[key].cleaning.push(t.title)
  }

  res.json(submissions.map(s => {
    const tasks = tasksByDate[s.shift_date] || { cleaning: [], operations: [] }
    return {
      ...s,
      submitter_name: nameMap[s.submitted_by] || 'Team Member',
      completed_cleaning: tasks.cleaning,
      completed_operations: tasks.operations,
      completed_missions: s.mission_titles || [],
    }
  }))
})

// ─── GET /api/eod/activity?from=YYYY-MM-DD&to=YYYY-MM-DD ──────────────────────
// Studio-wide marketing & member-activation work logged per day, so the EOD
// "View Submissions" tab shows what the team actually did that day (B2B
// follow-ups, sample/sponsor touches, birthday texts, thank-you cards, missed-
// guest follow-ups, cancellations worked, engagement follow-ups). Auto-derived
// from each module's own logs — no manual entry. Counts are bucketed by the
// Chicago calendar day the work was completed.
router.get('/activity', async (req, res) => {
  const today = todayInChicago()
  const from = req.query.from || req.query.date || today
  const to   = req.query.to   || req.query.date || today
  const sid  = req.studio.id

  // Chicago day string for a timestamp; wide UTC bounds so late-evening
  // (post-7pm Chicago = next-day UTC) rows are captured, then bucketed in JS.
  const chiDate = (ts) => ts ? new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) : null
  const loUtc = `${from}T00:00:00-06:00`
  const hiUtc = `${to}T23:59:59-05:00`

  const out = {} // { [date]: { b2b, sponsor, birthday, thank_you, missed_guest, cancellations, engagement } }
  const bump = (date, key, n = 1) => {
    if (!date || date < from || date > to) return
    if (!out[date]) out[date] = { b2b: 0, sponsor: 0, birthday: 0, thank_you: 0, missed_guest: 0, cancellations: 0, engagement: 0 }
    out[date][key] += n
  }

  try {
    // Sponsor brands for this studio (sponsor_touches keys on brand, not studio)
    const { data: brands } = await db().from('sponsor_brands').select('id').eq('studio_id', sid)
    const brandIds = (brands || []).map(b => b.id)

    const [b2b, sponsor, recog, touch, cancels, reeng] = await Promise.all([
      db().from('b2b_interactions').select('logged_at').eq('studio_id', sid).gte('logged_at', loUtc).lte('logged_at', hiUtc),
      brandIds.length
        ? db().from('sponsor_touches').select('occurred_on').in('brand_id', brandIds).gte('occurred_on', from).lte('occurred_on', to)
        : Promise.resolve({ data: [] }),
      db().from('onboarding_recognition_tasks').select('type, completed_at').eq('studio_id', sid).eq('status', 'completed').in('type', ['birthday', 'thank_you_card']).gte('completed_at', loUtc).lte('completed_at', hiUtc),
      db().from('onboarding_touchpoint_log').select('completed_at').eq('studio_id', sid).eq('done', true).in('touchpoint_key', ['missed_guest', 'no_show']).gte('completed_at', loUtc).lte('completed_at', hiUtc),
      db().from('cancellation_followups').select('done_at').eq('studio_id', sid).eq('done', true).gte('done_at', loUtc).lte('done_at', hiUtc),
      db().from('onboarding_reengage_log').select('contacted_at').eq('studio_id', sid).gte('contacted_at', loUtc).lte('contacted_at', hiUtc),
    ])

    for (const r of b2b.data || []) bump(chiDate(r.logged_at), 'b2b')
    for (const r of sponsor.data || []) bump(r.occurred_on, 'sponsor') // plain date, already Chicago-local
    for (const r of recog.data || []) bump(chiDate(r.completed_at), r.type === 'birthday' ? 'birthday' : 'thank_you')
    for (const r of touch.data || []) bump(chiDate(r.completed_at), 'missed_guest')
    for (const r of cancels.data || []) bump(chiDate(r.done_at), 'cancellations')
    for (const r of reeng.data || []) bump(chiDate(r.contacted_at), 'engagement')

    res.json(out)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/eod/mine ────────────────────────────────────────────────────────
// Returns today's submissions by the current user (for the TSA form to show already-submitted shifts)
router.get('/mine', async (req, res) => {
  const date = req.query.date || todayInChicago()

  const { data, error } = await db()
    .from('eod_submissions')
    .select('shift_type, submitted_at, id')
    .eq('studio_id', req.studio.id)
    .eq('submitted_by', req.user.id)
    .eq('shift_date', date)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── GET /api/eod/outreach-summary?date= ─────────────────────────────────────
// Auto-fill numbers for the checkout: how much member outreach was COMPLETED
// today (birthday, thank-you, missed-guest, 14-day re-engage, milestones, new
// member) + their total. Editable on the form — this is just the starting count.
router.get('/outreach-summary', async (req, res) => {
  const date = req.query.date || todayInChicago()
  try {
    res.json(await computeOutreachCounts(req.studio.id, date))
  } catch (err) {
    console.error('GET /eod/outreach-summary', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/eod ────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
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
    orders_needed, general_notes, support_notes,
    // Missions (Growth HQ) — array of title strings
    mission_titles,
    // Training completed today (pulled from Training module) — array of title strings
    completed_training,
    // Member outreach completed today (auto-filled, editable)
    outreach_birthday, outreach_thank_you, outreach_missed_guest,
    outreach_reengage14, outreach_milestones, outreach_new_member, outreach_edited,
  } = req.body

  if (!shift_type) return res.status(400).json({ error: 'shift_type is required' })
  if (shift_type === 'opening') return res.status(400).json({ error: 'Opening shift is not used.' })

  const date = shift_date || todayInChicago()

  const { data, error } = await db()
    .from('eod_submissions')
    .insert({
      submitted_by: req.user.id,
      studio_id: req.studio.id,
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
      support_notes: support_notes || null,
      mission_titles: Array.isArray(mission_titles) && mission_titles.length > 0 ? mission_titles : [],
      completed_training: Array.isArray(completed_training) ? completed_training : [],
      outreach_birthday: outreach_birthday ?? 0,
      outreach_thank_you: outreach_thank_you ?? 0,
      outreach_missed_guest: outreach_missed_guest ?? 0,
      outreach_reengage14: outreach_reengage14 ?? 0,
      outreach_milestones: outreach_milestones ?? 0,
      outreach_new_member: outreach_new_member ?? 0,
      outreach_edited: !!outreach_edited,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: `You already submitted an EOD for the ${shift_type} shift today.` })
    }
    return res.status(500).json({ error: error.message })
  }

  // A real closing supersedes the 8:30 PM auto-placeholder — remove it so the
  // day doesn't show a redundant auto card.
  if (shift_type === 'closing') {
    try {
      await db().from('eod_submissions').delete()
        .eq('studio_id', req.studio.id).eq('shift_date', date).eq('shift_type', 'auto')
    } catch (_) { /* non-fatal */ }
  }

  // Orders are now logged directly to the orders table via the EOD "Orders Needed"
  // section (POST /api/orders), so no auto-draft from a free-text field here.

  // Send email immediately on mid and closing shifts
  if (shift_type === 'mid' || shift_type === 'closing') {
    sendEodEmail(date, req.studio.id).catch(err => console.error('[EOD] Email error:', err.message))
  }

  res.status(201).json(data)
})

// ─── DELETE /api/eod/:id ──────────────────────────────────────────────────────
// Owner/Manager only — remove a submission
router.delete('/:id', requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await db()
    .from('eod_submissions')
    .delete()
    .eq('id', req.params.id)
    .eq('studio_id', req.studio.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── POST /api/eod/send-digest ────────────────────────────────────────────────
// Owner/Manager: manually trigger the email digest for any date
router.post('/send-digest', requireRole('owner', 'manager'), async (req, res) => {
  const date = req.body.date || todayInChicago()
  try {
    await sendEodEmail(date, req.studio.id)
    res.json({ ok: true, date })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
