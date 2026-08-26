import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, apiDelete } from '@/hooks/useApi'
import { useStudio } from '@/contexts/StudioContext'
import { useRole } from '@/hooks/useRole'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea } from 'recharts'
import { LineChart as LineIcon, Loader2, TrendingUp, Users, DollarSign, Percent, Lightbulb, Plus, X, Trash2, AlertTriangle } from 'lucide-react'

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

function AddLineModal({ period, onClose, onSaved }) {
  const CATS = [
    ['payroll', 'Payroll + taxes'], ['occupancy', 'Occupancy (rent + CAM)'], ['utilities', 'Utilities'],
    ['royalty', 'Royalty'], ['virtual_instructor', 'Virtual instructor fee'], ['marketing', 'Local marketing'],
    ['merchant_fees', 'Merchant + bank fees'], ['software_pos', 'POS / software'], ['insurance', 'Insurance'],
    ['repairs_supplies', 'R&M + supplies'], ['admin_professional', 'Admin / legal / accounting'], ['retail_cogs', 'Retail COGS'],
    ['interest_expense', 'Interest expense'], ['depreciation', 'Depreciation'], ['other', 'Other'],
  ]
  const [f, setF] = useState({ gl_account: '', category: 'payroll', amount: '' })
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!f.gl_account.trim() || !f.amount) return
    setSaving(true)
    try {
      const below = ['interest_expense', 'depreciation'].includes(f.category)
      await apiPost('/api/cfo/pnl', { period_year: period.year, period_month: period.month, gl_account: f.gl_account.trim(), category: f.category, amount: Number(f.amount) || 0, line_position: below ? 'below_ebitda' : 'operating' })
      onSaved()
    } catch { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100"><h3 className="font-bold text-gray-900">Add expense line · {period.label}</h3><button onClick={onClose}><X size={18} className="text-gray-400" /></button></div>
        <div className="p-4 space-y-3">
          <div><label className="text-[11px] font-semibold text-gray-500">Category</label><select className={inp} value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label className="text-[11px] font-semibold text-gray-500">GL account (QuickBooks name)</label><input className={inp} value={f.gl_account} onChange={e => setF({ ...f, gl_account: e.target.value })} placeholder="Payroll – Wages" /></div>
          <div><label className="text-[11px] font-semibold text-gray-500">Amount ($)</label><input type="number" className={inp} value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></div>
        </div>
        <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="text-sm font-semibold text-gray-500 px-3 py-2">Cancel</button>
          <button onClick={save} disabled={!f.gl_account.trim() || !f.amount || saving} className="bg-red-600 text-white text-sm font-bold rounded-lg px-4 py-2 disabled:opacity-40 flex items-center gap-1.5">{saving && <Loader2 size={14} className="animate-spin" />} Save</button>
        </div>
      </div>
    </div>
  )
}

export default function CfoDashboardPage() {
  const { currentStudio } = useStudio()
  const { isOwnerOrManager } = useRole()
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const load = useCallback(() => {
    setLoading(true); setError('')
    apiGet('/api/cfo/overview').then(setD).catch(e => setError(e?.message || 'Failed')).finally(() => setLoading(false))
  }, [currentStudio?.id])
  useEffect(() => { load() }, [load])

  if (!isOwnerOrManager) return <div className="max-w-3xl mx-auto py-20 text-center text-sm text-gray-500">The CFO dashboard is for owners and managers.</div>
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-red-600" size={26} /></div>
  if (error) return <div className="max-w-3xl mx-auto bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
  if (!d) return null
  const { ttm, latest, unit, series, callouts, pnl, has_expense_detail } = d

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
        <Trend title="Net margin %" data={series} dataKey="net_margin_pct" fmt={pct} band={[20, 30]} />
        <Trend title="Active members" data={series} dataKey="members" />
        <Trend title="Churn %" data={series} dataKey="churn_pct" fmt={pct} band={[0, 4.5]} />
        <Trend title="ARPU" data={series} dataKey="arpu" fmt={$} />
        <Trend title="Retail % of revenue" data={series} dataKey="retail_pct" fmt={pct} band={[10, 16]} />
      </div>

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
            <p className="text-[11px] text-gray-400 mt-2">Break-even is approximated from this month's total expenses ÷ ARPU. It sharpens once expense line detail is entered below.</p>
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

      {/* P&L bands */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-bold text-gray-800 flex items-center gap-1.5"><Percent size={15} className="text-red-600" /> P&amp;L vs benchmark bands {latest ? `· ${latest.label}` : ''}</div>
          {latest && <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-[13px] font-semibold text-red-600 border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-50"><Plus size={13} /> Add expense line</button>}
        </div>
        {!has_expense_detail && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[13px] text-amber-800 mb-2 flex items-start gap-2">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> No expense line detail yet for {latest?.label}. Add your QuickBooks lines to light up the bands and see exactly where the money goes.
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-gray-400"><tr>
              <th className="text-left py-1.5">Line</th><th className="text-right py-1.5">Actual</th><th className="text-right py-1.5">% rev</th><th className="text-left py-1.5 pl-3">Band</th><th className="py-1.5"></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {pnl.map(p => (
                <tr key={p.category}>
                  <td className="py-1.5 font-medium text-gray-800">{p.label}</td>
                  <td className="py-1.5 text-right text-gray-700">{p.amount == null ? '—' : $(p.amount)}</td>
                  <td className={`py-1.5 text-right font-semibold ${p.status === 'out' ? 'text-red-600' : p.status === 'good' ? 'text-green-600' : 'text-gray-700'}`}>{p.actual_pct == null ? '—' : pct(p.actual_pct)}</td>
                  <td className="py-1.5 pl-3 text-gray-400 text-xs">{p.low}–{p.high}%{p.denom === 'retail_revenue' ? ' of retail' : ''}</td>
                  <td className="py-1.5 text-right">{p.status === 'out' && <span className="text-[10px] font-bold text-red-600 bg-red-50 rounded px-1.5 py-0.5">OUT</span>}{p.status === 'good' && <span className="text-[10px] font-bold text-green-600 bg-green-50 rounded px-1.5 py-0.5">GOOD</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {adding && latest && <AddLineModal period={latest} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
    </div>
  )
}
