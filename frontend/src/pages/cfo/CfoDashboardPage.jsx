import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, apiDelete } from '@/hooks/useApi'
import { useStudio } from '@/contexts/StudioContext'
import { useRole } from '@/hooks/useRole'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea } from 'recharts'
import { LineChart as LineIcon, Loader2, TrendingUp, Users, Percent, Lightbulb, Plus, X, AlertTriangle, ChevronRight, ChevronDown, Wallet, Target, Table2, Landmark } from 'lucide-react'

const $ = (n) => n == null ? '—' : `$${Math.round(n).toLocaleString()}`
const pct = (n) => n == null ? '—' : `${n}%`
const SEV = {
  red: { cls: 'bg-red-50 border-red-200 text-red-800', dot: 'bg-red-500' },
  amber: { cls: 'bg-amber-50 border-amber-200 text-amber-800', dot: 'bg-amber-500' },
  blue: { cls: 'bg-sky-50 border-sky-200 text-sky-800', dot: 'bg-sky-400' },
}
const inp = 'w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm'

function Kpi({ label, value, sub, accent }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <div className={`text-2xl font-black ${accent || 'text-gray-900'}`}>{value}</div>
      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mt-0.5">{label}</div>
      {sub ? <div className="text-[11px] text-gray-400">{sub}</div> : null}
    </div>
  )
}

function Trend({ title, data, dataKey, fmt, band }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">{title}</div>
      <div className="h-28">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 4 }}>
            {band && <ReferenceArea y1={band[0]} y2={band[1]} fill="#22c55e" fillOpacity={0.08} />}
            <Tooltip formatter={(v) => [fmt ? fmt(v) : v, title]} contentStyle={{ fontSize: 11, borderRadius: 8, padding: '3px 8px' }} />
            <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis hide domain={['auto', 'auto']} />
            <Line type="monotone" dataKey={dataKey} stroke="#6366f1" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// [category, label, line_position] — grouped by where the line lands in the waterfall.
const ADD_CATS = [
  ['payroll', 'Payroll + taxes', 'operating'], ['occupancy', 'Occupancy (rent + CAM)', 'operating'],
  ['utilities', 'Utilities', 'operating'], ['marketing', 'Local marketing', 'operating'],
  ['software_pos', 'POS / software', 'operating'], ['virtual_instructor', 'Virtual instructor fee', 'operating'],
  ['insurance', 'Insurance', 'operating'], ['repairs_supplies', 'R&M + supplies', 'operating'],
  ['admin_professional', 'Admin / legal / accounting', 'operating'], ['merchant_fees', 'Merchant + bank fees', 'operating'],
  ['royalty', 'Royalty', 'operating'], ['taxes_licenses', 'Taxes & licenses', 'operating'], ['retail_cogs', 'Retail COGS', 'operating'],
  ['interest_expense', 'Interest — below EBITDA', 'below_ebitda'], ['depreciation', 'Depreciation — below EBITDA', 'below_ebitda'],
  ['loan_principal', 'Loan principal — cash only, not P&L', 'non_pnl'], ['credit_card', 'Credit card payment — cash only, not P&L', 'non_pnl'],
  ['owner_draw', 'Owner draws — cash only, not P&L', 'non_pnl'],
  ['startup_equipment', 'Startup / equipment — cash only, not P&L', 'non_pnl'], ['other', 'Other', 'operating'],
]

