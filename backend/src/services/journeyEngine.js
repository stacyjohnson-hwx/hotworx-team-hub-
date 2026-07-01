// Onboarding Journey engine — creates journeys, seeds day-based team touchpoints,
// and (Phase 2B) evaluates event triggers. Called at the end of each daily import.
// Pure-ish: takes a Supabase service-role client + studioId.

// ─── Helpers ──────────────────────────────────────────────────────────────────
function addDays(dateStr, n) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const firstName = (full) => (full || '').trim().split(/\s+/)[0] || 'there'
const todayStr = () => new Date().toISOString().slice(0, 10)

// Substitute {var} placeholders from a context object; unknown vars render blank.
function renderTemplate(body, ctx) {
  return String(body || '').replace(/\{(\w+)\}/g, (_, k) => (ctx[k] != null ? String(ctx[k]) : ''))
}

// ─── Day-based team touchpoints (email days are Mailchimp, not tasks) ─────────
const DAY_TOUCHPOINTS = [
  { day: 0,  type: 'text', ref: 'day_0',  keyFor: (src) => /online/i.test(src || '') ? 'day0_welcome_online' : 'day0_welcome_pos' },
  { day: 2,  type: 'call', ref: 'day_2',  key: 'day2_goal_call' },
  { day: 5,  type: 'text', ref: 'day_5',  key: 'day5_checkin' },
  { day: 21, type: 'text', ref: 'day_21', key: 'day21_bring_friend' },
  { day: 30, type: 'call', ref: 'day_30', key: 'day30_review' },
  { day: 60, type: 'call', ref: 'day_60', key: 'day60_review' },
  { day: 90, type: 'call', ref: 'day_90', key: 'day90_close' },
]

