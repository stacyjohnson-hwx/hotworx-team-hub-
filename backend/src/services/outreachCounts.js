// Counts of member outreach the team actually COMPLETED on a given day (not what's
// due). Feeds the EOD checkout auto-fill + the emailed report. Every count is a
// number of members who got that outreach that calendar day (America/Chicago),
// read from the same tables the Member Activation "done" check-offs write to.
const { createClient } = require('@supabase/supabase-js')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// New-member journey touches (all of them, per owner preference) — day 0 → 90.
const NEW_MEMBER_KEYS = new Set([
  'day_0_orientation', 'day_2', 'day_5', 'custom_day_10_checkin',
  'day_21', 'day_30', 'day_60', 'day_90',
])
const MILESTONE_KEYS = new Set(['passport', 'passport_sticker'])

// Calendar date (YYYY-MM-DD) of a timestamp, in the studio's timezone.
const chicagoDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) : null
const isReal = (by = '') => !/^(snoozed:|dismissed:)/.test(by || '')   // real contact, not snooze/dismiss

async function computeOutreachCounts(studioId, date) {
  const sb = db()
  // Fetch a generous window (>= the day before) then filter to the exact Chicago day.
  const since = new Date(new Date(`${date}T00:00:00Z`).getTime() - 36 * 3600 * 1000).toISOString()
  const lapseAnchor = new Date(`${date}T12:00:00Z`).getTime()

  const [recogRes, tpRes, reRes, rewardRes, memberRes, actRes] = await Promise.all([
    sb.from('onboarding_recognition_tasks').select('id, member_id, member_name, type, status, completed_at')
      .eq('studio_id', studioId).eq('status', 'completed').gte('completed_at', since),
    sb.from('onboarding_touchpoint_log').select('member_id, touchpoint_key, done, notes, completed_at, updated_at')
      .eq('studio_id', studioId).gte('updated_at', since),
    sb.from('onboarding_reengage_log').select('member_id, contacted_at, contacted_by')
      .eq('studio_id', studioId).gte('contacted_at', since),
    sb.from('onboarding_rewards_awarded').select('member_id, reward_key, awarded_at')
      .eq('studio_id', studioId).gte('awarded_at', since),
    sb.from('onboarding_members').select('id, member_type').eq('studio_id', studioId),
    sb.from('onboarding_member_activity').select('member_id, last_booking_date').eq('studio_id', studioId),
  ])

  const recog = (recogRes.data || []).filter(r => chicagoDate(r.completed_at) === date)
  // Count a touchpoint as outreach done today if it was marked done OR logged with a
  // note (a real contact — even when a follow-up was scheduled, which the app records
  // as a "snooze"). A no-note snooze/skip is not outreach. Use the done time for
  // completions, the edit time for note-only contacts.
  const tp = (tpRes.data || []).filter(r =>
    (r.done || (r.notes && r.notes.trim())) && chicagoDate(r.completed_at || r.updated_at) === date)
  const re = (reRes.data || []).filter(r => chicagoDate(r.contacted_at) === date && isReal(r.contacted_by))
  const rewards = (rewardRes.data || []).filter(r => chicagoDate(r.awarded_at) === date)

  const memberType = new Map((memberRes.data || []).map(m => [m.id, m.member_type || 'member']))
  const lastBook = new Map((actRes.data || []).map(a => [a.member_id, a.last_booking_date]))
  const lapseOf = (mid) => {
    const lb = lastBook.get(mid)
    return lb ? Math.floor((lapseAnchor - new Date(`${lb}T12:00:00Z`).getTime()) / 86400000) : null
  }

  const birthday = new Set()
  const thankYou = new Set()
  const newMember = new Set()
  const milestones = new Set()
  const missedGuest = new Set()
  const reengage14 = new Set()

  // Recognition tasks (birthday/thank-you) can have a null member_id (not linked to a
  // member record), so key by member_id → name → row id to avoid collapsing to one.
  const personKey = (r) => r.member_id || (r.member_name && `name:${r.member_name}`) || `rec:${r.id}`
  for (const r of recog) {
    if (r.type === 'birthday') birthday.add(personKey(r))
    else if (r.type === 'thank_you_card') thankYou.add(personKey(r))
  }
  for (const r of tp) {
    const k = r.touchpoint_key
    if (k === 'thank_you_card') thankYou.add(r.member_id)
    else if (k === 'missed_guest') missedGuest.add(r.member_id)
    else if (NEW_MEMBER_KEYS.has(k)) newMember.add(r.member_id)
    else if (k.startsWith('milestone') || MILESTONE_KEYS.has(k)) milestones.add(r.member_id)
    else if (k === 'reengage') { const l = lapseOf(r.member_id); if (l != null && l >= 14 && l <= 29) reengage14.add(r.member_id) }
  }
  for (const r of rewards) if (r.reward_key === 'sticker') milestones.add(r.member_id)
  // Re-engage log covers both the modal and the quick "mark contacted" button.
  for (const r of re) {
    if (memberType.get(r.member_id) === 'missed_guest') { missedGuest.add(r.member_id); continue }
    const l = lapseOf(r.member_id)
    if (l != null && l >= 14 && l <= 29) reengage14.add(r.member_id)
  }

  const counts = {
    outreach_birthday: birthday.size,
    outreach_thank_you: thankYou.size,
    outreach_missed_guest: missedGuest.size,
    outreach_reengage14: reengage14.size,
    outreach_milestones: milestones.size,
    outreach_new_member: newMember.size,
  }
  counts.outreach_total = Object.values(counts).reduce((a, b) => a + b, 0)
  return counts
}

module.exports = { computeOutreachCounts }
