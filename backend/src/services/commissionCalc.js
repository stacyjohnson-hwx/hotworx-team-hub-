const TSA_EFT_QUOTA     = 500
const MANAGER_EFT_QUOTA = 750

const round2 = n => Math.round(n * 100) / 100

// ─── TSA Commission ────────────────────────────────────────────────────────
function calcTSACommission({ eft_actual, pos_collected, pif_6mo, pif_12mo, retail_actual, itb_bonus_override }) {
  const eft    = Number(eft_actual)    || 0
  const pos    = Number(pos_collected) || 0
  const p6     = Number(pif_6mo)       || 0
  const p12    = Number(pif_12mo)      || 0
  const retail = Number(retail_actual) || 0

  const eft_exceeds_quota = eft > TSA_EFT_QUOTA
  const eft_rate          = eft_exceeds_quota ? 0.30 : 0.15
  const eft_commission    = pos * eft_rate

  const pif_commission = p6 * 0.05 + p12 * 0.10

  let retail_rate = 0
  if (retail >= 3000)      retail_rate = 0.15
  else if (retail >= 2000) retail_rate = 0.11
  else if (retail >= 1000) retail_rate = 0.10
  const retail_commission = retail * retail_rate

  let itb_bonus
  if (itb_bonus_override !== null && itb_bonus_override !== undefined) {
    itb_bonus = Number(itb_bonus_override)
  } else if (eft >= TSA_EFT_QUOTA * 1.10) { itb_bonus = 100 }
  else if (eft >= TSA_EFT_QUOTA)           { itb_bonus = 50 }
  else                                     { itb_bonus = 0 }

  return {
    type: 'tsa',
    eft_commission:    round2(eft_commission),
    pif_commission:    round2(pif_commission),
    retail_commission: round2(retail_commission),
    itb_bonus,
    net_eft_bonus: 0,
    rm_bonus: 0,
    total: round2(eft_commission + pif_commission + retail_commission + itb_bonus),
    eft_rate,
    eft_exceeds_quota,
    retail_rate,
    eft_quota: TSA_EFT_QUOTA,
  }
}

// ─── Manager Commission ────────────────────────────────────────────────────
// studioData comes from studio_trends for the same month:
//   { retail, membership_cash, in_the_bank, itb_goal, net_eft }
function calcManagerCommission(personal, studioData = {}) {
  const eft = Number(personal.eft_actual)    || 0
  const pos = Number(personal.pos_collected) || 0
  const p6  = Number(personal.pif_6mo)       || 0
  const p12 = Number(personal.pif_12mo)      || 0

  // EFT commission (quota $750)
  const eft_exceeds_quota = eft > MANAGER_EFT_QUOTA
  const eft_rate          = eft_exceeds_quota ? 0.30 : 0.15
  const eft_commission    = pos * eft_rate

  // PIF (same as TSA)
  const pif_commission = p6 * 0.05 + p12 * 0.10

  // Retail & Membership Cash Category: 4% on location total when >= $5,000
  const rm_total     = (Number(studioData.retail) || 0) + (Number(studioData.membership_cash) || 0)
  const rm_qualifies = rm_total >= 5000
  const rm_bonus     = rm_qualifies ? round2(rm_total * 0.04) : 0

  // ITB bonus: $200 / $500 based on studio In The Bank vs goal
  let itb_bonus
  if (personal.itb_bonus_override !== null && personal.itb_bonus_override !== undefined) {
    itb_bonus = Number(personal.itb_bonus_override)
  } else {
    const itb      = Number(studioData.in_the_bank) || 0
    const itb_goal = Number(studioData.itb_goal)    || 0
    if (itb_goal > 0 && itb >= itb_goal * 1.10)  itb_bonus = 500
    else if (itb_goal > 0 && itb >= itb_goal)     itb_bonus = 200
    else                                           itb_bonus = 0
  }

  // Net EFT tier bonus
  let net_eft_bonus
  if (personal.net_eft_bonus_override !== null && personal.net_eft_bonus_override !== undefined) {
    net_eft_bonus = Number(personal.net_eft_bonus_override)
  } else {
    const neft = Number(studioData.net_eft) || 0
    if      (neft >= 50000) net_eft_bonus = 1200
    else if (neft >= 45000) net_eft_bonus = 900
    else if (neft >= 30000) net_eft_bonus = 700
    else if (neft >= 20000) net_eft_bonus = 500
    else if (neft >= 15000) net_eft_bonus = 350
    else                    net_eft_bonus = 0
  }

  return {
    type: 'manager',
    eft_commission:    round2(eft_commission),
    pif_commission:    round2(pif_commission),
    rm_bonus,
    rm_total:          round2(rm_total),
    rm_qualifies,
    itb_bonus,
    net_eft_bonus,
    total:             round2(eft_commission + pif_commission + rm_bonus + itb_bonus + net_eft_bonus),
    eft_rate,
    eft_exceeds_quota,
    eft_quota: MANAGER_EFT_QUOTA,
    // Pass through studio data for display
    studio_net_eft:      studioData.net_eft     || 0,
    studio_in_the_bank:  studioData.in_the_bank || 0,
    studio_itb_goal:     studioData.itb_goal    || 0,
  }
}

// ─── Unified entry point ───────────────────────────────────────────────────
function calcCommission(personalGoals, role, studioData) {
  if (role === 'manager') return calcManagerCommission(personalGoals, studioData || {})
  return calcTSACommission(personalGoals)
}

module.exports = { calcCommission, calcTSACommission, calcManagerCommission, TSA_EFT_QUOTA, MANAGER_EFT_QUOTA }