function AddLineModal({ period, onClose, onSaved }) {
  const [f, setF] = useState({ gl_account: '', category: 'payroll', amount: '' })
  const [saving, setSaving] = useState(false)
  const lp = (ADD_CATS.find(c => c[0] === f.category) || [])[2] || 'operating'
  const save = async () => {
    if (!f.gl_account.trim() || !f.amount) return
    setSaving(true)
    try {
      await apiPost('/api/cfo/pnl', { period_year: period.year, period_month: period.month, gl_account: f.gl_account.trim(), category: f.category, amount: Number(f.amount) || 0, line_position: lp })
      onSaved()
    } catch { setSaving(false) }
  }
  const hint = lp === 'non_pnl' ? 'Tracked for cash coverage only — excluded from EBITDA and net income.'
    : lp === 'below_ebitda' ? 'Sits below EBITDA — reduces net income but not EBITDA.' : 'Operating expense — inside EBITDA.'
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100"><h3 className="font-bold text-gray-900">Add line · {period.label}</h3><button onClick={onClose}><X size={18} className="text-gray-400" /></button></div>
        <div className="p-4 space-y-3">
          <div><label className="text-[11px] font-semibold text-gray-500">Category</label><select className={inp} value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{ADD_CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label className="text-[11px] font-semibold text-gray-500">Account name</label><input className={inp} value={f.gl_account} onChange={e => setF({ ...f, gl_account: e.target.value })} placeholder="e.g. SBA loan principal" /></div>
          <div><label className="text-[11px] font-semibold text-gray-500">Amount ($)</label><input type="number" className={inp} value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></div>
          <p className="text-[11px] text-gray-400">{hint}</p>
        </div>
        <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="text-sm font-semibold text-gray-500 px-3 py-2">Cancel</button>
          <button onClick={save} disabled={!f.gl_account.trim() || !f.amount || saving} className="bg-red-600 text-white text-sm font-bold rounded-lg px-4 py-2 disabled:opacity-40 flex items-center gap-1.5">{saving && <Loader2 size={14} className="animate-spin" />} Save</button>
        </div>
      </div>
    </div>
  )
}

// One expandable P&L row: category total + band chip; click to reveal its accounts.
function PnlRow({ r, expanded, onToggle, indent }) {
  const canExpand = r.lines && r.lines.length > 0
  const pctCls = r.status === 'out' ? 'text-red-600' : r.status === 'good' ? 'text-green-600' : 'text-gray-700'
  return (
    <>
      <tr className={canExpand ? 'cursor-pointer hover:bg-gray-50' : ''} onClick={canExpand ? onToggle : undefined}>
        <td className="py-1.5 font-medium text-gray-800" style={{ paddingLeft: indent }}>
          <span className="inline-flex items-center gap-1">
            {canExpand ? (expanded ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />) : <span className="w-[13px] inline-block" />}
            {r.label}
          </span>
        </td>
        <td className="py-1.5 text-right text-gray-700">{r.amount == null ? '—' : $(r.amount)}</td>
        <td className={`py-1.5 text-right font-semibold ${pctCls}`}>{r.actual_pct == null ? '' : pct(r.actual_pct)}</td>
        <td className="py-1.5 pl-3 text-gray-400 text-xs">{r.low != null ? `${r.low}–${r.high}%${r.denom === 'retail_revenue' ? ' of retail' : ''}` : ''}</td>
        <td className="py-1.5 text-right pr-1">{r.status === 'out' && <span className="text-[10px] font-bold text-red-600 bg-red-50 rounded px-1.5 py-0.5">OUT</span>}{r.status === 'good' && <span className="text-[10px] font-bold text-green-600 bg-green-50 rounded px-1.5 py-0.5">GOOD</span>}</td>
      </tr>
      {expanded && canExpand && r.lines.map((l, i) => (
        <tr key={i} className="text-[13px] text-gray-500">
          <td className="py-1" style={{ paddingLeft: indent + 22 }}>{l.gl_account}</td>
          <td className="py-1 text-right">{$(l.amount)}</td><td /><td /><td />
        </tr>
      ))}
    </>
  )
}