// ─── Default script templates (Script Admin edits the body; keys are stable) ──
const TEMPLATE_DEFAULTS = [
  { template_key: 'day0_welcome_pos',    label: 'Day 0 — Welcome (POS)',        channel: 'text', body: "Hi {first_name}! Welcome to HOTWORX Pewaukee 🔥 So glad you joined. Reply here anytime you need help booking your first sweat!" },
  { template_key: 'day0_welcome_online', label: 'Day 0 — Welcome (Online)',     channel: 'text', body: "Hi {first_name}! Welcome to HOTWORX Pewaukee 🔥 We'd love to meet you in person — stop by anytime and we'll get you set up for your first session!" },
  { template_key: 'day2_goal_call',      label: 'Day 2 — Goal + before photo',  channel: 'call', body: "Call {first_name}: welcome them personally, ask their #1 goal in their own words, capture a before photo (with consent), and help them book their next 3 sessions." },
  { template_key: 'day5_checkin',        label: 'Day 5 — First-session check-in', channel: 'text', body: "Hi {first_name}! How did your first session feel? We're here if you have any questions 💪" },
  { template_key: 'day21_bring_friend',  label: 'Day 21 — Bring a friend',       channel: 'text', body: "Hey {first_name}! Loving your sweats? Bring a friend for a free session — who are you bringing? 🔥" },
  { template_key: 'day30_review',        label: 'Day 30 — 30-day check-in',      channel: 'call', body: "Call {first_name}: 30-day check-in. Celebrate progress ({visit_days} visit-days so far). If they've done 6+ sessions, introduce the Sweat Elite upgrade — educational, no pressure." },
  { template_key: 'day60_review',        label: 'Day 60 — 60-day review',        channel: 'call', body: "Call {first_name}: 60-day review. Reference their goal: \"{goal_text}\". Re-capture a progress photo and celebrate how far they've come." },
  { template_key: 'day90_close',         label: 'Day 90 — Challenge close',      channel: 'call', body: "Call {first_name}: 90-day milestone! Capture an after photo, celebrate their transformation, and invite them to share a testimonial / join the ambassador program." },
  // Event-based (seeded now; wired in Phase 2B)
  { template_key: 'milestone_10',   label: '10 visit-days 🎉',            channel: 'text', body: "{first_name} just hit {milestone} visit-days! Shout-out: \"Way to show up — {milestone} visit-days already! 🔥\"" },
  { template_key: 'milestone_25',   label: '25 visit-days — keychain',   channel: 'text', body: "{first_name} hit {milestone} visit-days! Hand them their HOTWORX keychain and celebrate the consistency 🔑" },
  { template_key: 'milestone_50',   label: '50 visit-days 🎉',            channel: 'text', body: "{first_name} hit {milestone} visit-days! Send a big shout-out for the sustained habit 🔥" },
  { template_key: 'milestone_100',  label: '100 visit-days — T-shirt',   channel: 'call', body: "{first_name} hit {milestone} visit-days! Call to celebrate and hand over their 100-club T-shirt 👕" },
  { template_key: 'milestone_500',  label: '500 visit-days — premium',   channel: 'call', body: "{first_name} hit {milestone} visit-days! Celebrate this loyalty milestone and award their premium item." },
  { template_key: 'milestone_1000', label: '1,000 visit-days — legacy',  channel: 'call', body: "{first_name} reached {milestone} visit-days — legacy member! Wall of fame + marquee recognition." },
  { template_key: 'passport_sticker', label: 'Passport complete — all 12', channel: 'text', body: "{first_name} tried all 12 workouts! Hand over the passport sticker and celebrate the variety 🌟" },
  { template_key: 'save_7d',  label: 'Quiet 7 days — nudge',   channel: 'text', body: "Hey {first_name}! Haven't seen you in a bit — everything okay? Your spot's waiting 🔥 Want help booking your next sweat?" },
  { template_key: 'save_14d', label: '14 days quiet — save call', channel: 'call', body: "Call {first_name}: no booking in 14 days during onboarding. Warm check-in, remove barriers, help them re-book. High priority." },
  { template_key: 'reengage_14', label: 'We miss you — 14 days', channel: 'text', body: "Hi {first_name}! We miss you at HOTWORX 🔥 {event_name}Come get a sweat in this week!" },
  { template_key: 'reengage_30', label: 'We miss you — 30 days', channel: 'text', body: "Hey {first_name}, it's been a month! We'd love to see you back. {event_name}" },
  { template_key: 'reengage_60', label: 'We miss you — 60+ days', channel: 'call', body: "Call {first_name}: 60+ days since their last visit — at risk. Warm, personal re-invite. {event_name}" },
  { template_key: 'first_session_rough', label: 'Rough first session — priority', channel: 'call', body: "Call {first_name} ASAP: first session flagged rough/no-show. Check in personally, address concerns, re-book. Highest priority." },
  // Recognition checklist (Cards & Birthdays)
  { template_key: 'thank_you_card', label: 'Thank-you card (new member)', channel: 'card', body: "Write & mail a thank-you card welcoming {first_name} to HOTWORX Pewaukee 🎉" },
  { template_key: 'birthday_text',  label: 'Birthday text',              channel: 'text', body: "Happy Birthday, {first_name}! 🎂 Everyone at HOTWORX Pewaukee is wishing you an amazing day — come celebrate with a birthday sweat! 🔥" },
]

async function seedTemplates(supabase, studioId) {
  const { data: existing } = await supabase.from('onboarding_touchpoint_templates')
    .select('template_key').eq('studio_id', studioId)
  const have = new Set((existing || []).map(t => t.template_key))
  const missing = TEMPLATE_DEFAULTS.filter(t => !have.has(t.template_key))
    .map(t => ({ ...t, studio_id: studioId }))
  if (missing.length) await supabase.from('onboarding_touchpoint_templates').insert(missing)
}

// Hand a new member to Mailchimp: record a sync intent (tags), then POST it to the
// Make.com webhook if MAKE_WEBHOOK_URL is set. Resilient — never fails the import.
async function enqueueMailchimp(supabase, studioId, m) {
  const cohort = (m.join_date || '').slice(0, 7)
  const tags = [cohort ? `join_${cohort}` : null, m.package_name].filter(Boolean)
  const { data: row } = await supabase.from('onboarding_mailchimp_queue').insert({
    studio_id: studioId, member_id: m.id, customer_id: m.customer_id, email: m.email, action: 'subscribe', tags,
  }).select().single()
  const url = process.env.MAKE_WEBHOOK_URL
  if (!url || !row) return
  try {
    const res = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ studio_id: studioId, customer_id: m.customer_id, email: m.email, action: 'subscribe', tags }),
    })
    await supabase.from('onboarding_mailchimp_queue')
      .update({ status: res.ok ? 'sent' : 'failed', last_error: res.ok ? null : `HTTP ${res.status}`, attempts: 1, sent_at: new Date().toISOString() })
      .eq('id', row.id)
  } catch (e) {
    await supabase.from('onboarding_mailchimp_queue').update({ status: 'failed', last_error: e.message, attempts: 1 }).eq('id', row.id)
  }
}

