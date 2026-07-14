// Assign follow-up dates to unresolved cancellations, prioritized by win-back score:
// the hottest leads get the earliest dates, capped at N per day, skipping Sundays.
// The Cancellations win-back queue (GET /followups) then surfaces ~N people per day.
const { createClient } = require('@supabase/supabase-js')
const { scoreWinback } = require('./winbackScore')

const sbClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const normName = (s) => String(s || '').toLowerCase().replace(/\s*-\s*dup$/, '').replace(/\s+/g, ' ').trim()
const EMPTY = { email: null, phone: null, total_sessions: null, visit_days: null, workouts_tried: null, last_booking_date: null }

async function fetchAll(sb, table, columns, studioId) {
  const PAGE = 1000; let out = [], from = 0
  for (;;) {
    const { data, error } = await sb.from(table).select(columns).eq('studio_id', studioId).range(from, from + PAGE - 1)
    if (error || !data || !data.length) break
    out = out.concat(data); if (data.length < PAGE) break; from += PAGE
  }
  return out
}
// Row → member enrichment (match by SAIL customer_id, then normalized name) for scoring.
async function buildLookup(sb, studioId) {
  const [members, activity] = await Promise.all([
    fetchAll(sb, 'onboarding_members', 'id, customer_id, full_name, email, phone', studioId),
    fetchAll(sb, 'onboarding_member_activity', 'member_id, visit_days, total_sessions, workouts_tried, last_booking_date', studioId),
  ])
  const actBy = new Map((activity || []).map(a => [a.member_id, a]))
  const byId = new Map(), byName = new Map()
  for (const m of members || []) {
    const a = actBy.get(m.id) || {}
    const info = { email: m.email || null, phone: m.phone || null, total_sessions: a.total_sessions ?? null, visit_days: a.visit_days ?? null, workouts_tried: a.workouts_tried ?? null, last_booking_date: a.last_booking_date ?? null }
    if (m.customer_id) byId.set(String(m.customer_id), info)
    const n = normName(m.full_name); if (n && !byName.has(n)) byName.set(n, info)
  }
  return (row) => byId.get(String(row.member_id)) || byName.get(normName(row.member_name)) || EMPTY
}

const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const isSunday = (s) => new Date(s + 'T00:00:00Z').getUTCDay() === 0
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }

async function scheduleWinbacks(studioId, { perDay = 15, skipSundays = true, today } = {}) {
  const sb = sbClient()
  const t = today || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

  const { data: cancs } = await sb.from('cancellation_log').select('*').eq('studio_id', studioId)
  // Unresolved win-back candidates only — leave saved / reactivated / already-resolved alone.
  const unresolved = (cancs || []).filter(c => c.outcome !== 'saved' && c.win_back_step !== 'reactivated' && !c.date_resolved)
  const lookup = await buildLookup(sb, studioId)

  const scored = unresolved.map(c => {
    const r = scoreWinback({ ...c, ...lookup(c) }, t)
    return { id: c.id, score: r.winback_score, pay: Number(c.monthly_payment) || 0, req: String(c.date_requested || '') }
  }).filter(x => x.score != null)
  // Hottest first; tie-break by monthly value, then most-recent cancel.
  scored.sort((a, b) => b.score - a.score || b.pay - a.pay || b.req.localeCompare(a.req))

  const nextWork = (s) => { let d = s; while (skipSundays && isSunday(d)) d = addDays(d, 1); return d }
  let day = nextWork(t), count = 0
  const byDate = new Map()
  for (const item of scored) {
    if (count >= perDay) { day = nextWork(addDays(day, 1)); count = 0 }
    if (!byDate.has(day)) byDate.set(day, [])
    byDate.get(day).push(item.id); count++
  }

  let updated = 0
  for (const [date, ids] of byDate) {
    for (const ch of chunk(ids, 200)) {
      const { error } = await sb.from('cancellation_log')
        .update({ follow_up_date: date, updated_at: new Date().toISOString() })
        .eq('studio_id', studioId).in('id', ch)
      if (!error) updated += ch.length
    }
  }
  const days = [...byDate.keys()]
  return { scheduled: updated, days: days.length, per_day: perDay, skip_sundays: skipSundays, first_day: days[0] || null, last_day: days[days.length - 1] || null }
}

module.exports = { scheduleWinbacks }
