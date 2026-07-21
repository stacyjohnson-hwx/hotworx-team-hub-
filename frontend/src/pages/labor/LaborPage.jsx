import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPut } from '@/hooks/useApi'
import { useStudio } from '@/contexts/StudioContext'
import { useMonth } from '@/hooks/useMonth'
import { Scale, Loader2, AlertCircle, Pencil, X, Info, DollarSign, Check } from 'lucide-react'

// "Worth-keeping" thresholds on the revenue-to-cost ratio. Editable in one place.
// Revenue here is only the POS + retail a person personally closed — not their
// full value (front desk, retention, coaching) — so keep the bands forgiving.
const BANDS = [
  { min: 2,   label: 'Keep',   cls: 'bg-green-100 text-green-700 border-green-200' },
  { min: 1,   label: 'Watch',  cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  { min: -Infinity, label: 'Review', cls: 'bg-red-100 text-red-700 border-red-200' },
]
const bandFor = (ratio) => ratio == null ? null : BANDS.find(b => ratio >= b.min)

const money = (n) => n == null ? '—' : '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })
const money2 = (n) => n == null ? '—' : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Inline editable hours override cell — shows scheduled hours, click to override.
function HoursCell({ row, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')
  const start = () => { setVal(row.hours_override != null ? String(row.hours_override) : ''); setEditing(true) }
  const save = async () => { setEditing(false); await onSave(val) }
  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input autoFocus type="number" step="0.5" value={val} onChange={e => setVal(e.target.value)}
          onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          placeholder={String(row.scheduled_hours)} className="w-16 border border-gray-300 rounded px-1.5 py-0.5 text-sm text-right" />
      </span>
    )
  }
  return (
    <button onClick={start} title="Click to override actual hours" className="group inline-flex items-center gap-1 hover:text-orange-600">
      {row.hours}
      {row.hours_override != null ? <span className="text-[9px] font-semibold text-orange-500">✎</span>
        : <Pencil size={10} className="text-gray-300 group-hover:text-orange-500" />}
    </button>
  )
}

