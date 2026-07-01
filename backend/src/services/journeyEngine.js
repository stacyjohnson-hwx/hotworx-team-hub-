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
]

async function seedTemplates(supabase, studioId) {
  const { data: existing } = await supabase.from('onboarding_touchpoint_templates')
    .select('template_key').eq('studio_id', studioId)
  const have = new Set((existing || []).map(t => t.template_key))
  const missing = TEMPLATE_DEFAULTS.filter(t => !have.has(t.template_key))
    .map(t => ({ ...t, studio_id: studioId }))
  if (missing.length) await supabase.from('onboarding_touchpoint_templates').insert(missing)
}

// ─── Engine run (Phase 2A: new-member detection, day-based seeding, graduation) ─
async function runJourneyEngine(supabase, studioId) {
  await seedTemplates(supabase, studioId)

  const [{ data: members }, { data: journeys }] = await Promise.all([
    supabase.from('onboarding_members')
      .select('id, full_name, order_source, join_date, is_cancelled')
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
}

module.exports = { runJourneyEngine, seedTemplates, renderTemplate, firstName, addDays, TEMPLATE_DEFAULTS, DAY_TOUCHPOINTS }
