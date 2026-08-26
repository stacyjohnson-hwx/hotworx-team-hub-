// CFO Dashboard (PRD). Owner/GM view: metrics from studio_trends + benchmark bands
// (from monthly_pnl once expense detail is entered) + coaching callouts.
const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireStudio } = require('../middleware/studioMiddleware')
const { requireRole } = require('../middleware/roleGuard')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
router.use(authenticate, requireStudio, requireRole('owner', 'manager'))

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Friendly labels for every category we store (bands supply their own labels too).
const CAT_LABEL = {
  membership_eft: 'Membership EFT', retail: 'Retail + upgrades', retail_cogs: 'Retail COGS',
  payroll: 'Payroll + taxes', occupancy: 'Occupancy (rent + CAM)', utilities: 'Utilities',
  virtual_instructor: 'Virtual instructor fee', marketing: 'Local marketing', merchant_fees: 'Merchant + bank fees',
  software_pos: 'POS / software', insurance: 'Insurance', repairs_supplies: 'R&M + supplies',
  admin_professional: 'Admin / legal / accounting', royalty: 'Royalty', taxes_licenses: 'Taxes & licenses',
  interest_expense: 'Interest', depreciation: 'Depreciation', startup_equipment: 'Startup / equipment (capital)',
  loan_principal: 'Loan principal', owner_draw: 'Owner draws', other: 'Other',
}
// Operating expense categories that carry a benchmark band (always shown, even if $0).
const OP_BAND_CATS = ['retail_cogs', 'payroll', 'occupancy', 'utilities', 'virtual_instructor', 'marketing', 'merchant_fees', 'software_pos', 'insurance', 'repairs_supplies', 'admin_professional']

const num = (v) => Number(v) || 0
const r1 = (n) => Math.round(n * 10) / 10
const r2 = (n) => Math.round(n * 100) / 100

// One month's derived economics from a studio_trends row (+ the prior row for churn).
function derive(row, prev) {
  const revenue = num(row.net_eft) + num(row.membership_cash) + num(row.retail) + num(row.vending) + num(row.rewards) - num(row.refunds)
  const expenses = num(row.expenses)
  const net_income = revenue - expenses                    // PRD: net = revenue − expenses (enforced)
  const members = num(row.total_member_count)
  const starting = prev ? num(prev.total_member_count) : members + num(row.cancellations) - num(row.new_members)
  const churn_pct = starting > 0 ? (num(row.cancellations) / starting) * 100 : null
  const arpu = members > 0 ? revenue / members : null
  const pct = (n) => revenue > 0 ? (n / revenue) * 100 : null
  return {
    year: row.year, month: row.month, label: `${MONTHS[row.month - 1]} '${String(row.year).slice(2)}`,
    revenue: r2(revenue), expenses: r2(expenses), net_income: r2(net_income),
    net_margin_pct: revenue > 0 ? r1((net_income / revenue) * 100) : null,
    members, new_members: num(row.new_members), cancellations: num(row.cancellations),
    net_member_change: num(row.new_members) - num(row.cancellations),
    starting_members: starting, churn_pct: churn_pct == null ? null : r1(churn_pct),
    member_life_months: churn_pct > 0 ? r1(100 / churn_pct) : null,
    arpu: arpu == null ? null : r2(arpu),
    retail: r2(num(row.retail)), retail_pct: pct(num(row.retail)) == null ? null : r1(pct(num(row.retail))),
    eft: r2(num(row.net_eft)), eft_pct: pct(num(row.net_eft)) == null ? null : r1(pct(num(row.net_eft))),
    // Funnel
    leads: num(row.leads), booked: num(row.red_appts_booked), held: num(row.red_appts_held),
    lead_booked_pct: num(row.leads) > 0 ? r1((num(row.red_appts_booked) / num(row.leads)) * 100) : null,
    booked_held_pct: num(row.red_appts_booked) > 0 ? r1((num(row.red_appts_held) / num(row.red_appts_booked)) * 100) : null,
    held_joined_pct: num(row.red_appts_held) > 0 ? r1((num(row.new_members) / num(row.red_appts_held)) * 100) : null,
    // Data quality
    stored_net_income: num(row.net_income), stored_expenses: num(row.expenses),
    integrity_ok: num(row.expenses) > 0 && Math.abs(num(row.net_income) - net_income) <= 1,
    locked: row.locked === true,
  }
}