// Set-pay-rates modal (owner enters hourly rate or monthly salary per person).
function RatesModal({ onClose, onSaved }) {
  const [rows, setRows] = useState(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { apiGet('/api/labor/rates').then(setRows).catch(() => setRows([])) }, [])
  const set = (i, k, v) => setRows(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r))
  const saveAll = async () => {
    setSaving(true)
    try {
      for (const r of rows) {
        await apiPut(`/api/labor/rates/${r.user_id}`, {
          pay_type: r.pay_type, hourly_rate: r.hourly_rate, monthly_salary: r.monthly_salary, active: r.active,
        })
      }
      onSaved()
    } catch { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Pay rates</h2>
            <p className="text-xs text-gray-500 mt-0.5">Set each person's pay. Hourly is multiplied by hours worked; salary is a flat monthly amount.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 mt-1"><X size={20} /></button>
        </div>
        <div className="px-6 py-4 space-y-3">
          {rows === null ? <p className="text-sm text-gray-400">Loading…</p>
            : rows.length === 0 ? <p className="text-sm text-gray-400">No team members found.</p>
            : rows.map((r, i) => (
              <div key={r.user_id} className={`border rounded-xl p-3 ${r.active ? 'border-gray-200' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-gray-800">{r.name}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 capitalize">{r.role}</span>
                  <label className="ml-auto flex items-center gap-1 text-[11px] text-gray-500">
                    <input type="checkbox" checked={r.active} onChange={e => set(i, 'active', e.target.checked)} /> Include
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <select value={r.pay_type} onChange={e => set(i, 'pay_type', e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                    <option value="hourly">Hourly</option>
                    <option value="salary">Salary</option>
                  </select>
                  {r.pay_type === 'salary' ? (
                    <div className="relative flex-1">
                      <DollarSign size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="number" step="0.01" value={r.monthly_salary ?? ''} onChange={e => set(i, 'monthly_salary', e.target.value)}
                        placeholder="Monthly salary" className="w-full border border-gray-300 rounded-lg pl-6 pr-2 py-1.5 text-sm" />
                    </div>
                  ) : (
                    <div className="relative flex-1">
                      <DollarSign size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="number" step="0.01" value={r.hourly_rate ?? ''} onChange={e => set(i, 'hourly_rate', e.target.value)}
                        placeholder="Per hour" className="w-full border border-gray-300 rounded-lg pl-6 pr-2 py-1.5 text-sm" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">/hr</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium">Cancel</button>
          <button onClick={saveAll} disabled={saving || !rows?.length}
            className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />} Save rates
          </button>
        </div>
      </div>
    </div>
  )
}

export default function LaborPage() {
  const { currentStudio } = useStudio()
  const { selectedMonth } = useMonth()
  const { month, year } = selectedMonth
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingRates, setEditingRates] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setData(await apiGet(`/api/labor/summary?year=${year}&month=${month}`)) }
    catch (e) { setError(e?.message || 'Failed to load') }
    finally { setLoading(false) }
  }, [currentStudio?.id, year, month])
  useEffect(() => { load() }, [load])

  const saveHours = async (userId, hours) => {
    try { await apiPut(`/api/labor/hours/${userId}`, { month, year, hours }); await load() } catch { /* ignore */ }
  }

  const rows = data?.rows || []
  const totals = data?.totals || {}
  const anyRates = rows.some(r => r.has_rate)

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <Scale size={22} className="text-orange-500" /> Team ROI
          </h1>
          <p className="text-sm text-gray-500 mt-1">Pay vs revenue · {MONTHS[month]} {year}</p>
        </div>
        <button onClick={() => setEditingRates(true)}
          className="flex items-center gap-2 text-[13px] font-semibold text-white bg-orange-500 hover:bg-orange-600 px-3.5 py-2 rounded-lg">
          <DollarSign size={14} /> Pay rates
        </button>
      </div>

      {error && (
        <div className="mb-5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /><span>Couldn't load: {error}</span>
        </div>
      )}

      {!anyRates && !loading && (
        <div className="mb-5 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-800 flex items-start gap-2">
          <Info size={16} className="flex-shrink-0 mt-0.5" />
          <span>No pay rates set yet. Tap <strong>Pay rates</strong> to enter each person's hourly rate or salary — then costs and ratios fill in.</span>
        </div>
      )}

      {loading && !data ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-300" size={28} /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="text-left font-semibold px-4 py-2.5">Employee</th>
                  <th className="text-right font-semibold px-3 py-2.5">Hours</th>
                  <th className="text-right font-semibold px-3 py-2.5">Rate</th>
                  <th className="text-right font-semibold px-3 py-2.5">Wage</th>
                  <th className="text-right font-semibold px-3 py-2.5">Comm.</th>
                  <th className="text-right font-semibold px-3 py-2.5">Total cost</th>
                  <th className="text-right font-semibold px-3 py-2.5">Revenue</th>
                  <th className="text-right font-semibold px-3 py-2.5">Net</th>
                  <th className="text-right font-semibold px-3 py-2.5">Ratio</th>
                  <th className="text-center font-semibold px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const band = bandFor(r.ratio)
                  return (
                    <tr key={r.user_id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{r.name}</div>
                        <div className="text-[11px] text-gray-400 capitalize">{r.role} · {r.memberships} memb · {r.outreach} outreach</div>
                      </td>
                      <td className="px-3 py-3 text-right text-gray-700"><HoursCell row={r} onSave={(h) => saveHours(r.user_id, h)} /></td>
                      <td className="px-3 py-3 text-right text-gray-500">
                        {r.has_rate ? (r.pay_type === 'salary' ? `${money(r.monthly_salary)}/mo` : `$${r.hourly_rate}/hr`) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-700">{money(r.base_wage)}</td>
                      <td className="px-3 py-3 text-right text-gray-700">{money(r.commission)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-gray-900">{money(r.total_cost)}</td>
                      <td className="px-3 py-3 text-right text-gray-900">{money(r.revenue)}</td>
                      <td className={`px-3 py-3 text-right font-semibold ${r.net >= 0 ? 'text-green-700' : 'text-red-600'}`}>{r.net >= 0 ? '' : '−'}{money(Math.abs(r.net))}</td>
                      <td className="px-3 py-3 text-right font-bold text-gray-900">{r.ratio == null ? '—' : `${r.ratio}×`}</td>
                      <td className="px-3 py-3 text-center">
                        {band ? <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${band.cls}`}>{band.label}</span>
                          : <button onClick={() => setEditingRates(true)} className="text-[11px] font-semibold text-orange-600 hover:underline">Set rate</button>}
                      </td>
                    </tr>
                  )
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-400">No team members for this studio.</td></tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-100 bg-gray-50/60 font-semibold text-gray-900">
                    <td className="px-4 py-3">Studio total <span className="text-[11px] font-normal text-gray-400">({totals.headcount})</span></td>
                    <td className="px-3 py-3 text-right">{totals.hours}</td>
                    <td></td><td></td><td></td>
                    <td className="px-3 py-3 text-right">{money(totals.total_cost)}</td>
                    <td className="px-3 py-3 text-right">{money(totals.revenue)}</td>
                    <td className={`px-3 py-3 text-right ${totals.net >= 0 ? 'text-green-700' : 'text-red-600'}`}>{totals.net >= 0 ? '' : '−'}{money(Math.abs(totals.net || 0))}</td>
                    <td className="px-3 py-3 text-right">{totals.ratio == null ? '—' : `${totals.ratio}×`}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      <div className="mt-3 text-[11px] text-gray-400 flex items-start gap-1.5 max-w-3xl">
        <Info size={12} className="flex-shrink-0 mt-0.5" />
        <span>
          <strong>Revenue</strong> is the POS + retail this person closed that month (from SAIL) — it doesn't capture front-desk coverage, retention, or coaching, so treat the ratio as one signal, not the whole story.
          <strong> Total cost</strong> = hours × rate + commission earned. Hours come from the Schedule (click a number to enter actual hours). <strong>Ratio</strong> = revenue ÷ total cost.
        </span>
      </div>

      {editingRates && <RatesModal onClose={() => setEditingRates(false)} onSaved={() => { setEditingRates(false); load() }} />}
    </div>
  )
}
