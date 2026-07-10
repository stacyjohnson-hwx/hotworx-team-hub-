// Win-back lead score for a cancelled member: 0–100 with Hot/Warm/Cool/Cold tiers.
// Pure and testable (like commissionCalc.js) — computed live at read time, never stored.
//
// The input row is a cancellation_log row already spread with the member-roster
// enrichment from buildMemberLookup (total_sessions, workouts_tried, last_booking_date).
// Weights were calibrated against the real distribution (678 rows, 2026-07): staff
// intent flags are ~99% null (bonus-shaped), ~48% of cancels are >1 year old (steep
// recency decay), visit_days ≈ total_sessions (excluded — double-counts).

// Reason points — how winnable each cancellation reason is (max 25).
// non_payment is involuntary churn ("update your card" — easiest win-back), UNLESS
// usage shows they'd already quietly quit before the card failed.
const REASON_PTS = {
  non_payment: 25,
  cost: 19,
  not_using: 16,
  no_results: 12,
  other: 12,
  competitor: 9,
  unhappy: 7,
  medical: 5,   // injuries heal — freeze-and-return is a known pattern
  moving: 3,    // geography is permanent; transfer is the only play
}
const NON_PAYMENT_SILENT_QUIT_PTS = 14 // non_payment but usage <1/mo — already checked out

const TIER = (score) => (score >= 70 ? 'hot' : score >= 45 ? 'warm' : score >= 20 ? 'cool' : 'cold')

const DAY_MS = 86400000
const daysBetween = (a, b) => {
  if (!a || !b) return null
  const d = Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / DAY_MS)
  return Number.isFinite(d) ? d : null
}
const monthsBetween = (a, b) => {
  const d = daysBetween(a, b)
  return d == null ? null : d / 30.44
}

// score a cancellation row. today = 'YYYY-MM-DD' (studio time).
function scoreWinback(row, today) {
  // Already won — no score, excluded from ranking.
  if (row.outcome === 'saved' || row.win_back_step === 'reactivated') {
    return { winback_score: null, winback_tier: 'won', winback_parts: [] }
  }

  const parts = []
  const add = (label, pts) => { parts.push({ label, pts }); return pts }

  // Derived inputs
  const tenureMonths = monthsBetween(row.subscription_date, row.date_requested)   // null if unknown
  const sessions = row.total_sessions == null ? null : Number(row.total_sessions)
  // Usage rate needs a tenure denominator; unknown tenure → assume ~6mo (median-ish).
  const rate = sessions == null ? null : sessions / Math.max(tenureMonths ?? 6, 0.5)

  // 1) Reason (max 25)
  let reasonPts = REASON_PTS[row.cancel_reason] ?? REASON_PTS.other
  if (row.cancel_reason === 'non_payment' && rate != null && rate < 1) reasonPts = NON_PAYMENT_SILENT_QUIT_PTS
  add(`Reason: ${String(row.cancel_reason || 'other').replace(/_/g, ' ')}`, reasonPts)

  // 2) Engagement while a member (max 22). Unmatched → neutral 9, never auto-cold.
  if (sessions == null) {
    add('Engagement: no workout history on file (neutral)', 9)
  } else {
    const ratePts = rate >= 8 ? 16 : rate >= 4 ? 12 : rate >= 1 ? 7 : 2
    add(`Usage: ${rate.toFixed(1)} sessions/mo`, ratePts)
    const wt = Number(row.workouts_tried) || 0
    const wtPts = wt >= 8 ? 6 : wt >= 4 ? 4 : wt >= 1 ? 2 : 0
    if (wtPts) add(`Variety: ${wt}/12 workouts tried`, wtPts)
  }

  // 3) Tenure (max 8)
  const tPts = tenureMonths == null ? 4 : tenureMonths >= 12 ? 8 : tenureMonths >= 6 ? 6 : tenureMonths >= 3 ? 4 : 1
  add(tenureMonths == null ? 'Tenure: unknown' : `Tenure: ${Math.round(tenureMonths)} mo`, tPts)

  // 4) Recency of cancellation (max 20) — steep decay; year-old leads get 0.
  const since = daysBetween(row.date_requested, today)
  const rPts = since == null ? 0 : since <= 30 ? 20 : since <= 60 ? 17 : since <= 90 ? 14 : since <= 180 ? 9 : since <= 365 ? 4 : 0
  add(since == null ? 'Cancelled: date unknown' : `Cancelled ${since}d ago`, rPts)

  // 5) Explicit intent (max 15, bonus-shaped — mostly null in practice)
  let intent = 0
  if (row.likely_to_return) intent += add('Flagged likely to return', 8)
  if (row.would_return === 'yes') intent += add('Said they would return', 8)
  else if (row.would_return === 'maybe') intent += add('Said maybe on returning', 4)
  if (row.offer_accepted && row.offer_accepted !== 'none') intent += add('Accepted an offer before', 3)
  if (row.goal_recaptured) intent += add('Goal recaptured at cancel', 2)
  if (intent > 15) add('Intent capped at 15', 15 - intent)

  // 6) Ending trajectory (max 10) — active-till-the-end reads as a life event.
  const gap = daysBetween(row.last_booking_date, row.date_requested)
  const gPts = gap == null ? 5 : gap <= 14 ? 10 : gap <= 45 ? 7 : gap <= 90 ? 4 : 0
  add(gap == null ? 'Last workout: unknown' : gap <= 14 ? 'Active until the end' : `Stopped ${gap}d before cancelling`, gPts)

  let score = parts.reduce((s, p) => s + p.pts, 0)

  // Modifiers
  if (row.would_return === 'no' && score > 19) {
    add('Said NO to returning (capped)', 19 - score)
    score = 19
  }
  if (row.win_back_step === 'lost_declined' && score > 25) {
    add('Declined all offers (capped)', 25 - score)
    score = 25
  }
  if (row.win_back_step === 'lost_no_response') {
    add('No response to win-back', -10)
    score -= 10
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  return { winback_score: score, winback_tier: TIER(score), winback_parts: parts }
}

module.exports = { scoreWinback, REASON_PTS, TIER }
