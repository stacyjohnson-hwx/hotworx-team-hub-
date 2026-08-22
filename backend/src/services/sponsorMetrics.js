// Sponsor Desk metric definitions — the ONLY place these are computed (PRD §6, §12).
// Success rate excludes untouched prospects from the denominator so adding names
// never lowers the score.
function computeSponsorMetrics(brands, today, givebacksOwed = 0) {
  const engaged = (brands || []).filter(b => b.stage !== 'prospect')
  const withSample = engaged.filter(b => b.last_sample_on != null) // ≥1 sample received
  const denom = engaged.length
  const num = withSample.length
  return {
    success_rate: denom ? Math.round((num / denom) * 100) : 0,
    success_num: num,
    success_denom: denom,
    product_in: (brands || []).reduce((s, b) => s + Number(b.donated_value || 0), 0),
    we_spent: (brands || []).reduce((s, b) => s + Number(b.total_spend || 0), 0),
    followups_due: (brands || []).filter(b => b.next_action_at && b.next_action_at < today && b.stage !== 'passed').length,
    givebacks_owed: givebacksOwed,
  }
}

// Mean gap in days between consecutive orders; null if fewer than 2 (never NaN/0).
function reorderCadenceDays(orderedDates) {
  const ds = (orderedDates || []).filter(Boolean).map(d => new Date(d + 'T00:00:00').getTime()).sort((a, b) => a - b)
  if (ds.length < 2) return null
  let sum = 0
  for (let i = 1; i < ds.length; i++) sum += (ds[i] - ds[i - 1]) / 86400000
  return Math.round(sum / (ds.length - 1))
}

module.exports = { computeSponsorMetrics, reorderCadenceDays }