// A named line you top up each month (e.g. Square fees) until it lives in QuickBooks.
// Upserts into monthly_pnl for the P&L month; remembers what's already there.
function ManualEntry({ period, label, note, gl_account, category, current, onSaved, line_position = 'operating' }) {
  const [v, setV] = useState(current == null ? '' : String(current))
  const [saving, setSaving] = useState(false)
  useEffect(() => { setV(current == null ? '' : String(current)) }, [current, period?.year, period?.month])
  const dirty = v !== (current == null ? '' : String(current))
  const save = async () => {
    if (v === '' || !dirty) return
    setSaving(true)
    try {
      await apiPost('/api/cfo/pnl', { period_year: period.year, period_month: period.month, gl_account, category, amount: Number(v) || 0, line_position })
      onSaved()
    } finally { setSaving(false) }
  }
  return (
    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-2">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-gray-800">{label} <span className="font-normal text-gray-400">· {period.label}</span></div>
        <div className="text-[11px] text-gray-400">{note}</div>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-gray-400 text-sm">$</span>
        <input type="number" value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()}
          placeholder="0" className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right" />
      </div>
      <button onClick={save} disabled={!dirty || v === '' || saving}
        className="text-[13px] font-bold text-white bg-red-600 rounded-lg px-3 py-1.5 disabled:opacity-40 flex items-center gap-1">
        {saving && <Loader2 size={13} className="animate-spin" />}{current == null ? 'Add' : 'Update'}
      </button>
    </div>
  )
}