const money = (n) => `$${Math.round(Math.abs(n)).toLocaleString()}`

// Coaching callouts (PRD §6) computable from studio_trends. 5-part contract; capped/ranked in JS.
function callouts(series) {
  const out = []
  const n = series.length
  if (n < 2) return out
  const last = series[n - 1], prev = series[n - 2]
  // R5 — churn > 5.5%
  if (last.churn_pct != null && last.churn_pct > 5.5) {
    const target = 4.5, gapMembers = Math.round((last.churn_pct - target) / 100 * last.starting_members)
    const annual = Math.round(gapMembers * (last.arpu || 0) * 12)
    out.push({ sev: 'red', rank: annual, title: `Churn ${last.churn_pct}%`,
      gap: `${gapMembers} cancels/mo above a 4.5% target`, months: null,
      annual: `~${money(annual)}/yr at risk`, action: 'Work the win-back queue and first-90 saves — churn is the biggest lever.' })
  }
  // R6 — net member change < 0 for 2 months
  if (last.net_member_change < 0 && prev.net_member_change < 0) {
    const drop = Math.abs(last.net_member_change + prev.net_member_change)
    out.push({ sev: 'red', rank: (last.arpu || 50) * drop * 12, title: 'Members shrinking',
      gap: `${drop} net members lost over 2 months`, months: 2, annual: `~${money((last.arpu || 50) * drop * 12)}/yr of EFT`,
      action: 'More joins or fewer cancels this month — the base is contracting.' })
  }
  // R10 — ARPU declining 3 months
  if (n >= 3) {
    const a = series.slice(-3).map(s => s.arpu)
    if (a.every(v => v != null) && a[0] > a[1] && a[1] > a[2]) {
      const lift = 5, annual = Math.round(lift * (last.members || 0) * 12)
      out.push({ sev: 'amber', rank: annual, title: `ARPU $${last.arpu} and falling`,
        gap: '3 months of decline', months: 3, annual: `+$5/member ≈ ${money(annual)}/yr`,
        action: 'Check discounting/mix — nudge ARPU with upgrades and retail.' })
    }
  }
  // R9 — funnel stage weak
  if (last.lead_booked_pct != null && last.lead_booked_pct < 45) out.push({ sev: 'amber', rank: 5000, title: `Lead → booked ${last.lead_booked_pct}%`, gap: 'below 45%', months: null, annual: '', action: 'Booking rate is the leak — tighten lead follow-up speed.' })
  else if (last.booked_held_pct != null && last.booked_held_pct < 75) out.push({ sev: 'amber', rank: 4000, title: `Show rate ${last.booked_held_pct}%`, gap: 'below 75%', months: null, annual: '', action: 'Confirm + remind booked Reds to cut no-shows.' })
  else if (last.held_joined_pct != null && last.held_joined_pct < 50) out.push({ sev: 'amber', rank: 3000, title: `Close rate ${last.held_joined_pct}%`, gap: 'below 50%', months: null, annual: '', action: 'Coach the in-session close — held sessions aren’t converting.' })
  // R11 — data integrity (Blue; never displaces Red)
  if (!last.integrity_ok) out.push({ sev: 'blue', rank: -1, title: `${last.label} numbers don’t reconcile`,
    gap: last.stored_expenses === 0 ? 'expenses = 0 for the month' : 'net income ≠ revenue − expenses', months: null,
    annual: '', action: 'Enter this month’s expenses so the P&L is trustworthy.' })
  // Rank by annual $ impact; Blue after all non-blue; cap 5.
  const nonBlue = out.filter(c => c.sev !== 'blue').sort((a, b) => b.rank - a.rank)
  const blue = out.filter(c => c.sev === 'blue')
  return [...nonBlue, ...blue].slice(0, 5)
}