// ─── Engine run (Phase 2A: new-member detection, day-based seeding, graduation) ─
async function runJourneyEngine(supabase, studioId) {
  await seedTemplates(supabase, studioId)

  const [{ data: members }, { data: journeys }] = await Promise.all([
    supabase.from('onboarding_members')
      .select('id, customer_id, full_name, order_source, join_date, email, package_name, is_cancelled')
      .eq('studio_id', studioId).eq('is_new_member', true),
    supabase.from('onboarding_journeys')
      .select('id, member_id, start_date, status, current_track').eq('studio_id', studioId),
  ])
  const journeyByMember = new Map((journeys || []).map(j => [j.member_id, j]))

  // New-member detection → create journey + seed day-based team tasks.
  for (const m of (members || [])) {
    if (m.is_cancelled || journeyByMember.has(m.id)) continue
    const { data: j } = await supabase.from('onboarding_journeys').insert({
      studio_id: studioId, member_id: m.id, start_date: m.join_date, challenge_cycle_start: m.join_date,
    }).select().single()
    if (!j) continue
    const tasks = DAY_TOUCHPOINTS.map(tp => ({
      studio_id: studioId, journey_id: j.id, type: tp.type,
      template_key: tp.keyFor ? tp.keyFor(m.order_source) : tp.key,
      trigger_kind: 'day_based', trigger_ref: tp.ref,
      due_date: addDays(m.join_date, tp.day), priority: 6, status: 'pending',
      context: { first_name: firstName(m.full_name) },
    }))
    await supabase.from('onboarding_journey_tasks').insert(tasks)
    await enqueueMailchimp(supabase, studioId, m)   // hand the new member to Mailchimp (via Make.com)
  }

  // Thank-you card checklist — one per new member (dedup on member_id; never re-opens a done one).
  const cardRows = (members || []).filter(m => !m.is_cancelled).map(m => ({
    studio_id: studioId, type: 'thank_you_card', member_id: m.id,
    member_name: m.full_name || null, email: m.email || null,
    ref_date: m.join_date, month_key: (m.join_date || '').slice(0, 7),
    source: 'auto', dedup_key: `card|${m.id}`,
  }))
  for (let i = 0; i < cardRows.length; i += 500) {
    await supabase.from('onboarding_recognition_tasks')
      .upsert(cardRows.slice(i, i + 500), { onConflict: 'studio_id,dedup_key', ignoreDuplicates: true })
  }

  // Graduation: journeys strictly past Day 90 leave onboarding (stay in roster-wide systems).
  const today = todayStr()
  for (const j of (journeys || [])) {
    if (j.status === 'active' && j.current_track !== 'graduated' && j.start_date && addDays(j.start_date, 90) < today) {
      await supabase.from('onboarding_journeys')
        .update({ current_track: 'graduated', status: 'completed', graduated_at: today, updated_at: new Date().toISOString() })
        .eq('id', j.id)
    }
  }

  await evaluateEventTriggers(supabase, studioId)
}

// Visit-day milestone ladder → reward + a one-time team shout-out task.
const MILESTONES = [
  { n: 10,   reward: 'shoutout_10',   ref: 'milestone_10',   type: 'text' },
  { n: 25,   reward: 'keychain_25',   ref: 'milestone_25',   type: 'text' },
  { n: 50,   reward: 'shoutout_50',   ref: 'milestone_50',   type: 'text' },
  { n: 100,  reward: 'shirt_100',     ref: 'milestone_100',  type: 'call' },
  { n: 500,  reward: 'premium_500',   ref: 'milestone_500',  type: 'call' },
  { n: 1000, reward: 'marquee_1000',  ref: 'milestone_1000', type: 'call' },
]

