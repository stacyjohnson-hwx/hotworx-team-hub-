import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPut } from '@/hooks/useApi'
import { useMonth } from '@/hooks/useMonth'
import { useStudio } from '@/contexts/StudioContext'
import { formatCurrency } from '@/lib/utils'
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart,
} from 'recharts'

// ── Helpers ───────────────────────────────────────────────────────────────────

function monthLabel(month, year) {
  return new Date(year, month - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function pct(a, b) {
  if (!b || b === 0) return 0
  return Math.round((a / b) * 100)
}

function fmt$(n) { return formatCurrency(Number(n) || 0) }
function fmtN(n) { return (Number(n) || 0).toLocaleString() }

// ── Small UI pieces ───────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active ? 'bg-red-600 text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  )
}

function SectionCard({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">{title}</h3>
      {children}
    </div>
  )
}

function NumInput({ label, value, onChange, prefix, isCurrency }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <div className="relative">
        {(prefix || isCurrency) && (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
            {isCurrency ? '$' : prefix}
          </span>
        )}
        <input
          type="number"
          value={value ?? ''}
          onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className={`w-full bg-white border border-gray-300 rounded-lg py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 ${
            isCurrency || prefix ? 'pl-6 pr-3' : 'px-3'
          }`}
        />
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, color = 'text-gray-900' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

const CHART_COLORS = {
  red:    '#C8102E',
  blue:   '#3b82f6',
  green:  '#16a34a',
  purple: '#9333ea',
  yellow: '#ca8a04',
  orange: '#ea580c',
  pink:   '#ec4899',
  cyan:   '#0891b2',
}

// ── Default row shape ─────────────────────────────────────────────────────────

const DEFAULTS = {
  vending: 0, retail: 0, rewards: 0, refunds: 0,
  membership_cash: 0, net_eft: 0, eft_increase: 0, eft_decrease: 0,
  net_eft_increase: 0, in_the_bank: 0, itb_goal: 0, expenses: 0, net_income: 0,
  leads: 0, red_appts_booked: 0, red_appts_held: 0,
  new_members: 0, cancellations: 0, total_member_count: 0,
  instagram_followers: 0, facebook_followers: 0, tiktok_followers: 0,
  five_star_reviews: 0, calls_made: 0, texts_made: 0, manager_notes: '',
}

// ── Month picker ──────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function MonthPicker({ month, year, onChange }) {
  const now = new Date()
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i)

  return (
    <div className="flex items-center gap-2">
      <select
        value={month}
        onChange={e => onChange(Number(e.target.value), year)}
        className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-red-600"
      >
        {MONTH_NAMES.map((name, i) => (
          <option key={i + 1} value={i + 1}>{name}</option>
        ))}
      </select>
      <select
        value={year}
        onChange={e => onChange(month, Number(e.target.value))}
        className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-red-600"
      >
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  )
}

// ── Data Entry tab ────────────────────────────────────────────────────────────

