import { useState, useEffect, useCallback } from 'react'
import { useMonth } from '@/contexts/MonthContext'
import { useStudio } from '@/contexts/StudioContext'
import { useRole } from '@/hooks/useRole'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts'
import { GraduationCap, Loader2, Check, Plus, X, Lightbulb } from 'lucide-react'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// ─── Team Coaching tab ────────────────────────────────────────────────────────
const BAND = {
  deep:   { label: 'Deep loss',   cls: 'bg-red-100 text-red-700 border-red-300' },
  under:  { label: 'Under',       cls: 'bg-orange-100 text-orange-700 border-orange-300' },
  slight: { label: 'Slightly under', cls: 'bg-amber-100 text-amber-700 border-amber-300' },
}
const TrendArrow = ({ dir }) => dir === 'up'
  ? <span className="text-green-600" title="Up vs prior month">▲</span>
  : dir === 'down' ? <span className="text-red-600" title="Down vs prior month">▼</span>
  : <span className="text-gray-300" title="Flat">–</span>

function GoalBar({ label, goal, actual, prefix = '', trend }) {
  const pct = goal > 0 ? Math.min(100, Math.round((actual / goal) * 100)) : null
  const hit = goal != null && actual >= goal
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-0.5">
        <span className="text-gray-500">{label} <TrendArrow dir={trend} /></span>
        <span className={`font-semibold ${hit ? 'text-green-700' : 'text-gray-800'}`}>{prefix}{actual}{goal != null ? <span className="text-gray-400 font-normal"> / {prefix}{goal}</span> : <span className="text-gray-300"> · no goal</span>}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${hit ? 'bg-green-500' : 'bg-red-400'}`} style={{ width: `${pct ?? 0}%` }} />
      </div>
    </div>
  )
}
function Stat({ label, value, trend }) {
  return (
    <div className="bg-gray-50 rounded-lg px-2.5 py-2">
      <div className="text-[15px] font-bold text-gray-900 leading-none flex items-center gap-1">{value}{trend && <TrendArrow dir={trend} />}</div>
      <div className="text-[10px] text-gray-500 mt-1 leading-tight">{label}</div>
    </div>
  )
}

function CoachingChecklist({ userId }) {
  const [data, setData] = useState({ items: [], notes: [] })
  const [text, setText] = useState(''); const [due, setDue] = useState('')
  const [note, setNote] = useState('')
  const load = useCallback(() => { apiGet(`/api/monthly-planner/coaching/items/${userId}`).then(setData).catch(() => {}) }, [userId])
  useEffect(() => { load() }, [load])
  const addItem = async () => { if (!text.trim()) return; await apiPost('/api/monthly-planner/coaching/items', { subject_user_id: userId, text, due_date: due || null }); setText(''); setDue(''); load() }
  const toggle = async (it) => { await apiPut(`/api/monthly-planner/coaching/items/${it.id}`, { done: !it.done }); load() }
  const delItem = async (it) => { await apiDelete(`/api/monthly-planner/coaching/items/${it.id}`); load() }
  const addNote = async () => { if (!note.trim()) return; await apiPost('/api/monthly-planner/coaching/notes', { subject_user_id: userId, note }); setNote(''); load() }
  const delNote = async (n) => { await apiDelete(`/api/monthly-planner/coaching/notes/${n.id}`); load() }
  const overdue = (d) => d && d < new Date().toLocaleDateString('en-CA')
  return (
    <div className="grid md:grid-cols-2 gap-4 mt-3 pt-3 border-t border-gray-100">
      <div>
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Action items</p>
        <div className="space-y-1">
          {data.items.map(it => (
            <div key={it.id} className="flex items-center gap-2 text-sm group">
              <button onClick={() => toggle(it)} className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${it.done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>{it.done && <Check size={11} />}</button>
              <span className={`flex-1 ${it.done ? 'line-through text-gray-400' : 'text-gray-700'}`}>{it.text}</span>
              {it.due_date && <span className={`text-[10px] font-semibold ${!it.done && overdue(it.due_date) ? 'text-red-600' : 'text-gray-400'}`}>{it.due_date.slice(5)}</span>}
              <button onClick={() => delItem(it)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><X size={13} /></button>
            </div>
          ))}
          {data.items.length === 0 && <p className="text-xs text-gray-400">No action items yet.</p>}
        </div>
        <div className="flex gap-1.5 mt-2">
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()} placeholder="Add an action item…" className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400" />
          <input type="date" value={due} onChange={e => setDue(e.target.value)} className="border border-gray-300 rounded-lg px-1.5 py-1 text-xs text-gray-600" />
          <button onClick={addItem} className="bg-gray-800 hover:bg-black text-white rounded-lg px-2"><Plus size={13} /></button>
        </div>
      </div>
      <div>
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">1:1 notes log</p>
        <div className="space-y-1.5 max-h-32 overflow-y-auto">
          {data.notes.map(n => (
            <div key={n.id} className="text-xs bg-gray-50 rounded-lg px-2.5 py-1.5 group">
              <div className="flex justify-between text-[10px] text-gray-400 mb-0.5"><span>{new Date(n.created_at).toLocaleDateString()}</span><button onClick={() => delNote(n)} className="opacity-0 group-hover:opacity-100 hover:text-red-500"><X size={11} /></button></div>
              <p className="text-gray-700 whitespace-pre-line">{n.note}</p>
            </div>
          ))}
          {data.notes.length === 0 && <p className="text-xs text-gray-400">No notes yet.</p>}
        </div>
        <div className="flex gap-1.5 mt-2">
          <input value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNote()} placeholder="Log a 1:1 note…" className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400" />
          <button onClick={addNote} className="bg-gray-800 hover:bg-black text-white rounded-lg px-2"><Plus size={13} /></button>
        </div>
      </div>
    </div>
  )
}

function CoachingCard({ e, isOwner }) {
  const o = e.outreach || {}
  const badge = e.status === 'negative' ? (BAND[e.severity_band] || BAND.slight)
    : e.status === 'covered' ? { label: 'Covering cost', cls: 'bg-green-100 text-green-700 border-green-300' }
    : { label: 'No pay rate set', cls: 'bg-gray-100 text-gray-500 border-gray-300' }
  const revDelta = e.revenue_prev != null ? Math.round(e.revenue - e.revenue_prev) : null
  const cost = isOwner && e.net_exact != null ? Math.round((e.revenue - e.net_exact) * 100) / 100 : null
  const money = (n) => `$${Math.abs(n).toLocaleString()}`
  return (
    <div className={`bg-white border rounded-xl shadow-sm p-4 ${e.status === 'negative' ? 'border-red-200' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-gray-900">{e.name}</h3>
            <span className="text-[10px] uppercase font-semibold text-gray-400">{e.role}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
          </div>
          <div className="mt-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-gray-500">Brought in</span>
              <span className="text-lg font-bold text-gray-900 leading-none">${e.revenue.toLocaleString()}</span>
            </div>
            {revDelta != null && (
              <div className="text-[11px] font-semibold flex items-center gap-1 mt-0.5">
                <TrendArrow dir={e.trend?.revenue} />
                <span className={revDelta > 0 ? 'text-green-600' : revDelta < 0 ? 'text-red-600' : 'text-gray-400'}>
                  {revDelta > 0 ? '+' : revDelta < 0 ? '−' : ''}{money(revDelta)}
                </span>
                <span className="text-gray-400 font-normal">vs prior month</span>
              </div>
            )}
            {isOwner && cost != null && (
              <div className="text-[11px] text-gray-600 mt-1">
                {money(e.revenue)} revenue − {money(cost)} cost ={' '}
                {e.net_exact < 0
                  ? <span className="text-red-600 font-bold">{money(e.net_exact)} under</span>
                  : <span className="text-green-700 font-bold">{money(e.net_exact)} profit</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 mt-3">
        <div className="col-span-2 md:col-span-3 grid grid-cols-3 gap-2.5">
          <GoalBar label="New members" goal={e.goal?.members?.goal} actual={e.goal?.members?.actual} trend={e.trend?.members} />
          <GoalBar label="Retail" prefix="$" goal={e.goal?.retail?.goal} actual={e.goal?.retail?.actual} trend={e.trend?.retail} />
          <GoalBar label="EFT" prefix="$" goal={e.goal?.eft?.goal} actual={e.goal?.eft?.actual} trend={e.trend?.eft} />
        </div>
        <Stat label="Hours" value={e.hours} />
        <Stat label="Avg cleaning tasks / shift" value={e.cleaning_per_shift != null ? e.cleaning_per_shift : '—'} trend={e.trend?.cleaning} />
        <Stat label="Marketing tasks" value={e.marketing_count} trend={e.trend?.marketing} />
        <Stat label="B2B outreach" value={e.b2b_count} trend={e.trend?.b2b} />
        <Stat label="Birthday outreach" value={e.birthday_outreach} trend={e.trend?.birthday} />
        <Stat label="Thank-you cards" value={e.thank_you_cards} trend={e.trend?.thank_you} />
      </div>

      <div className="mt-3 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 space-y-1">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <span className="font-bold text-gray-700">Member outreach</span>
          <span className="font-semibold">{o.member_touches} touches <TrendArrow dir={e.trend?.member_touches} /></span>
          <span className="text-gray-400">·</span>
          <span>{o.missed_guest} missed-guest</span>
          <span>{o.new_member} new-member</span>
          <span>{o.milestones} milestone</span>
          <span>{o.reengage} re-engage</span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-gray-100">
          <span>{o.calls} calls <TrendArrow dir={e.trend?.calls} /> · {o.texts} texts <TrendArrow dir={e.trend?.texts} /></span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-500">SAIL: {o.sail_calls} calls · {o.sail_texts} texts</span>
        </div>
        <p className="text-[10px] text-gray-400">Member outreach &amp; calls/texts are from their EOD checkouts.</p>
      </div>

      <CoachingChecklist userId={e.user_id} />
    </div>
  )
}
function TrendArrowInline(dir) { return dir === 'up' ? '▲' : dir === 'down' ? '▼' : '' }

// One metric's month-over-month trend line.
function TrendMini({ data, dataKey, label, money }) {
  const fmt = (v) => v == null ? '—' : (money ? `$${Math.round(v).toLocaleString()}` : (Math.round(v * 10) / 10))
  const last = data.length ? data[data.length - 1][dataKey] : null
  const prev = data.length > 1 ? data[data.length - 2][dataKey] : null
  const delta = (last != null && prev != null) ? last - prev : null
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold text-gray-500 leading-tight">{label}</span>
        <span className="text-sm font-bold text-gray-900">{fmt(last)}</span>
      </div>
      {delta != null && delta !== 0 && (
        <div className={`text-[10px] font-semibold ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
          {delta > 0 ? '▲ +' : '▼ '}{money ? `$${Math.abs(Math.round(delta)).toLocaleString()}` : Math.abs(Math.round(delta * 10) / 10)} <span className="text-gray-400 font-normal">vs prior</span>
        </div>
      )}
      <div className="h-14 mt-1 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 6 }}>
            <Tooltip formatter={(v) => [fmt(v), label]} contentStyle={{ fontSize: 11, borderRadius: 8, padding: '3px 8px' }} />
            <XAxis dataKey="label" hide />
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <Line type="monotone" dataKey={dataKey} stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function MemberTrends({ userId, month, year, isOwner }) {
  const { currentStudio } = useStudio()
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    setLoading(true); setError('')
    apiGet(`/api/monthly-planner/coaching/history/${userId}/${year}/${month}`)
      .then(setD).catch(e => setError(e?.message || 'Failed to load')).finally(() => setLoading(false))
  }, [userId, year, month, currentStudio?.id])
  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-red-600" size={22} /></div>
  if (error) return <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
  const pts = d?.months || []
  if (!pts.length) return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-bold text-gray-900">{d.user?.name}</h3>
        <span className="text-[10px] uppercase font-semibold text-gray-400">{d.user?.role}</span>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <p className="text-sm font-semibold text-gray-700">Not enough history yet.</p>
        <p className="text-xs text-gray-400 mt-1">Trends appear once they have an active month of data — new team members are still ramping up.</p>
      </div>
      <CoachingChecklist userId={userId} />
    </div>
  )
  const charts = [
    { k: 'revenue', label: 'Revenue brought in', money: true },
    ...(isOwner ? [{ k: 'net', label: 'Net (revenue − cost)', money: true }] : []),
    { k: 'members', label: 'New members' }, { k: 'retail', label: 'Retail', money: true }, { k: 'eft', label: 'EFT', money: true },
    { k: 'hours', label: 'Hours' }, { k: 'cleaning_per_shift', label: 'Cleaning tasks / shift' },
    { k: 'marketing', label: 'Marketing tasks' }, { k: 'b2b', label: 'B2B outreach' },
    { k: 'member_touches', label: 'Member outreach' }, { k: 'calls', label: 'Calls' }, { k: 'texts', label: 'Texts' },
    { k: 'birthday', label: 'Birthday outreach' }, { k: 'thank_you', label: 'Thank-you cards' },
  ]
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-bold text-gray-900">{d.user?.name}</h3>
        <span className="text-[10px] uppercase font-semibold text-gray-400">{d.user?.role}</span>
        <span className="text-xs text-gray-400">· last {pts.length} months</span>
      </div>
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
        <div className="flex items-center gap-1.5 mb-2 text-indigo-800 font-bold text-sm"><Lightbulb size={15} /> Coaching insights</div>
        {d.insights?.length ? (
          <ul className="space-y-1 text-sm text-indigo-900">{d.insights.map((s, i) => <li key={i}>• {s}</li>)}</ul>
        ) : <p className="text-sm text-indigo-900/70">No standout signals over this period — steady.</p>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {charts.map(c => <TrendMini key={c.k} data={pts} dataKey={c.k} label={c.label} money={c.money} />)}
      </div>
      <CoachingChecklist userId={userId} />
    </div>
  )
}

function TeamCoachingTab({ month, year, isOwner }) {
  const { currentStudio } = useStudio()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sub, setSub] = useState('overview')  // 'overview' | userId
  useEffect(() => {
    setLoading(true); setError('')
    apiGet(`/api/monthly-planner/coaching/${year}/${month}`)
      .then(setData).catch(e => setError(e?.message || 'Failed to load')).finally(() => setLoading(false))
  }, [year, month, currentStudio?.id])

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-red-600" size={24} /></div>
  if (error) return <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
  const rv = data?.reviewing
  const emps = data?.employees || []
  const active = sub !== 'overview' && emps.some(e => e.user_id === sub) ? sub : 'overview'
  return (
    <div className="space-y-4">
      {/* Sub-tabs: Overview + one per team member (their trends) */}
      {emps.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setSub('overview')}
            className={`text-[13px] font-semibold rounded-lg px-3 py-1.5 border ${active === 'overview' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>Overview</button>
          {emps.map(e => (
            <button key={e.user_id} onClick={() => setSub(e.user_id)}
              className={`text-[13px] font-semibold rounded-lg px-3 py-1.5 border ${active === e.user_id ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {e.name}{e.status === 'negative' ? ' 🔴' : ''}
            </button>
          ))}
        </div>
      )}

      {active === 'overview' ? (<>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-[12.5px] text-amber-800 flex items-start gap-2">
          <GraduationCap size={15} className="flex-shrink-0 mt-0.5 text-amber-600" />
          <span>Everyone's results for <b>{rv ? `${MONTHS[rv.month - 1]} ${rv.year}` : 'last month'}</b> — sorted with anyone under cost first. Tap a name above for their month-over-month trends. {!isOwner && 'Exact dollars are visible to the owner; you see a cost-coverage band.'}</span>
        </div>
        {emps.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <p className="text-sm font-semibold text-gray-700">No team members to review yet.</p>
            <p className="text-xs text-gray-400 mt-1">Add pay rates on Team ROI to see cost coverage.</p>
          </div>
        ) : emps.map(e => <CoachingCard key={e.user_id} e={e} isOwner={isOwner} />)}
      </>) : (
        <MemberTrends userId={active} month={month} year={year} isOwner={isOwner} />
      )}
    </div>
  )
}

// Default export: reads the global month/year + role, renders the coaching section.
export default function TeamCoachingSection() {
  const { selectedMonth: { month, year } } = useMonth()
  const { isOwner } = useRole()
  return <TeamCoachingTab month={month} year={year} isOwner={isOwner} />
}