export default function CfoDashboardPage() {
  const { currentStudio } = useStudio()
  const { isOwner } = useRole()
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [exp, setExp] = useState({})
  const [selMonth, setSelMonth] = useState(null)   // 'YYYY-M' or null = latest closed
  const load = useCallback((month) => {
    setLoading(true); setError('')
    apiGet('/api/cfo/overview' + (month ? `?month=${month}` : '')).then(setD).catch(e => setError(e?.message || 'Failed')).finally(() => setLoading(false))
  }, [currentStudio?.id])
  useEffect(() => { setSelMonth(null) }, [currentStudio?.id])
  useEffect(() => { load(selMonth) }, [currentStudio?.id, selMonth])

  if (!isOwner) return <div className="max-w-3xl mx-auto py-20 text-center text-sm text-gray-500">The CFO dashboard is owner-only.</div>
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-red-600" size={26} /></div>
  if (error) return <div className="max-w-3xl mx-auto bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
  if (!d) return null
  const { ttm, latest, unit, series, monthly, pnl_months, callouts, pnl } = d
  const reload = () => load(selMonth)
  const toggle = (k) => setExp(e => ({ ...e, [k]: !e[k] }))
  const ebGoalPct = ttm?.ebitda != null && ttm.ebitda_goal ? Math.max(0, Math.min(100, Math.round(ttm.ebitda / ttm.ebitda_goal * 100))) : 0
  const chipCls = (s) => s === 'out' ? 'text-red-600 bg-red-50' : s === 'good' ? 'text-green-600 bg-green-50' : 'text-gray-500 bg-gray-100'

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5"><LineIcon size={22} className="text-red-600" /> CFO Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">{currentStudio?.name} · trailing {ttm.months} months. Switch studios in the top bar to compare Pewaukee vs Madison.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-5">
        <Kpi label="TTM revenue" value={$(ttm.revenue)} sub={`${$(ttm.avg_monthly_revenue)}/mo avg`} />
        <Kpi label="Net margin" value={pct(ttm.net_margin_pct)} accent={ttm.net_margin_pct >= 20 ? 'text-green-600' : 'text-amber-600'} sub="TTM, rev − expenses" />
        <Kpi label="Active members" value={latest?.members ?? '—'} sub={latest ? `${latest.net_member_change >= 0 ? '+' : ''}${latest.net_member_change} this mo` : ''} accent={latest?.net_member_change < 0 ? 'text-red-600' : 'text-gray-900'} />
        <Kpi label="Churn" value={pct(latest?.churn_pct)} accent={latest?.churn_pct > 5.5 ? 'text-red-600' : 'text-gray-900'} sub={latest?.member_life_months ? `${latest.member_life_months}-mo life` : ''} />
        <Kpi label="ARPU" value={$(latest?.arpu)} sub="per member / mo" />
        <Kpi label="Retail" value={pct(latest?.retail_pct)} sub="of revenue" accent="text-emerald-600" />
      </div>

      {/* Path to refinance — TTM EBITDA vs $100k */}
      {ttm?.ebitda != null && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
          <div className="flex items-end justify-between flex-wrap gap-2 mb-2">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 flex items-center gap-1.5"><Target size={13} className="text-red-600" /> Path to refinance · trailing EBITDA</div>
              <div className="text-3xl font-black text-gray-900 mt-0.5">{$(ttm.ebitda)} <span className="text-lg font-bold text-gray-400">/ {$(ttm.ebitda_goal)}</span></div>
            </div>
            <div className="text-right">
              <div className={`text-sm font-bold ${ttm.ebitda >= ttm.ebitda_goal ? 'text-green-600' : 'text-gray-700'}`}>{ttm.ebitda >= ttm.ebitda_goal ? '🎉 Goal met' : `${$(ttm.ebitda_goal - ttm.ebitda)} to go`}</div>
              <div className="text-[11px] text-gray-400">{ttm.ebitda_months} mo of detail{ttm.ebitda_runrate != null ? ` · ~${$(ttm.ebitda_runrate)}/yr run-rate` : ''}</div>
            </div>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${ebGoalPct >= 100 ? 'bg-green-500' : 'bg-gradient-to-r from-orange-400 to-red-500'}`} style={{ width: `${ebGoalPct}%` }} />
          </div>
          <div className="text-[11px] text-gray-400 mt-1.5">{ebGoalPct}% of the $100k trailing-EBITDA target lenders look for. {ttm.ebitda_months < 12 ? `Based on ${ttm.ebitda_months} months so far — fills to a full 12-month trailing figure as more months close.` : ''}</div>
        </div>
      )}

      {/* Coaching rail */}
      {callouts.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-1.5 mb-2 text-gray-700 font-bold text-sm"><Lightbulb size={15} className="text-amber-500" /> Coaching</div>
          <div className="grid md:grid-cols-2 gap-2">
            {callouts.map((c, i) => (
              <div key={i} className={`border rounded-xl px-3.5 py-2.5 ${SEV[c.sev].cls}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${SEV[c.sev].dot}`} />
                  <span className="font-bold text-sm">{c.title}</span>
                  {c.months ? <span className="text-[11px] opacity-70">· {c.months} mo</span> : null}
                </div>
                <div className="text-[13px] mt-0.5">{c.gap}{c.annual ? <span className="font-semibold"> · {c.annual}</span> : ''}</div>
                <div className="text-[12px] opacity-80 mt-1">→ {c.action}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trends */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <Trend title="Revenue / mo" data={series} dataKey="revenue" fmt={$} />
        {monthly?.length > 0 && <Trend title="EBITDA / mo" data={monthly} dataKey="ebitda" fmt={$} />}
        {monthly?.length > 0 && <Trend title="EBITDA %" data={monthly} dataKey="ebitda_pct" fmt={pct} band={[20, 30]} />}
        <Trend title="Active members" data={series} dataKey="members" />
        <Trend title="Churn %" data={series} dataKey="churn_pct" fmt={pct} band={[0, 4.5]} />
        <Trend title="ARPU" data={series} dataKey="arpu" fmt={$} />
        <Trend title="Retail % of revenue" data={series} dataKey="retail_pct" fmt={pct} band={[10, 16]} />
        <Trend title="Net margin %" data={series} dataKey="net_margin_pct" fmt={pct} band={[20, 30]} />
      </div>

      {/* Monthly P&L — MoM table; click a month to load its full breakdown below */}
      {monthly?.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
          <div className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-1.5"><Table2 size={15} className="text-red-600" /> Month by month <span className="text-[11px] font-normal text-gray-400">· click a month to see its full P&amp;L below</span></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="text-[11px] uppercase tracking-wide text-gray-400"><tr>
                <th className="text-left py-1.5">Month</th><th className="text-right py-1.5">Revenue</th><th className="text-right py-1.5">Op. exp</th><th className="text-right py-1.5">EBITDA</th><th className="text-right py-1.5">EBITDA %</th><th className="text-right py-1.5">Net income</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {[...monthly].reverse().map(m => {
                  const key = `${m.year}-${m.month}`
                  const active = pnl?.period && pnl.period.year === m.year && pnl.period.month === m.month
                  return (
                    <tr key={key} onClick={() => setSelMonth(key)} className={`cursor-pointer ${active ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                      <td className={`py-1.5 font-medium ${active ? 'text-red-700' : 'text-gray-800'}`}>{m.label}</td>
                      <td className="py-1.5 text-right text-gray-700">{$(m.revenue)}</td>
                      <td className="py-1.5 text-right text-gray-500">{$(m.operating_total)}</td>
                      <td className="py-1.5 text-right font-semibold text-gray-900">{$(m.ebitda)}</td>
                      <td className={`py-1.5 text-right font-semibold ${m.ebitda_pct < 20 ? 'text-red-600' : m.ebitda_pct > 30 ? 'text-green-600' : 'text-gray-700'}`}>{pct(m.ebitda_pct)}</td>
                      <td className={`py-1.5 text-right ${m.net_income < 0 ? 'text-red-600' : 'text-gray-700'}`}>{$(m.net_income)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unit economics + Funnel */}
      <div className="grid md:grid-cols-2 gap-3 mb-5">
        {unit && (
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-1.5"><Users size={15} className="text-red-600" /> Unit economics</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-gray-400 text-[11px]">Break-even members</div><div className="font-black text-gray-900 text-lg">{unit.break_even_members ?? '—'}</div></div>
              <div><div className="text-gray-400 text-[11px]">Members over break-even</div><div className={`font-black text-lg ${unit.members_over_breakeven < 0 ? 'text-red-600' : 'text-green-600'}`}>{unit.members_over_breakeven == null ? '—' : (unit.members_over_breakeven > 0 ? '+' : '') + unit.members_over_breakeven}</div></div>
              <div><div className="text-gray-400 text-[11px]">Member life</div><div className="font-bold text-gray-900">{unit.member_life_months ? `${unit.member_life_months} mo` : '—'}</div></div>
              <div><div className="text-gray-400 text-[11px]">ARPU</div><div className="font-bold text-gray-900">{$(unit.arpu)}</div></div>
            </div>
            <p className="text-[11px] text-gray-400 mt-2">{unit.from_detail ? `Break-even = ${unit.period_label} operating + interest cost ÷ ARPU.` : 'Break-even is approximated from expenses ÷ ARPU until line detail lands.'}</p>
          </div>
        )}
        {latest && (
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-1.5"><TrendingUp size={15} className="text-red-600" /> Funnel — {latest.label}</div>
            <div className="space-y-2 text-sm">
              {[['Lead → booked', latest.lead_booked_pct, 45], ['Show rate (booked → held)', latest.booked_held_pct, 75], ['Close (held → joined)', latest.held_joined_pct, 50]].map(([lab, v, floor]) => (
                <div key={lab}>
                  <div className="flex justify-between text-xs mb-0.5"><span className="text-gray-500">{lab}</span><span className={`font-semibold ${v != null && v < floor ? 'text-red-600' : 'text-gray-800'}`}>{pct(v)}<span className="text-gray-300 font-normal"> / {floor}%+</span></span></div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${v != null && v < floor ? 'bg-red-400' : 'bg-green-500'}`} style={{ width: `${Math.min(100, v || 0)}%` }} /></div>
                </div>
              ))}
              <div className="text-[11px] text-gray-400 pt-1">{latest.leads} leads · {latest.booked} booked · {latest.held} held · {latest.new_members} joined</div>
            </div>
          </div>
        )}
      </div>

      {/* P&L waterfall */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="text-sm font-bold text-gray-800 flex items-center gap-1.5"><Percent size={15} className="text-red-600" /> P&amp;L vs benchmark bands</div>
          <div className="flex items-center gap-2">
            {pnl_months?.length > 0 && (
              <select value={pnl?.period ? `${pnl.period.year}-${pnl.period.month}` : ''} onChange={e => setSelMonth(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1 text-[13px] font-semibold text-gray-700">
                {pnl_months.map(m => <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>{m.label}</option>)}
              </select>
            )}
            {pnl?.period && <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-[13px] font-semibold text-red-600 border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-50"><Plus size={13} /> Add line</button>}
          </div>
        </div>
        {!pnl && <div className="text-sm text-gray-400 py-4">No P&amp;L data yet.</div>}
        {pnl && !pnl.has_detail && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[13px] text-amber-800 mb-2 flex items-start gap-2">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> No expense line detail yet for {pnl.period?.label}. Add lines to light up the bands.
          </div>
        )}
        {pnl && (
          <>
            <p className="text-[11px] text-gray-400 mb-1.5">Click any line to see the underlying QuickBooks accounts. Percentages are of {pnl.period?.label} revenue (from Studio Trends).</p>
            <ManualEntry period={pnl.period} label="Square fees" note="Manual until it's in QuickBooks — counts under Merchant + bank fees."
              gl_account="Square fees" category="merchant_fees"
              current={pnl.operating?.find(r => r.category === 'merchant_fees')?.lines?.find(l => l.gl_account === 'Square fees')?.amount ?? null}
              onSaved={reload} />
            {pnl.recon && (() => {
              const off = Math.abs(pnl.recon.delta_pct ?? 0) > 3
              return (
                <div className={`rounded-lg px-3 py-2 mb-2 text-[13px] flex items-start gap-2 border ${off ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Revenue check · SAIL vs QuickBooks:</span> SAIL {$(pnl.recon.sail_revenue)} vs QuickBooks {$(pnl.recon.qb_income)} — {pnl.recon.delta >= 0 ? '+' : ''}{$(pnl.recon.delta)} ({pnl.recon.delta_pct}%).{' '}
                    {off ? 'QuickBooks books less than SAIL collected — usually rewards redemptions or a timing/category difference. Worth a look with your bookkeeper.' : 'Within tolerance — accrual vs cash timing.'}
                  </div>
                </div>
              )
            })()}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-gray-400"><tr>
                  <th className="text-left py-1.5">Line</th><th className="text-right py-1.5">Actual</th><th className="text-right py-1.5">% rev</th><th className="text-left py-1.5 pl-3">Band</th><th className="py-1.5"></th>
                </tr></thead>
                <tbody>
                  {/* Revenue */}
                  <tr className="border-b border-gray-100"><td className="py-1.5 font-bold text-gray-900">Revenue <span className="text-gray-400 font-normal text-xs">· Studio Trends</span></td><td className="py-1.5 text-right font-bold text-gray-900">{$(pnl.revenue)}</td><td /><td /><td /></tr>
                  {pnl.revenue_mix.map(r => <PnlRow key={r.category} r={r} expanded={exp[r.category]} onToggle={() => toggle(r.category)} indent={14} />)}

                  {/* Operating */}
                  <tr className="border-t border-gray-100"><td className="pt-2.5 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400" colSpan={5}>Operating expenses</td></tr>
                  {pnl.operating.map(r => <PnlRow key={r.category} r={r} expanded={exp[r.category]} onToggle={() => toggle(r.category)} indent={14} />)}
                  <tr className="border-t border-gray-200"><td className="py-1.5 font-semibold text-gray-700 pl-3.5">Total operating expenses</td><td className="py-1.5 text-right font-semibold text-gray-800">{$(pnl.operating_total)}</td><td className="py-1.5 text-right text-gray-400 text-xs">{pnl.revenue > 0 ? pct(Math.round(pnl.operating_total / pnl.revenue * 1000) / 10) : ''}</td><td /><td /></tr>

                  {/* EBITDA */}
                  <tr className="border-t-2 border-gray-300 bg-gray-50">
                    <td className="py-2 font-black text-gray-900 pl-3.5">EBITDA</td>
                    <td className="py-2 text-right font-black text-gray-900">{$(pnl.ebitda)}</td>
                    <td className={`py-2 text-right font-black ${pnl.ebitda_status === 'out' ? 'text-red-600' : pnl.ebitda_status === 'good' ? 'text-green-600' : 'text-gray-800'}`}>{pct(pnl.ebitda_pct)}</td>
                    <td className="py-2 pl-3 text-gray-400 text-xs">{pnl.ebitda_band[0]}–{pnl.ebitda_band[1]}%</td>
                    <td className="py-2 text-right pr-1">{pnl.ebitda_status !== 'in' && pnl.ebitda_status !== 'na' && <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${chipCls(pnl.ebitda_status)}`}>{pnl.ebitda_status === 'out' ? 'LOW' : 'GOOD'}</span>}</td>
                  </tr>

                  {/* Below EBITDA → Net income */}
                  {pnl.below.length > 0 && <>
                    <tr><td className="pt-2.5 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400" colSpan={5}>Below EBITDA</td></tr>
                    {pnl.below.map(r => <PnlRow key={r.category} r={r} expanded={exp[r.category]} onToggle={() => toggle(r.category)} indent={14} />)}
                  </>}
                  <tr className="border-t border-gray-200">
                    <td className="py-1.5 font-bold text-gray-900 pl-3.5">Net income</td>
                    <td className={`py-1.5 text-right font-bold ${pnl.net_income < 0 ? 'text-red-600' : 'text-gray-900'}`}>{$(pnl.net_income)}</td>
                    <td className={`py-1.5 text-right font-semibold ${pnl.net_income < 0 ? 'text-red-600' : 'text-gray-700'}`}>{pct(pnl.net_margin_pct)}</td><td /><td />
                  </tr>

                  {/* Cash coverage (not P&L) */}
                  <tr><td className="pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400 flex items-center gap-1" colSpan={5}><Wallet size={12} /> Cash coverage · not EBITDA, not P&amp;L</td></tr>
                  {pnl.non_pnl.length === 0 && <tr><td className="py-1 text-[12px] text-gray-400 italic" style={{ paddingLeft: 14 }} colSpan={5}>Enter loan principal & credit-card payment below to see true cash coverage.</td></tr>}
                  {pnl.non_pnl.map(r => <PnlRow key={r.category} r={r} expanded={exp[r.category]} onToggle={() => toggle(r.category)} indent={14} />)}
                  {pnl.non_pnl.length > 0 && (
                    <tr className="border-t border-gray-200">
                      <td className="py-1.5 font-bold text-gray-900 pl-3.5">Cash left after everything</td>
                      <td className={`py-1.5 text-right font-black ${pnl.cash_after_all < 0 ? 'text-red-600' : 'text-green-600'}`}>{$(pnl.cash_after_all)}</td><td /><td /><td />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Manual debt entries + DSCR (outside the table) */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5 flex items-center gap-1"><Landmark size={12} /> Debt — enter each month (cash only, not P&amp;L)</div>
              <ManualEntry period={pnl.period} label="Loan principal" note="Principal portion of your loan payment (interest is already above, in EBITDA)."
                gl_account="Loan principal" category="loan_principal" line_position="non_pnl"
                current={pnl.non_pnl?.find(r => r.category === 'loan_principal')?.lines?.find(l => l.gl_account === 'Loan principal')?.amount ?? null} onSaved={reload} />
              <ManualEntry period={pnl.period} label="Credit card payment" note="What you pay the card this month — the purchases are already in operating expenses."
                gl_account="Credit card payment" category="credit_card" line_position="non_pnl"
                current={pnl.non_pnl?.find(r => r.category === 'credit_card')?.lines?.find(l => l.gl_account === 'Credit card payment')?.amount ?? null} onSaved={reload} />
              <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mt-1">
                <div>
                  <div className="text-[13px] font-semibold text-gray-800">Debt Service Coverage (DSCR)</div>
                  <div className="text-[11px] text-gray-400">EBITDA ÷ (interest + principal) · lenders want ≥ 1.25×</div>
                </div>
                <div className="text-right">
                  <div className={`text-xl font-black ${pnl.dscr == null ? 'text-gray-300' : pnl.dscr >= 1.25 ? 'text-green-600' : pnl.dscr >= 1 ? 'text-amber-600' : 'text-red-600'}`}>{pnl.dscr == null ? '—' : `${pnl.dscr.toFixed(2)}×`}</div>
                  {pnl.debt_service > 0 && <div className="text-[11px] text-gray-400">{$(pnl.debt_service)}/mo debt service</div>}
                </div>
              </div>
              {pnl.dscr == null && <div className="text-[11px] text-gray-400 mt-1">Enter loan principal above to calculate DSCR.</div>}
            </div>
          </>
        )}
      </div>

      {adding && pnl?.period && <AddLineModal period={pnl.period} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload() }} />}
    </div>
  )
}
