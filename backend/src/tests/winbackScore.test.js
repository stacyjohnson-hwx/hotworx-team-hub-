// Win-back scoring — the plan's verification cases plus modifier guards.
const { scoreWinback } = require('../services/winbackScore')

const TODAY = '2026-07-10'
const base = {
  cancel_reason: 'other', outcome: 'cancelled', win_back_step: 'call_scheduled',
  likely_to_return: false, would_return: null, offer_accepted: 'none', goal_recaptured: false,
  subscription_date: null, date_requested: null,
  total_sessions: null, workouts_tried: null, last_booking_date: null,
}

test('1. hot: non_payment, heavy usage, fresh cancel, active till end', () => {
  const r = scoreWinback({
    ...base, cancel_reason: 'non_payment',
    subscription_date: '2026-01-26', date_requested: '2026-06-26',  // ~5mo tenure
    total_sessions: 40, workouts_tried: 9,                          // ~8/mo, 9/12
    last_booking_date: '2026-06-24',                                // active till end
  }, TODAY)
  expect(r.winback_score).toBe(81)   // 25+16+6+4+20+10
  expect(r.winback_tier).toBe('hot')
})

test('2. silent-quit guard: non_payment with <1/mo usage is not hot', () => {
  const r = scoreWinback({
    ...base, cancel_reason: 'non_payment',
    subscription_date: '2025-12-01', date_requested: '2026-06-20',  // ~6.6mo tenure
    total_sessions: 2, workouts_tried: 0,
    last_booking_date: '2026-02-20',                                // ghosted 4mo before
  }, TODAY)
  expect(r.winback_score).toBe(42)   // 14+2+0+6+20+0
  expect(r.winback_tier).toBe('cool')
})

test('3. cold: moving, low usage, cancelled 8 months ago, ghosted', () => {
  const r = scoreWinback({
    ...base, cancel_reason: 'moving',
    subscription_date: '2025-03-10', date_requested: '2025-11-10',  // ~8mo tenure
    total_sessions: 3, workouts_tried: 3,
    last_booking_date: '2025-07-10',                                // >90d gap
  }, TODAY)
  expect(r.winback_score).toBe(17)   // 3+2+2+6+4+0
  expect(r.winback_tier).toBe('cold')
})

test('4. unmatched member is neutral, not auto-cold', () => {
  const r = scoreWinback({
    ...base, cancel_reason: 'cost',
    subscription_date: '2025-03-26', date_requested: '2026-05-26',  // ~14mo tenure, 45d ago
  }, TODAY)
  expect(r.winback_score).toBe(58)   // 19+9+8+17+5
  expect(r.winback_tier).toBe('warm')
})

test('5. explicit "no" caps everything at 19', () => {
  const r = scoreWinback({
    ...base, cancel_reason: 'not_using', would_return: 'no',
    subscription_date: '2025-06-26', date_requested: '2026-06-30',  // ~12mo, 10d ago
    total_sessions: 100, workouts_tried: 12,
    last_booking_date: '2026-06-28',
  }, TODAY)
  expect(r.winback_score).toBe(19)
  expect(r.winback_tier).toBe('cold')
})

test('6. saved / reactivated rows get no score', () => {
  expect(scoreWinback({ ...base, outcome: 'saved' }, TODAY).winback_tier).toBe('won')
  expect(scoreWinback({ ...base, outcome: 'saved' }, TODAY).winback_score).toBeNull()
  expect(scoreWinback({ ...base, win_back_step: 'reactivated' }, TODAY).winback_tier).toBe('won')
})

test('modifiers: lost_declined caps at 25; lost_no_response subtracts 10', () => {
  const hotBase = {
    ...base, cancel_reason: 'non_payment',
    subscription_date: '2026-01-26', date_requested: '2026-06-26',
    total_sessions: 40, workouts_tried: 9, last_booking_date: '2026-06-24',
  }
  expect(scoreWinback({ ...hotBase, win_back_step: 'lost_declined' }, TODAY).winback_score).toBe(25)
  expect(scoreWinback({ ...hotBase, win_back_step: 'lost_no_response' }, TODAY).winback_score).toBe(71)
})

test('breakdown parts sum to the score (no hidden points)', () => {
  const r = scoreWinback({
    ...base, cancel_reason: 'cost',
    subscription_date: '2025-03-26', date_requested: '2026-05-26',
  }, TODAY)
  const sum = r.winback_parts.reduce((s, p) => s + p.pts, 0)
  expect(sum).toBe(r.winback_score)
})