function DataEntryTab({ month: initialMonth, year: initialYear }) {
  const [entryMonth, setEntryMonth] = useState(initialMonth)
  const [entryYear, setEntryYear]   = useState(initialYear)
  const [data, setData] = useState({ ...DEFAULTS, month: initialMonth, year: initialYear })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setEntryMonth(initialMonth)
    setEntryYear(initialYear)
  }, [initialMonth, initialYear])

  useEffect(() => {
    setLoading(true)
    setError(null)
    setSaved(false)
    apiGet(`/api/studio-trends/${entryYear}/${entryMonth}`)
      .then(d => setData({ ...DEFAULTS, ...d, month: entryMonth, year: entryYear }))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [entryMonth, entryYear])

  const handleMonthChange = (m, y) => { setEntryMonth(m); setEntryYear(y) }
  const set = (field, val) => setData(prev => ({ ...prev, [field]: val }))

  const handleSave = async () => {
    setSaving(true); setError(null)
    try {
      const result = await apiPut('/api/studio-trends', {
        ...data,
        net_eft_increase: (Number(data.eft_increase) || 0) - (Number(data.eft_decrease) || 0),
        month: entryMonth,
        year: entryYear,
      })
      setData({ ...DEFAULTS, ...result })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const netEftChange = (Number(data.eft_increase) || 0) - (Number(data.eft_decrease) || 0)
  const convRate  = pct(data.red_appts_held, data.leads)
  const showRate  = pct(data.red_appts_held, data.red_appts_booked)
  const netMembers = (data.new_members || 0) - (data.cancellations || 0)

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading…</div>

  return (
    <div className="space-y-5">
      {/* Month selector */}
      <div className="flex items-center gap-4 bg-gray-50 rounded-xl border border-gray-200 px-5 py-3">
        <span className="text-sm text-gray-500 whitespace-nowrap">Entering data for:</span>
        <MonthPicker month={entryMonth} year={entryYear} onChange={handleMonthChange} />
        <span className="text-xs text-gray-400 ml-1">Use this to jump to any historical month</span>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

      {/* Financial */}
      <SectionCard title="Financial">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <NumInput label="Vending"          value={data.vending}          onChange={v => set('vending', v)}          isCurrency />
          <NumInput label="Retail"           value={data.retail}           onChange={v => set('retail', v)}           isCurrency />
          <NumInput label="Rewards"          value={data.rewards}          onChange={v => set('rewards', v)}          isCurrency />
          <NumInput label="Refunds"          value={data.refunds}          onChange={v => set('refunds', v)}          isCurrency />
          <NumInput label="Membership Cash"  value={data.membership_cash}  onChange={v => set('membership_cash', v)}  isCurrency />
          <NumInput label="EFT Increase"     value={data.eft_increase}     onChange={v => set('eft_increase', v)}     isCurrency />
          <NumInput label="EFT Decrease"     value={data.eft_decrease}     onChange={v => set('eft_decrease', v)}     isCurrency />
          <NumInput label="Monthly EFT" value={data.net_eft} onChange={v => set('net_eft', v)} isCurrency />
          <div>
            <label className="block text-xs text-gray-500 mb-1">EFT Change</label>
            <div className="w-full bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-sm font-medium" style={{ color: netEftChange >= 0 ? '#15803d' : '#dc2626' }}>
              {netEftChange >= 0 ? '+' : ''}{fmt$(netEftChange)}
              <span className="text-xs text-gray-400 font-normal ml-1">auto-calculated</span>
            </div>
          </div>
          <NumInput label="In The Bank"      value={data.in_the_bank}      onChange={v => set('in_the_bank', v)}      isCurrency />
          <NumInput label="ITB Goal"         value={data.itb_goal}         onChange={v => set('itb_goal', v)}         isCurrency />
          <NumInput label="Expenses"         value={data.expenses}         onChange={v => set('expenses', v)}         isCurrency />
          <NumInput label="Net Income"       value={data.net_income}       onChange={v => set('net_income', v)}       isCurrency />
        </div>
      </SectionCard>

      {/* Membership & Appointments */}
      <SectionCard title="Membership & Appointments">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <NumInput label="Leads"              value={data.leads}              onChange={v => set('leads', v)} />
          <NumInput label="Red Appts Booked"   value={data.red_appts_booked}   onChange={v => set('red_appts_booked', v)} />
          <NumInput label="Red Appts Held"     value={data.red_appts_held}     onChange={v => set('red_appts_held', v)} />
          <NumInput label="New Members"        value={data.new_members}        onChange={v => set('new_members', v)} />
          <NumInput label="Cancellations"      value={data.cancellations}      onChange={v => set('cancellations', v)} />
          <NumInput label="Total Member Count" value={data.total_member_count} onChange={v => set('total_member_count', v)} />
        </div>
        <div className="mt-3 flex gap-4 flex-wrap">
          <span className="text-xs text-gray-500">Lead conversion: <strong className="text-gray-700">{convRate}%</strong></span>
          <span className="text-xs text-gray-500">Appt show rate: <strong className="text-gray-700">{showRate}%</strong></span>
          <span className="text-xs text-gray-500">Net member change: <strong className={netMembers >= 0 ? 'text-green-600' : 'text-red-600'}>{netMembers >= 0 ? '+' : ''}{netMembers}</strong></span>
        </div>
      </SectionCard>

      {/* Team Activity */}
      <SectionCard title="Team Activity">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <NumInput label="Calls Made" value={data.calls_made} onChange={v => set('calls_made', v)} />
          <NumInput label="Texts Made" value={data.texts_made} onChange={v => set('texts_made', v)} />
        </div>
      </SectionCard>

      {/* Social Media */}
      <SectionCard title="Social Media">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <NumInput label="Instagram Followers" value={data.instagram_followers} onChange={v => set('instagram_followers', v)} />
          <NumInput label="Facebook Followers"  value={data.facebook_followers}  onChange={v => set('facebook_followers', v)} />
          <NumInput label="TikTok Followers"    value={data.tiktok_followers}    onChange={v => set('tiktok_followers', v)} />
          <NumInput label="5-Star Reviews"      value={data.five_star_reviews}   onChange={v => set('five_star_reviews', v)} />
        </div>
      </SectionCard>

      {/* Manager Notes */}
      <SectionCard title="Manager Notes">
        <textarea
          value={data.manager_notes || ''}
          onChange={e => set('manager_notes', e.target.value)}
          rows={3}
          className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 resize-none"
          placeholder="Notes for this month…"
        />
      </SectionCard>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : `Save ${MONTH_NAMES[entryMonth - 1]} ${entryYear}`}
        </button>
        {saved && <span className="text-green-600 text-sm font-medium">✓ Saved {MONTH_NAMES[entryMonth - 1]} {entryYear}</span>}
      </div>
    </div>
  )
}

// ── Table tab ─────────────────────────────────────────────────────────────────

function TableTab() {
  const { currentStudio } = useStudio()
  const now = new Date()
  const [startYear, setStartYear]   = useState(now.getFullYear() - 1)
  const [startMonth, setStartMonth] = useState(now.getMonth() + 1)
  const [endYear, setEndYear]       = useState(now.getFullYear())
  const [endMonth, setEndMonth]     = useState(now.getMonth() + 1)
  const [rows, setRows]   = useState([])
  const [loading, setLoading] = useState(true)
  const [yoy, setYoy]     = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    apiGet(`/api/studio-trends?startYear=${startYear}&startMonth=${startMonth}&endYear=${endYear}&endMonth=${endMonth}`)
      .then(setRows)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [startYear, startMonth, endYear, endMonth])

  useEffect(() => { load() }, [load])

  // Reload when studio changes
  useEffect(() => {
    if (currentStudio?.id) {
      load()
    }
  }, [currentStudio?.id, load])

  const prevYearMap = {}
  if (yoy) {
    for (const r of rows) prevYearMap[`${r.year - 1}-${r.month}`] = r
  }

  const sel = 'bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-red-600'

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 bg-gray-50 rounded-xl border border-gray-200 p-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Start</label>
          <div className="flex gap-2">
            <select value={startMonth} onChange={e => setStartMonth(Number(e.target.value))} className={sel}>
              {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{new Date(2000,m-1).toLocaleString('default',{month:'short'})}</option>)}
            </select>
            <select value={startYear} onChange={e => setStartYear(Number(e.target.value))} className={sel}>
              {[now.getFullYear()-2, now.getFullYear()-1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">End</label>
          <div className="flex gap-2">
            <select value={endMonth} onChange={e => setEndMonth(Number(e.target.value))} className={sel}>
              {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{new Date(2000,m-1).toLocaleString('default',{month:'short'})}</option>)}
            </select>
            <select value={endYear} onChange={e => setEndYear(Number(e.target.value))} className={sel}>
              {[now.getFullYear()-1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600 ml-2">
          <input type="checkbox" checked={yoy} onChange={e => setYoy(e.target.checked)} className="w-4 h-4 accent-red-600" />
          YoY comparison
        </label>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

      {!loading && (
        <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 w-fit">
          <span className="text-amber-500">◆</span>
          <span>Highlighted rows are <strong>{new Date(2000, now.getMonth()).toLocaleString('default', { month: 'long' })}</strong> from past years — same month as today, for easy goal comparison</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200">
                <th className="sticky left-0 bg-gray-100 px-3 py-2" />
                <th colSpan={11} className="text-center px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide border-l border-gray-200">Financial</th>
                <th colSpan={7}  className="text-center px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide border-l border-gray-200">Membership</th>
                <th colSpan={4}  className="text-center px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide border-l border-gray-200">Conversion Rates</th>
                <th colSpan={2}  className="text-center px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide border-l border-gray-200">Activity</th>
                <th colSpan={4}  className="text-center px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide border-l border-gray-200">Social</th>
                {yoy && <th colSpan={1} className="text-center px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide border-l border-gray-200">YoY</th>}
              </tr>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="sticky left-0 bg-gray-50 text-left px-3 py-2.5 text-gray-700 font-semibold whitespace-nowrap">Month</th>
                {['Vending','Retail','Rewards','Refunds','Memb. Cash','EFT Inc.','EFT Dec.','Monthly EFT','EFT Change','In The Bank','Net Income'].map((h,i) => (
                  <th key={h} className={`text-right px-3 py-2.5 text-gray-600 font-semibold whitespace-nowrap ${i===0?'border-l border-gray-200':''}`}>{h}</th>
                ))}
                {['Leads','Red Bkd','Red Held','New Mbrs','Cancels','Total Mbrs','Net Mbr Chg'].map((h,i) => (
                  <th key={h} className={`text-right px-3 py-2.5 text-gray-600 font-semibold whitespace-nowrap ${i===0?'border-l border-gray-200':''}`}>{h}</th>
                ))}
                {['Leads→Red','Bkd→Held','Red→Mbr','Lead→Mbr'].map((h,i) => (
                  <th key={h} className={`text-right px-3 py-2.5 text-gray-600 font-semibold whitespace-nowrap ${i===0?'border-l border-gray-200':''}`}>{h}</th>
                ))}
                {['Calls','Texts'].map((h,i) => (
                  <th key={h} className={`text-right px-3 py-2.5 text-gray-600 font-semibold whitespace-nowrap ${i===0?'border-l border-gray-200':''}`}>{h}</th>
                ))}
                {['IG','FB','TikTok','⭐'].map((h,i) => (
                  <th key={h} className={`text-right px-3 py-2.5 text-gray-600 font-semibold whitespace-nowrap ${i===0?'border-l border-gray-200':''}`}>{h}</th>
                ))}
                {yoy && <th className="text-right px-3 py-2.5 text-gray-600 font-semibold whitespace-nowrap border-l border-gray-200">ITB vs LY</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const leadsToRed = pct(r.red_appts_booked, r.leads)
                const bkdToHeld  = pct(r.red_appts_held,   r.red_appts_booked)
                const redToMbr   = pct(r.new_members,       r.red_appts_held)
                const leadToMbr  = pct(r.new_members,       r.leads)
                const netMbr     = (r.new_members || 0) - (r.cancellations || 0)
                const ly         = yoy ? (prevYearMap[`${r.year}-${r.month}`] || null) : null
                const itbDiff    = ly ? ((r.in_the_bank || 0) - (ly.in_the_bank || 0)) : null
                const isSameMonth = r.month === (now.getMonth() + 1)

                const td  = `text-right px-3 py-2.5 whitespace-nowrap ${isSameMonth ? 'text-amber-900' : 'text-gray-800'}`
                const tdL = `text-right px-3 py-2.5 whitespace-nowrap border-l border-gray-100 ${isSameMonth ? 'text-amber-900' : 'text-gray-800'}`

                return (
                  <tr key={`${r.year}-${r.month}`} className={`border-b whitespace-nowrap ${isSameMonth ? 'bg-amber-50 border-amber-200 hover:bg-amber-100/70' : 'border-gray-100 hover:bg-blue-50/40'}`}>
                    <td className={`sticky left-0 px-3 py-2.5 font-semibold whitespace-nowrap ${isSameMonth ? 'bg-amber-50 text-amber-800 border-l-2 border-l-amber-400' : 'bg-white text-gray-900'}`}>
                      {isSameMonth && <span className="mr-1 text-amber-500 text-xs">◆</span>}
                      {monthLabel(r.month, r.year)}
                    </td>
                    <td className={tdL}>{fmt$(r.vending)}</td>
                    <td className={td}>{fmt$(r.retail)}</td>
                    <td className={td}>{fmt$(r.rewards)}</td>
                    <td className={td}>{fmt$(r.refunds)}</td>
                    <td className={td}>{fmt$(r.membership_cash)}</td>
                    <td className={td}>{fmt$(r.eft_increase)}</td>
                    <td className={td}>{fmt$(r.eft_decrease)}</td>
                    <td className={td}>{fmt$(r.net_eft)}</td>
                    <td className={`text-right px-3 py-2.5 whitespace-nowrap font-medium ${(r.net_eft_increase||0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>{(r.net_eft_increase||0) >= 0 ? '+' : ''}{fmt$(r.net_eft_increase)}</td>
                    <td className={td}>{fmt$(r.in_the_bank)}</td>
                    <td className={`text-right px-3 py-2.5 whitespace-nowrap font-medium ${(r.net_income||0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt$(r.net_income)}</td>
                    <td className={tdL}>{fmtN(r.leads)}</td>
                    <td className={td}>{fmtN(r.red_appts_booked)}</td>
                    <td className={td}>{fmtN(r.red_appts_held)}</td>
                    <td className="text-right px-3 py-2.5 text-green-700 font-medium whitespace-nowrap">+{fmtN(r.new_members)}</td>
                    <td className="text-right px-3 py-2.5 text-red-600 font-medium whitespace-nowrap">-{fmtN(r.cancellations)}</td>
                    <td className={td}>{fmtN(r.total_member_count)}</td>
                    <td className={`text-right px-3 py-2.5 whitespace-nowrap font-medium ${netMbr >= 0 ? 'text-green-700' : 'text-red-600'}`}>{netMbr >= 0 ? '+' : ''}{fmtN(netMbr)}</td>
                    <td className={`${td} border-l border-gray-100`}>{leadsToRed}%</td>
                    <td className={td}>{bkdToHeld}%</td>
                    <td className={td}>{redToMbr}%</td>
                    <td className={td}>{leadToMbr}%</td>
                    <td className={`${td} border-l border-gray-100`}>{fmtN(r.calls_made)}</td>
                    <td className={td}>{fmtN(r.texts_made)}</td>
                    <td className={`${td} border-l border-gray-100`}>{fmtN(r.instagram_followers)}</td>
                    <td className={td}>{fmtN(r.facebook_followers)}</td>
                    <td className={td}>{fmtN(r.tiktok_followers)}</td>
                    <td className="text-right px-3 py-2.5 text-yellow-600 font-medium whitespace-nowrap">{fmtN(r.five_star_reviews)}</td>
                    {yoy && (
                      <td className={`text-right px-3 py-2.5 whitespace-nowrap font-medium border-l border-gray-100 ${itbDiff === null ? 'text-gray-400' : itbDiff >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {itbDiff === null ? '—' : `${itbDiff >= 0 ? '+' : ''}${fmt$(itbDiff)}`}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Dashboard tab ─────────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label, currency }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-gray-500 mb-1 font-medium">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {currency ? fmt$(p.value) : fmtN(p.value)}
        </p>
      ))}
    </div>
  )
}

function DashboardTab() {
  const now = new Date()
  const [months, setMonths] = useState(12)
  const [data, setData]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const end   = new Date()
    const start = new Date(end.getFullYear(), end.getMonth() - (months - 1), 1)
    apiGet(
      `/api/studio-trends?startYear=${start.getFullYear()}&startMonth=${start.getMonth()+1}&endYear=${end.getFullYear()}&endMonth=${end.getMonth()+1}`
    ).then(rows => {
      setData(rows.map(r => ({
        ...r,
        label: monthLabel(r.month, r.year),
        conv_rate:   pct(r.red_appts_held, r.leads),
        show_rate:   pct(r.red_appts_held, r.red_appts_booked),
        net_members: (r.new_members || 0) - (r.cancellations || 0),
      })))
    }).finally(() => setLoading(false))
  }, [months])

  if (loading) return <div className="text-center py-20 text-gray-400 text-sm">Loading dashboard…</div>

  const latest    = data[data.length - 1] || {}
  const prev      = data[data.length - 2] || {}
  const itbVsGoal = latest.itb_goal > 0
    ? Math.round(((latest.in_the_bank || 0) / latest.itb_goal) * 100)
    : null

  const chartProps = {
    cartesian: { strokeDasharray: '3 3', stroke: '#e5e7eb' },
    axis:      { fill: '#6b7280', fontSize: 11 },
    axisSmall: { fill: '#6b7280', fontSize: 10 },
  }

  return (
    <div className="space-y-5">
      {/* Time filter */}
      <div className="flex gap-2">
        {[6, 12, 24].map(m => (
          <button key={m} onClick={() => setMonths(m)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${months === m ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {m} months
          </button>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Monthly EFT (latest)"
          value={fmt$(latest.net_eft)}
          sub={prev.net_eft != null ? `${latest.net_eft >= prev.net_eft ? '↑' : '↓'} vs prior month` : undefined}
          color="text-blue-600"
        />
        <StatCard
          label="In The Bank"
          value={fmt$(latest.in_the_bank)}
          sub={itbVsGoal != null ? `${itbVsGoal}% of goal` : undefined}
          color="text-blue-600"
        />
        <StatCard
          label="Total Members"
          value={fmtN(latest.total_member_count)}
          sub={latest.net_members != null ? `${latest.net_members >= 0 ? '+' : ''}${latest.net_members} this month` : undefined}
          color="text-purple-600"
        />
        <StatCard
          label="5-Star Reviews"
          value={fmtN(latest.five_star_reviews)}
          sub="running total"
          color="text-yellow-600"
        />
      </div>

      {/* Revenue trend */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Revenue Trends</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid {...chartProps.cartesian} />
            <XAxis dataKey="label" tick={chartProps.axis} tickLine={false} />
            <YAxis tick={chartProps.axis} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip currency />} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
            <Line type="monotone" dataKey="net_eft"     name="Monthly EFT" stroke={CHART_COLORS.red}   strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="in_the_bank" name="In The Bank" stroke={CHART_COLORS.blue}  strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="net_income"  name="Net Income"  stroke={CHART_COLORS.green} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Membership + Conversion */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Membership Movement</h3>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid {...chartProps.cartesian} />
              <XAxis dataKey="label" tick={chartProps.axisSmall} tickLine={false} />
              <YAxis tick={chartProps.axisSmall} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
              <Bar  dataKey="new_members"   name="New"    fill={CHART_COLORS.green} radius={[2,2,0,0]} />
              <Bar  dataKey="cancellations" name="Cancel" fill={CHART_COLORS.red}   radius={[2,2,0,0]} />
              <Line type="monotone" dataKey="net_members" name="Net" stroke={CHART_COLORS.blue} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Conversion & Show Rates</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid {...chartProps.cartesian} />
              <XAxis dataKey="label" tick={chartProps.axisSmall} tickLine={false} />
              <YAxis tick={chartProps.axisSmall} tickLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
              <Line type="monotone" dataKey="conv_rate" name="Lead Conv %"  stroke={CHART_COLORS.purple} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="show_rate" name="Appt Show %"  stroke={CHART_COLORS.orange} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Social Media */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Social Media Growth</h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="igGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={CHART_COLORS.pink} stopOpacity={0.2}/><stop offset="95%" stopColor={CHART_COLORS.pink} stopOpacity={0}/></linearGradient>
              <linearGradient id="fbGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={CHART_COLORS.blue} stopOpacity={0.2}/><stop offset="95%" stopColor={CHART_COLORS.blue} stopOpacity={0}/></linearGradient>
              <linearGradient id="ttGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={CHART_COLORS.cyan} stopOpacity={0.2}/><stop offset="95%" stopColor={CHART_COLORS.cyan} stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid {...chartProps.cartesian} />
            <XAxis dataKey="label" tick={chartProps.axis} tickLine={false} />
            <YAxis tick={chartProps.axis} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
            <Area type="monotone" dataKey="instagram_followers" name="Instagram" stroke={CHART_COLORS.pink} fill="url(#igGrad)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="facebook_followers"  name="Facebook"  stroke={CHART_COLORS.blue} fill="url(#fbGrad)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="tiktok_followers"    name="TikTok"    stroke={CHART_COLORS.cyan} fill="url(#ttGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Activity + Reviews */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Team Activity</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid {...chartProps.cartesian} />
              <XAxis dataKey="label" tick={chartProps.axisSmall} tickLine={false} />
              <YAxis tick={chartProps.axisSmall} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
              <Bar dataKey="calls_made" name="Calls" fill={CHART_COLORS.green}  radius={[2,2,0,0]} />
              <Bar dataKey="texts_made" name="Texts" fill={CHART_COLORS.purple} radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Leads & Reviews</h3>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid {...chartProps.cartesian} />
              <XAxis dataKey="label" tick={chartProps.axisSmall} tickLine={false} />
              <YAxis yAxisId="left"  tick={chartProps.axisSmall} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={chartProps.axisSmall} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
              <Bar  yAxisId="left"  dataKey="leads"           name="Leads"    fill={CHART_COLORS.blue}   radius={[2,2,0,0]} />
              <Line yAxisId="right" type="monotone" dataKey="five_star_reviews" name="⭐ Total" stroke={CHART_COLORS.yellow} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* EFT breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">EFT Movement</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid {...chartProps.cartesian} />
            <XAxis dataKey="label" tick={chartProps.axis} tickLine={false} />
            <YAxis tick={chartProps.axis} tickLine={false} tickFormatter={v => fmt$(v)} />
            <Tooltip content={<CustomTooltip currency />} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
            <Bar dataKey="eft_increase" name="EFT ↑" fill={CHART_COLORS.green} radius={[2,2,0,0]} />
            <Bar dataKey="eft_decrease" name="EFT ↓" fill={CHART_COLORS.red}   radius={[2,2,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StudioTrendsPage() {
  const { selectedMonth } = useMonth()
  const { currentStudio } = useStudio()
  const { month, year } = selectedMonth
  const [tab, setTab] = useState('table')

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Studio Trends</h1>
          <p className="text-sm text-gray-500 mt-0.5">Monthly performance data — owner &amp; manager only</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl border border-gray-200 p-1">
          <TabBtn active={tab === 'table'}     onClick={() => setTab('table')}>Table</TabBtn>
          <TabBtn active={tab === 'dashboard'} onClick={() => setTab('dashboard')}>Dashboard</TabBtn>
          <TabBtn active={tab === 'entry'}     onClick={() => setTab('entry')}>Data Entry</TabBtn>
        </div>
      </div>

      {tab === 'entry'     && <DataEntryTab month={month} year={year} />}
      {tab === 'table'     && <TableTab />}
      {tab === 'dashboard' && <DashboardTab />}
    </div>
  )
}