// Event-based triggers (§4): milestones, passport, first-90 save fork, first-session escalation.
// Idempotent — unique(journey_id, trigger_ref) means each fires once; rewards dedupe per member.
async function evaluateEventTriggers(supabase, studioId) {
  const today = todayStr()
  const [{ data: journeys }, { data: activity }, { data: members }] = await Promise.all([
    supabase.from('onboarding_journeys')
      .select('id, member_id, start_date, current_track, status, first_session_flag').eq('studio_id', studioId),
    supabase.from('onboarding_member_activity').select('*').eq('studio_id', studioId),
    supabase.from('onboarding_members').select('id, full_name, is_cancelled').eq('studio_id', studioId),
  ])
  const actMap = new Map((activity || []).map(a => [a.member_id, a]))
  const memMap = new Map((members || []).map(m => [m.id, m]))

  const addTask = async (j, fields) => {
    await supabase.from('onboarding_journey_tasks').upsert({
      studio_id: studioId, journey_id: j.id, status: 'pending', due_date: today, ...fields,
    }, { onConflict: 'journey_id,trigger_ref', ignoreDuplicates: true })
  }
  const awardReward = async (memberId, reward_key) => {
    await supabase.from('onboarding_rewards_awarded').upsert(
      { studio_id: studioId, member_id: memberId, reward_key },
      { onConflict: 'studio_id,member_id,reward_key', ignoreDuplicates: true })
  }

  for (const j of (journeys || [])) {
    const m = memMap.get(j.member_id)
    if (!m || m.is_cancelled || j.status === 'paused') continue
    const a = actMap.get(j.member_id) || {}
    const first = firstName(m.full_name)

    // Determine save-fork state FIRST so celebration can be suppressed for lapsed members (§4.5).
    const within90 = j.start_date && addDays(j.start_date, 90) >= today
    const ref = a.last_booking_date || j.start_date
    const lapse = ref ? Math.floor((new Date(today) - new Date(ref)) / 86400000) : 0
    const inSaveFork = within90 && j.status === 'active' && lapse >= 14

    // Milestones — reward is always recorded; the shout-out task is held while in the save fork.
    for (const ms of MILESTONES) {
      if ((a.visit_days || 0) >= ms.n) {
        await awardReward(j.member_id, ms.reward)
        if (!inSaveFork) await addTask(j, {
          type: ms.type, template_key: ms.ref, trigger_kind: 'event_based', trigger_ref: ms.ref,
          priority: 5, context: { first_name: first, milestone: ms.n, reward_key: ms.reward },
        })
      }
    }
    // Passport — all 12 workouts tried.
    if ((a.workouts_tried || 0) >= 12) {
      await awardReward(j.member_id, 'sticker')
      if (!inSaveFork) await addTask(j, {
        type: 'text', template_key: 'passport_sticker', trigger_kind: 'event_based', trigger_ref: 'passport_sticker',
        priority: 5, context: { first_name: first, reward_key: 'sticker' },
      })
    }
    // First-90 save fork — lapse measured from last booking (or join if never booked).
    if (within90 && j.status === 'active' && ['onboarding', 'save'].includes(j.current_track)) {
      if (lapse >= 14) {
        if (j.current_track !== 'save') await supabase.from('onboarding_journeys').update({ current_track: 'save' }).eq('id', j.id)
        await addTask(j, { type: 'call', template_key: 'save_14d', trigger_kind: 'event_based', trigger_ref: 'save_14d', priority: 3, context: { first_name: first, days_lapsed: lapse } })
      } else if (lapse >= 7) {
        await addTask(j, { type: 'text', template_key: 'save_7d', trigger_kind: 'event_based', trigger_ref: 'save_7d', priority: 3, context: { first_name: first, days_lapsed: lapse } })
      } else if (j.current_track === 'save') {
        await supabase.from('onboarding_journeys').update({ current_track: 'onboarding' }).eq('id', j.id)  // rebooked → exit save fork
      }
    }
    // First-session escalation — rough / no-show ranks to the very top.
    if (['rough', 'no_show'].includes(j.first_session_flag)) {
      await addTask(j, { type: 'call', template_key: 'first_session_rough', trigger_kind: 'event_based', trigger_ref: 'first_session_rough', priority: 1, context: { first_name: first } })
    }
  }
}

module.exports = { runJourneyEngine, seedTemplates, renderTemplate, firstName, addDays, TEMPLATE_DEFAULTS, DAY_TOUCHPOINTS }