// ─── GET /api/cfo/overview — everything for the current studio ────────────────
router.get('/overview', async (req, res) => {
  try {
    const sb = db(); const sid = req.studio.id
    const { data: rows } = await sb.from('studio_trends').select('*').eq('studio_id', sid).order('year').order('month')
    const series = []
    for (let i = 0; i < (rows || []).length; i++) series.push(derive(rows[i], rows[i - 1]))
    const withRev = series.filter(s => s.revenue > 0)
    const ttmSeries = withRev.slice(-12)
    const sum = (k) => ttmSeries.reduce((a, s) => a + (s[k] || 0), 0)
    const ttm = {
      revenue: r2(sum('revenue')), expenses: r2(sum('expenses')), net_income: r2(sum('net_income')),
      months: ttmSeries.length,
      net_margin_pct: sum('revenue') > 0 ? r1((sum('net_income') / sum('revenue')) * 100) : null,
      avg_monthly_revenue: ttmSeries.length ? r2(sum('revenue') / ttmSeries.length) : 0,
    }
    const latest = series[series.length - 1] || null

    // ── P&L period = latest CLOSED month with expense detail (skip the in-progress
    //    calendar month, which is only partially booked in QuickBooks). ───────────
    const [{ data: pnlAll }, { data: bands }] = await Promise.all([
      sb.from('monthly_pnl').select('*').eq('studio_id', sid),
      sb.from('benchmark_targets').select('*').or(`studio_id.is.null,studio_id.eq.${sid}`).order('sort_order'),
    ])
    const now = new Date()
    const curYM = now.getFullYear() * 12 + now.getMonth()   // index of the current, still-open month
    const monthsWithData = [...new Set((pnlAll || []).map(l => l.period_year * 12 + (l.period_month - 1)))]
      .filter(ym => ym < curYM).sort((a, b) => b - a)
    let period = null
    if (monthsWithData.length) {
      const ym = monthsWithData[0]
      period = series.find(s => s.year === Math.floor(ym / 12) && s.month === (ym % 12) + 1) || null
    }
    if (!period) period = latest

    // Build the P&L waterfall for `period`, keeping leaf-account detail for drill-down.
    const bandByCat = {}; for (const b of bands || []) bandByCat[b.category] = b
    let pnl = null
    if (period) {
      const lines = (pnlAll || []).filter(l => l.period_year === period.year && l.period_month === period.month)
      const rev = period.revenue, retailRev = period.retail
      const groups = {}
      for (const l of lines) {
        const g = groups[l.category] || (groups[l.category] = { amount: 0, lines: [], line_position: l.line_position })
        g.amount += num(l.amount); g.lines.push({ gl_account: l.gl_account, amount: r2(num(l.amount)) })
      }
      const bandInfo = (cat, amount) => {
        const b = bandByCat[cat]
        if (!b || amount == null) return { low: null, high: null, actual_pct: null, status: 'na', denom: null, direction: null }
        const denom = b.denominator === 'retail_revenue' ? retailRev : rev
        const actual_pct = denom > 0 ? r1((amount / denom) * 100) : null
        let status = 'na'
        if (actual_pct != null) {
          const above = actual_pct > b.target_high_pct, below = actual_pct < b.target_low_pct
          status = (above && b.direction === 'lower_is_better') || (below && b.direction === 'higher_is_better') ? 'out'
            : (below && b.direction === 'lower_is_better') || (above && b.direction === 'higher_is_better') ? 'good' : 'in'
        }
        return { low: b.target_low_pct, high: b.target_high_pct, actual_pct, status, denom: b.denominator, direction: b.direction }
      }
      const row = (cat) => {
        const g = groups[cat]; const amount = g ? r2(g.amount) : null
        return { category: cat, label: CAT_LABEL[cat] || cat, amount, lines: g ? g.lines.sort((a, b) => b.amount - a.amount) : [], ...bandInfo(cat, amount) }
      }
      // Operating = band categories ∪ any operating categories actually present.
      const opCats = new Set(OP_BAND_CATS)
      for (const l of lines) if (l.line_position === 'operating') opCats.add(l.category)
      const ord = (c) => bandByCat[c]?.sort_order ?? 90
      const operating = [...opCats].map(row).sort((a, b) => ord(a.category) - ord(b.category) || (b.amount || 0) - (a.amount || 0))
      const operating_total = r2(operating.reduce((s, r) => s + (r.amount || 0), 0))
      // Revenue mix rows (from studio_trends — source of truth), for band context.
      const revenue_mix = [['membership_eft', period.eft], ['retail', period.retail]].map(([cat, amt]) => ({
        category: cat, label: CAT_LABEL[cat], amount: r2(amt), lines: [], ...bandInfo(cat, amt),
      }))
      const eb = bandByCat['ebitda'] || { target_low_pct: 20, target_high_pct: 30 }
      const ebitda = r2(rev - operating_total)
      const ebitda_pct = rev > 0 ? r1((ebitda / rev) * 100) : null
      const ebitda_status = ebitda_pct == null ? 'na' : (ebitda_pct < eb.target_low_pct ? 'out' : ebitda_pct > eb.target_high_pct ? 'good' : 'in')
      const belowCats = [...new Set(lines.filter(l => l.line_position === 'below_ebitda').map(l => l.category))]
      const below = belowCats.map(row)
      const below_total = r2(below.reduce((s, r) => s + (r.amount || 0), 0))
      const net_income = r2(ebitda - below_total)
      const net_margin_pct = rev > 0 ? r1((net_income / rev) * 100) : null
      const nonCats = [...new Set(lines.filter(l => l.line_position === 'non_pnl').map(l => l.category))]
      const non_pnl = nonCats.map(row)
      const non_pnl_total = r2(non_pnl.reduce((s, r) => s + (r.amount || 0), 0))
      pnl = {
        period: { year: period.year, month: period.month, label: period.label },
        revenue: rev, revenue_mix, operating, operating_total,
        ebitda, ebitda_pct, ebitda_band: [eb.target_low_pct, eb.target_high_pct], ebitda_status,
        below, below_total, net_income, net_margin_pct,
        non_pnl, non_pnl_total, cash_after_all: r2(net_income - non_pnl_total),
        has_detail: operating.some(r => r.amount != null),
      }
    }

    // Unit economics — break-even from real P&L cost (operating + below) ÷ ARPU.
    const beExp = pnl && pnl.has_detail ? pnl.operating_total + pnl.below_total : (period ? period.expenses : 0)
    const beArpu = period ? period.arpu : null
    const be = beArpu > 0 && beExp > 0 ? Math.round(beExp / beArpu) : null
    const unit = period ? {
      arpu: period.arpu, churn_pct: period.churn_pct, member_life_months: period.member_life_months,
      members: period.members, break_even_members: be,
      members_over_breakeven: be != null ? period.members - be : null,
      retail_pct: period.retail_pct, period_label: period.label, from_detail: !!(pnl && pnl.has_detail),
    } : null

    res.json({
      studio: { id: sid, name: req.studio.name, code: req.studio.code },
      ttm, latest, unit,
      series: withRev.slice(-24),
      callouts: callouts(withRev),
      pnl,
      has_expense_detail: !!(pnl && pnl.has_detail),
    })
  } catch (err) { console.error('GET /cfo/overview', err.message); res.status(500).json({ error: err.message }) }
})

// ─── POST /api/cfo/pnl — add/update one expense line (manual, owner only) ──────
router.post('/pnl', requireRole('owner', 'manager'), async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const { period_year, period_month, gl_account, category, amount, cost_behavior, line_position } = req.body || {}
  if (!period_year || !period_month || !gl_account) return res.status(400).json({ error: 'period, gl_account required' })
  const { data, error } = await sb.from('monthly_pnl').upsert({
    studio_id: sid, period_year, period_month, gl_account: String(gl_account).trim(),
    category: category || null, amount: Number(amount) || 0,
    cost_behavior: cost_behavior || null, line_position: line_position || 'operating', source: 'manual',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'studio_id,period_year,period_month,gl_account' }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.delete('/pnl/:id', requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await db().from('monthly_pnl').delete().eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// GET /api/cfo/pnl/:year/:month — raw lines for editing.
router.get('/pnl/:year/:month', async (req, res) => {
  const sb = db()
  const { data, error } = await sb.from('monthly_pnl').select('*').eq('studio_id', req.studio.id)
    .eq('period_year', parseInt(req.params.year)).eq('period_month', parseInt(req.params.month)).order('category')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

module.exports = router
