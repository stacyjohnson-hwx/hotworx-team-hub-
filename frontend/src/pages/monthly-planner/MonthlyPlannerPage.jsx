import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useMonth } from '@/contexts/MonthContext'
import { useStudio } from '@/contexts/StudioContext'
import { apiGet, apiPut, apiPost, apiDelete } from '@/hooks/useApi'
import SocialPostCalendar from '@/components/SocialPostCalendar'
import {
  CalendarRange, Target, Building2, Trophy, Megaphone,
  PartyPopper, GraduationCap, Sparkles, Check, Plus, ExternalLink, Loader2,
  CalendarDays, AlertCircle, CheckCircle2, Edit2, X, Clock, Tag, Search, Trash2,
} from 'lucide-react'

// ─── date / label helpers ─────────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
const pad = n => String(n).padStart(2, '0')
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
const daysInMonth = (y, m) => new Date(y, m, 0).getDate()
const monthStartDate = (y, m) => ymd(y, m, 1)
const monthEndDate   = (y, m) => ymd(y, m, daysInMonth(y, m))

const fmtDay = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
const fmtTime = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${pad(m || 0)} ${h < 12 ? 'AM' : 'PM'}`
}
const fmtVal = (v, prefix = '') => (v == null || v === '' ? '—' : `${prefix}${Number(v).toLocaleString('en-US')}`)

// nth (1-based) weekday of a month; weekday 0=Sun … 6=Sat
function nthWeekday(year, month, weekday, n) {
  const first = new Date(year, month - 1, 1).getDay()
  const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7
  return day <= daysInMonth(year, month) ? day : null
}
function lastWeekday(year, month, weekday) {
  const dim = daysInMonth(year, month)
  const last = new Date(year, month - 1, dim).getDay()
  return dim - ((last - weekday + 7) % 7)
}

// Major US holidays for a given month, with real dates.
function majorHolidays(year, month) {
  const H = []
  const add = (day, label) => { if (day) H.push({ date: ymd(year, month, day), label }) }
  switch (month) {
    case 1:  add(1, "New Year's Day"); add(nthWeekday(year,1,1,3), 'Martin Luther King Jr. Day'); break
    case 2:  add(14, "Valentine's Day"); add(nthWeekday(year,2,1,3), "Presidents' Day"); break
    case 3:  add(17, "St. Patrick's Day"); break
    case 4:  add(22, 'Earth Day'); break
    case 5:  add(nthWeekday(year,5,0,2), "Mother's Day"); add(lastWeekday(year,5,1), 'Memorial Day'); break
    case 6:  add(nthWeekday(year,6,0,3), "Father's Day"); add(19, 'Juneteenth'); break
    case 7:  add(4, 'Independence Day'); break
    case 9:  add(nthWeekday(year,9,1,1), 'Labor Day'); break
    case 10: add(nthWeekday(year,10,1,2), 'Indigenous Peoples’ / Columbus Day'); add(31, 'Halloween'); break
    case 11: add(11, 'Veterans Day'); add(nthWeekday(year,11,4,4), 'Thanksgiving'); break
    case 12: add(24, 'Christmas Eve'); add(25, 'Christmas Day'); add(31, "New Year's Eve"); break
    default: break
  }
  return H.sort((a, b) => a.date.localeCompare(b.date))
}

// Seasonal themes worth planning around (studio/fitness calendar).
const SEASONAL = {
  1: 'New Year resolution surge — push new memberships',
  2: 'Heart Health Month — couples & referral offers',
  3: 'Spring break — schedule coverage, spring reset',
  4: 'Spring into fitness — outdoor & community events',
  5: 'Summer body kickoff',
  6: 'Summer challenge launch',
  7: 'Mid-summer contest & community events',
  8: 'Back-to-school — students & teachers push',
  9: 'Fall reset — re-engage lapsed members',
  10: 'Breast Cancer Awareness (pink promo)',
  11: 'Black Friday / holiday retail push, refer-a-friend',
  12: 'New Year pre-sell + year-end retail clearance',
}

// Does an event/promo really belong to [start, end]?
// The API already overlap-filters, but two quirks in the data need tightening:
//  • many records use an EXCLUSIVE end (a June promo ends "Jul 1"), so a record
//    that only touches the first day of the range isn't really in this month;
//  • a few records have typo'd years (e.g. 0206-06-01) that span centuries.
const MIN_SANE_DATE = '2000-01-01'
function overlapsRange(item, start, end) {
  if (!item.start_date) return !!item.ongoing          // ongoing, undated
  if (item.start_date < MIN_SANE_DATE) return false    // guard typo'd dates
  const itemEnd = item.end_date || item.start_date
  if (itemEnd < start || item.start_date > end) return false
  if (itemEnd === start && item.start_date < start) return false  // exclusive-end bleed
  return true
}

// Weeks of the month as day ranges (Week 1 = 1–7, …).
function weeksOfMonth(year, month) {
  const dim = daysInMonth(year, month)
  const out = []
  for (let n = 1; (n - 1) * 7 + 1 <= dim; n++) {
    const s = (n - 1) * 7 + 1
    const e = Math.min(dim, n * 7)
    out.push({ n, label: `Week ${n}`, range: `${MON_SHORT[month-1]} ${s}–${e}` })
  }
  return out
}

const EVENT_TYPES = [
  'in-store','community','corporate','partnership','online',
  'business_of_the_month','influencer_visit','pop_up','team','other',
]
const TYPE_COLOR = {
  'in-store':'bg-blue-100 text-blue-700', community:'bg-green-100 text-green-700',
  corporate:'bg-indigo-100 text-indigo-700', partnership:'bg-purple-100 text-purple-700',
  online:'bg-cyan-100 text-cyan-700', business_of_the_month:'bg-amber-100 text-amber-700',
  influencer_visit:'bg-pink-100 text-pink-700', pop_up:'bg-orange-100 text-orange-700',
  team:'bg-slate-200 text-slate-700', other:'bg-gray-100 text-gray-600',
}

function Card({ icon: Icon, title, subtitle, children, accent = 'text-red-600', right }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2.5">
          {Icon && <Icon size={18} className={`${accent} mt-0.5 flex-shrink-0`} />}
          <div>
            <h2 className="text-sm font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

function TargetField({ label, prefix, value, lastYear, onChange }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
      <div className="flex items-center gap-1 mt-1">
        {prefix && <span className="text-gray-400 text-sm">{prefix}</span>}
        <input type="number" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-red-500" />
      </div>
      <p className="text-[11px] text-gray-400 mt-1">Last yr actual: <span className="font-semibold text-gray-500">{fmtVal(lastYear, prefix)}</span></p>
    </div>
  )
}

// ─── Event add/edit modal ─────────────────────────────────────────────────────
function EventModal({ event, presetTitle, presetType, month, year, onClose, onSaved }) {
  const isNew = !event
  const [f, setF] = useState({
    title: event?.title || presetTitle || '', event_type: event?.event_type || presetType || 'in-store',
    start_date: event?.start_date || monthStartDate(year, month),
    start_time: event?.start_time || '', end_time: event?.end_time || '',
    location: event?.location || '', notes: event?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500'

  const save = async () => {
    if (!f.title.trim()) { setErr('Title is required'); return }
    if (!f.start_date) { setErr('Date is required'); return }
    setSaving(true); setErr('')
    try {
      const [y, m] = f.start_date.split('-').map(Number)
      const body = { ...f, title: f.title.trim(), month: m, year: y,
        start_time: f.start_time || null, end_time: f.end_time || null }
      const saved = isNew ? await apiPost('/api/events', body) : await apiPut(`/api/events/${event.id}`, body)
      onSaved(saved); onClose()
    } catch (e) { setErr(e?.message || 'Could not save'); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-bold text-gray-900">{isNew ? 'Add event' : 'Edit event'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}
          <input className={inp} placeholder="Event title" value={f.title} onChange={e => set('title', e.target.value)} />
          <select className={inp} value={f.event_type} onChange={e => set('event_type', e.target.value)}>
            {EVENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
          <input type="date" className={inp} value={f.start_date} onChange={e => set('start_date', e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-[11px] text-gray-500">Start time</span><input type="time" className={inp} value={f.start_time || ''} onChange={e => set('start_time', e.target.value)} /></div>
            <div><span className="text-[11px] text-gray-500">End time</span><input type="time" className={inp} value={f.end_time || ''} onChange={e => set('end_time', e.target.value)} /></div>
          </div>
          <input className={inp} placeholder="Location (optional)" value={f.location || ''} onChange={e => set('location', e.target.value)} />
          <textarea className={inp} rows={2} placeholder="Notes (optional)" value={f.notes || ''} onChange={e => set('notes', e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 font-medium">Cancel</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 size={13} className="animate-spin" />}{isNew ? 'Add event' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EventRow({ e, onEdit }) {
  const logos = (e.b2b_partners || []).filter(p => p.logo_url)
  return (
    <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2.5 hover:border-gray-300 transition-colors">
      <div className="flex flex-col items-center justify-center bg-red-50 text-red-700 rounded-lg w-12 py-1 flex-shrink-0">
        <span className="text-[10px] font-semibold uppercase leading-none">{MON_SHORT[Number(e.start_date?.slice(5,7)) - 1]}</span>
        <span className="text-base font-bold leading-tight">{Number(e.start_date?.slice(8,10))}</span>
      </div>
      {logos.length > 0 && (
        <img src={logos[0].logo_url} alt="" className="w-8 h-8 rounded object-contain bg-white border border-gray-100 flex-shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 truncate">{e.title}</p>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TYPE_COLOR[e.event_type] || TYPE_COLOR.other}`}>{(e.event_type || '').replace(/_/g,' ')}</span>
          <span className="text-[11px] text-gray-500">{fmtDay(e.start_date)}</span>
          {e.start_time && <span className="text-[11px] text-gray-500 flex items-center gap-0.5"><Clock size={10} />{fmtTime(e.start_time)}{e.end_time ? `–${fmtTime(e.end_time)}` : ''}</span>}
          {logos.length === 0 && (e.b2b_partners || []).length > 0 && <span className="text-[11px] text-gray-400">{e.b2b_partners[0].business_name}</span>}
        </div>
      </div>
      {onEdit && <button onClick={() => onEdit(e)} className="p-1.5 text-gray-400 hover:text-red-600 flex-shrink-0" title="Edit"><Edit2 size={14} /></button>}
    </div>
  )
}

export default function MonthlyPlannerPage() {
  const { selectedMonth: { month, year } } = useMonth()
  const { currentStudio } = useStudio()
  const studioId = currentStudio?.id

  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [plan, setPlan]       = useState(null)
  const [content, setContent] = useState({})
  const [reference, setReference] = useState(null)
  const [goals, setGoals]     = useState(null)
  const [lastYear, setLastYear] = useState(null)
  const [b2b, setB2b]         = useState([])
  const [territories, setTerritories] = useState([])
  const [events, setEvents]   = useState([])
  const [lastYearEvents, setLastYearEvents] = useState([])
  const [promos, setPromos]   = useState([])
  const [lastYearPromos, setLastYearPromos] = useState([])
  const [contests, setContests] = useState([])
  const [savingContent, setSavingContent] = useState(false)
  const [savingGoals, setSavingGoals] = useState(false)
  const [eventModal, setEventModal] = useState(null)   // null | {} (new) | event

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      // Events/promos are filed by DATE, not by their month/year columns (those
      // record when the record was entered and are frequently off), so query by
      // the month's date range and let the API overlap-filter.
      const mStart = monthStartDate(year, month), mEnd = monthEndDate(year, month)
      const lyStart = monthStartDate(year - 1, month), lyEnd = monthEndDate(year - 1, month)
      const [pl, cur, contacts, terr, evs, lyEvs, prm, lyPrm, cts] = await Promise.all([
        apiGet(`/api/monthly-planner/${year}/${month}`),
        apiGet(`/api/goals/studio?month=${month}&year=${year}`),
        apiGet('/api/b2b/contacts').catch(() => []),
        apiGet('/api/territories').catch(() => []),
        apiGet(`/api/events?startDate=${mStart}&endDate=${mEnd}`).catch(() => []),
        apiGet(`/api/events?startDate=${lyStart}&endDate=${lyEnd}`).catch(() => []),
        apiGet(`/api/events/promotions?startDate=${mStart}&endDate=${mEnd}`).catch(() => []),
        apiGet(`/api/events/promotions?startDate=${lyStart}&endDate=${lyEnd}`).catch(() => []),
        apiGet('/api/contests').catch(() => []),
      ])
      setPlan(pl.plan); setContent(pl.plan?.content || {}); setReference(pl.reference)
      setGoals(cur)
      // Last year: prefer the goal that was set, else what actually happened.
      setLastYear(pl.reference?.lastYearGoals || pl.reference?.lastYearActuals || null)
      setB2b(contacts || []); setTerritories(terr || [])
      const byStart = (a, b) => (a.start_date || '').localeCompare(b.start_date || '')
      setEvents((evs || []).filter(e => overlapsRange(e, mStart, mEnd)).sort(byStart))
      setLastYearEvents((lyEvs || []).filter(e => overlapsRange(e, lyStart, lyEnd)).sort(byStart))
      // This month: hide archived promos. Last year: keep archived (that's the
      // history) but drop always-on "ongoing" ones — they're not a useful compare.
      setPromos((prm || []).filter(p => p.active !== false && overlapsRange(p, mStart, mEnd)).sort(byStart))
      setLastYearPromos((lyPrm || []).filter(p => !p.ongoing && overlapsRange(p, lyStart, lyEnd)).sort(byStart))
      setContests(cts || [])
    } catch (e) {
      setError(e?.message || 'Could not load the planner.')
    } finally { setLoading(false) }
  }, [studioId, year, month])
  useEffect(() => { load() }, [load])

  const patchContent = useCallback((partial) => {
    setContent(prev => {
      const next = { ...prev, ...partial }
      setSavingContent(true)
      apiPut(`/api/monthly-planner/${year}/${month}`, { content: next })
        .catch(e => setError(e?.message || 'Could not save.'))
        .finally(() => setSavingContent(false))
      return next
    })
  }, [year, month])

  const toggleId = (key, id) => {
    const list = content[key] || []
    patchContent({ [key]: list.includes(id) ? list.filter(x => x !== id) : [...list, id] })
  }

  const saveGoals = async () => {
    setSavingGoals(true)
    const targets = {
      eft_target: goals.eft_target, memberships_target: goals.memberships_target,
      retail_target: goals.retail_target, in_the_bank_target: goals.in_the_bank_target,
      total_leads_target: goals.total_leads_target, conversion_rate_target: goals.conversion_rate_target,
      checkin_show_rate_target: goals.checkin_show_rate_target, close_rate_target: goals.close_rate_target,
    }
    try {
      const saved = await apiPut('/api/goals/studio', { month, year, ...targets })
      setGoals(g => ({ ...g, ...saved }))
    } catch (e) { setError(e?.message || 'Could not save goals.') }
    finally { setSavingGoals(false) }
  }

  const finalized = !!plan?.reviewed_at
  const toggleFinalized = async () => {
    try {
      const saved = await apiPost(`/api/monthly-planner/${year}/${month}/review`, { reviewed: !finalized })
      setPlan(p => ({ ...p, reviewed_at: saved.reviewed_at, reviewed_by: saved.reviewed_by }))
    } catch (e) { setError(e?.message || 'Could not update sign-off.') }
  }

  const corporate = useMemo(() => b2b.filter(c => c.partner_type === 'corporate'), [b2b])
  // Team meeting / outing events already on the calendar this month.
  const teamMeetings = useMemo(() => events.filter(e => /team\s*meeting/i.test(e.title || '')), [events])
  const teamOutings  = useMemo(() => events.filter(e => /outing/i.test(e.title || '')), [events])
  const monthContests = useMemo(() => contests.filter(c =>
    (c.period_month === month && c.period_year === year) ||
    (c.starts_on && c.starts_on <= monthEndDate(year, month) && (c.ends_on || c.starts_on) >= monthStartDate(year, month))
  ), [contests, month, year])

  const onEventSaved = () => load()

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 size={26} className="animate-spin text-red-600" /></div>

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-10">
      {eventModal && (
        <EventModal
          event={eventModal.id ? eventModal : null}
          presetTitle={eventModal.presetTitle}
          presetType={eventModal.presetTitle ? 'team' : undefined}
          month={month} year={year}
          onClose={() => setEventModal(null)} onSaved={onEventSaved} />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <CalendarRange size={24} className="text-red-600" /> Monthly Plan — {MONTHS[month - 1]} {year}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Plan the month ahead — aim to finish by the 15th of the prior month.</p>
        </div>
        <button onClick={toggleFinalized}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border transition-colors ${
            finalized ? 'bg-green-50 text-green-700 border-green-300' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
          {finalized ? <CheckCircle2 size={16} /> : <Check size={16} />}{finalized ? 'Plan finalized' : 'Mark plan finalized'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2"><AlertCircle size={15} /> {error}</div>}
      {savingContent && <p className="text-xs text-gray-400 -mt-2">Saving…</p>}

      {/* 1. GOALS */}
      <Card icon={Target} title="Goals for the month"
        subtitle={`Set this month's targets — compared to ${MONTHS[month-1]} ${year - 1} actuals.`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <TargetField label="EFT increase" prefix="$" value={goals?.eft_target} lastYear={lastYear?.eft_target} onChange={v => setGoals(g => ({ ...g, eft_target: v }))} />
          <TargetField label="New members" value={goals?.memberships_target} lastYear={lastYear?.memberships_target} onChange={v => setGoals(g => ({ ...g, memberships_target: v }))} />
          <TargetField label="Retail" prefix="$" value={goals?.retail_target} lastYear={lastYear?.retail_target} onChange={v => setGoals(g => ({ ...g, retail_target: v }))} />
          <TargetField label="In the Bank" prefix="$" value={goals?.in_the_bank_target} lastYear={lastYear?.in_the_bank_target} onChange={v => setGoals(g => ({ ...g, in_the_bank_target: v }))} />
          <TargetField label="Leads (outreach)" value={goals?.total_leads_target} lastYear={lastYear?.total_leads_target} onChange={v => setGoals(g => ({ ...g, total_leads_target: v }))} />
          <TargetField label="Conversion %" value={goals?.conversion_rate_target} lastYear={lastYear?.conversion_rate_target} onChange={v => setGoals(g => ({ ...g, conversion_rate_target: v }))} />
          <TargetField label="Show rate %" value={goals?.checkin_show_rate_target} lastYear={lastYear?.checkin_show_rate_target} onChange={v => setGoals(g => ({ ...g, checkin_show_rate_target: v }))} />
          <TargetField label="Close rate %" value={goals?.close_rate_target} lastYear={lastYear?.close_rate_target} onChange={v => setGoals(g => ({ ...g, close_rate_target: v }))} />
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button onClick={() => saveGoals()} disabled={savingGoals}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
            {savingGoals ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save goals
          </button>
          <Link to="/goals" className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1">Set individual goals <ExternalLink size={13} /></Link>
        </div>
      </Card>

      {/* 2. EVENTS */}
      <Card icon={CalendarDays} title="Events" subtitle="What's planned this month, and what you ran last year."
        right={<button onClick={() => setEventModal({})} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg"><Plus size={13} /> Add event</button>}>
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Planned — {MONTHS[month-1]} {year}</p>
            {events.length === 0 ? <p className="text-sm text-gray-400">Nothing planned yet.</p> : (
              <div className="space-y-1.5">{events.map(e => <EventRow key={e.id} e={e} onEdit={setEventModal} />)}</div>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Last year — {MONTHS[month-1]} {year - 1}</p>
            {lastYearEvents.length === 0 ? <p className="text-sm text-gray-400">Nothing logged last year.</p> : (
              <div className="space-y-1.5 opacity-80">{lastYearEvents.map(e => <EventRow key={e.id} e={e} />)}</div>
            )}
          </div>
        </div>
      </Card>

      {/* 3. PROMOTIONS */}
      <Card icon={Tag} title="Promotions" subtitle="Offers running this month vs. last year." accent="text-purple-600"
        right={<Link to="/events" className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1">Manage <ExternalLink size={13} /></Link>}>
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">This month</p>
            {promos.length === 0 ? <p className="text-sm text-gray-400">No promotions yet.</p> : (
              <div className="space-y-1.5">{promos.map(p => (
                <div key={p.id} className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                  <p className="text-sm font-semibold text-gray-900">{p.title}{p.ongoing && <span className="ml-1.5 text-[10px] bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded">ongoing</span>}</p>
                  <p className="text-[11px] text-gray-500">{(p.promo_type || '').replace(/_/g,' ')}{p.start_date ? ` · ${fmtDay(p.start_date)}${p.end_date ? ` – ${fmtDay(p.end_date)}` : ''}` : ''}</p>
                </div>
              ))}</div>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Last year</p>
            {lastYearPromos.length === 0 ? <p className="text-sm text-gray-400">Nothing logged last year.</p> : (
              <div className="space-y-1.5 opacity-80">{lastYearPromos.map(p => (
                <div key={p.id} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <p className="text-sm font-semibold text-gray-800">{p.title}</p>
                  <p className="text-[11px] text-gray-500">{(p.promo_type || '').replace(/_/g,' ')}{p.start_date ? ` · ${fmtDay(p.start_date)}` : ''}</p>
                </div>
              ))}</div>
            )}
          </div>
        </div>
      </Card>

      {/* 4. OUTREACH BY WEEK — businesses + canvassing zones, weeks aligned */}
      <WeeklyOutreach year={year} month={month} businesses={b2b} territories={territories}
        content={content} patchContent={patchContent} />

      {/* 5. CORPORATE ACCOUNTS */}
      <PickerCard icon={Building2} title="Corporate accounts to target" subtitle="Check the corporate partners to pursue this month." accent="text-indigo-600"
        items={corporate} selected={content.corporate_targets || []} onToggle={id => toggleId('corporate_targets', id)}
        render={c => ({ title: c.business_name, logo: c.logo_url, meta: [c.industry, c.status].filter(Boolean).join(' · ') })}
        link="/b2b" emptyText="No corporate accounts yet — mark contacts as corporate in B2B." />

      {/* 7-9. TEAM MEETING / FUN EVENT / CONTEST */}
      <div className="grid md:grid-cols-3 gap-4">
        <TeamEventCard icon={GraduationCap} accent="text-blue-600" btn="bg-blue-600 hover:bg-blue-700"
          title="Team training meeting" matched={teamMeetings} defaultTitle="Team Meeting"
          hint='Shows any event with "Team Meeting" in the title.'
          contentKey="training_meeting" fieldLabel="Topic / agenda" fieldKey="topic"
          content={content} patchContent={patchContent} onAdd={setEventModal} year={year} month={month} />
        <TeamEventCard icon={PartyPopper} accent="text-fuchsia-600" btn="bg-fuchsia-600 hover:bg-fuchsia-700"
          title="Team fun event" matched={teamOutings} defaultTitle="Team Outing"
          hint='Shows any event with "Outing" in the title.'
          contentKey="fun_event" fieldLabel="Idea" fieldKey="idea"
          content={content} patchContent={patchContent} onAdd={setEventModal} year={year} month={month} />
        <ContestCard contests={monthContests} month={month} year={year} onCreated={load} />
      </div>

      {/* 10. SOCIAL MUST-POSTS */}
      <Card icon={Megaphone} title="Social media must-posts" accent="text-sky-600"
        subtitle="Add what to post, drag it onto a day, then click it to add the caption, link and photos.">
        <SocialPostCalendar
          posts={content.social_posts || []}
          onChange={next => patchContent({ social_posts: next })}
          year={year} month={month} studioId={studioId}
          suggestions={[
            ...events.map(e => `Post about ${e.title}`),
            ...promos.map(p => `Promote ${p.title}`),
          ]} />
      </Card>

      {/* 11. HOLIDAYS & SEASONAL */}
      <HolidaysCard year={year} month={month} custom={reference?.customHolidays || []} content={content} patchContent={patchContent} onChanged={load} />

      {/* 12. WHAT ELSE */}
      <Card icon={Sparkles} title="What else should we plan for?" subtitle="Anything else on the radar for this month." accent="text-violet-600">
        <textarea value={content.notes || ''} onChange={e => setContent(c => ({ ...c, notes: e.target.value }))} onBlur={e => patchContent({ notes: e.target.value })}
          placeholder="Staffing, maintenance, orders, training, community partnerships…" rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500" />
      </Card>
    </div>
  )
}

// Small logo (falls back to initials) used in chips and pick lists.
function Logo({ url, name, size = 20 }) {
  const s = { width: size, height: size }
  if (url) return <img src={url} alt="" style={s} className="rounded object-contain bg-white border border-gray-200 flex-shrink-0" />
  return (
    <span style={s} className="rounded bg-gray-100 text-gray-500 text-[9px] font-bold flex items-center justify-center flex-shrink-0">
      {(name || '?').slice(0, 2).toUpperCase()}
    </span>
  )
}

// ─── Outreach by week — businesses and canvassing zones side by side ─────────
// Weeks line up across both columns; the plan box only appears when asked for
// (or when a plan already exists), so weeks stay compact.
function WeeklyOutreach({ year, month, businesses, territories, content, patchContent }) {
  const weeks = weeksOfMonth(year, month)
  const [openPicker, setOpenPicker] = useState(null)   // `${key}:${week}`
  const [openPlans, setOpenPlans] = useState({})       // `${key}:${week}` -> true
  const [q, setQ] = useState('')

  const COLS = [
    {
      key: 'b2b_weeks', label: 'Businesses', items: businesses, pick: 'Pick businesses',
      getName: b => b.business_name, getLogo: b => b.logo_url, getMeta: b => b.industry,
      planPlaceholder: 'Plan for the week — who goes, what to bring, the ask…',
    },
    {
      key: 'territory_weeks', label: 'Apartments & neighborhoods', items: territories, pick: 'Pick zones',
      getName: z => z.name, getLogo: z => z.b2b_contact?.logo_url,
      getMeta: z => (z.status === 'overdue' ? `${z.days_overdue}d overdue` : z.type),
      planPlaceholder: 'Canvassing plan — doors, drop-offs, timing…',
    },
  ]

  const setWeek = (key, n, partial) => {
    const data = content[key] || {}
    const cur = data[n] || { ids: [], plan: '' }
    patchContent({ [key]: { ...data, [n]: { ...cur, ...partial } } })
  }
  const toggle = (key, n, id) => {
    const ids = (content[key]?.[n]?.ids) || []
    setWeek(key, n, { ids: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] })
  }

  const Cell = ({ col, w }) => {
    const wk = (content[col.key] || {})[w.n] || { ids: [], plan: '' }
    const cellId = `${col.key}:${w.n}`
    const picking = openPicker === cellId
    const showPlan = openPlans[cellId] || !!wk.plan
    const byId = Object.fromEntries(col.items.map(i => [i.id, i]))
    const s = q.trim().toLowerCase()
    const filtered = s ? col.items.filter(i => (col.getName(i) || '').toLowerCase().includes(s)) : col.items

    return (
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="md:hidden text-[11px] font-bold uppercase text-gray-500">{col.label}</span>
          <div className="flex items-center gap-2 ml-auto">
            {!showPlan && (
              <button onClick={() => setOpenPlans(p => ({ ...p, [cellId]: true }))}
                className="text-[11px] text-gray-400 hover:text-gray-600">+ plan</button>
            )}
            <button onClick={() => { setOpenPicker(picking ? null : cellId); setQ('') }}
              className="text-xs font-semibold text-red-600 hover:text-red-700">
              {picking ? 'Done' : `${col.pick} (${wk.ids.length})`}
            </button>
          </div>
        </div>

        {wk.ids.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {wk.ids.map(id => {
              const it = byId[id]
              return (
                <span key={id} className="inline-flex items-center gap-1.5 text-xs bg-red-50 text-red-800 border border-red-200 rounded-full pl-1 pr-2 py-0.5">
                  <Logo url={it && col.getLogo(it)} name={it ? col.getName(it) : '?'} size={16} />
                  <span className="truncate max-w-[140px]">{it ? col.getName(it) : 'Removed'}</span>
                  <button onClick={() => toggle(col.key, w.n, id)} className="hover:text-red-900">✕</button>
                </span>
              )
            })}
          </div>
        )}

        {picking && (
          <div className="mt-2">
            <div className="relative mb-1.5">
              <Search size={13} className="absolute left-2.5 top-2 text-gray-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" autoFocus
                className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-1 text-sm focus:outline-none focus:border-red-500" />
            </div>
            <div className="max-h-44 overflow-y-auto space-y-0.5 border border-gray-100 rounded-lg p-1.5">
              {filtered.slice(0, 60).map(it => {
                const on = wk.ids.includes(it.id)
                return (
                  <button key={it.id} onClick={() => toggle(col.key, w.n, it.id)}
                    className={`w-full flex items-center gap-2 text-left rounded px-2 py-1 text-sm ${on ? 'bg-red-50 text-red-800' : 'hover:bg-gray-50 text-gray-700'}`}>
                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${on ? 'bg-red-600 border-red-600' : 'border-gray-300'}`}>
                      {on && <Check size={10} className="text-white" />}
                    </span>
                    <Logo url={col.getLogo(it)} name={col.getName(it)} size={18} />
                    <span className="truncate flex-1">{col.getName(it)}</span>
                    {col.getMeta && col.getMeta(it) && <span className="text-[11px] text-gray-400 flex-shrink-0">{col.getMeta(it)}</span>}
                  </button>
                )
              })}
              {filtered.length === 0 && <p className="text-xs text-gray-400 px-2 py-1">No matches.</p>}
            </div>
          </div>
        )}

        {showPlan && (
          <textarea defaultValue={wk.plan || ''} onBlur={e => setWeek(col.key, w.n, { plan: e.target.value })}
            placeholder={col.planPlaceholder} rows={2}
            className="w-full mt-1.5 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm resize-none focus:outline-none focus:border-red-500" />
        )}
      </div>
    )
  }

  return (
    <Card icon={Building2} title="Outreach by week"
      subtitle="Pick who to visit each week. Add a plan only where you need one."
      right={<Link to="/b2b" className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1">Open B2B <ExternalLink size={13} /></Link>}>
      {/* column headers (desktop) */}
      <div className="hidden md:grid md:grid-cols-[68px_1fr_1fr] gap-3 px-2.5 mb-1">
        <span />
        {COLS.map(c => <span key={c.key} className="text-[11px] font-bold uppercase text-gray-500">{c.label}</span>)}
      </div>

      <div className="space-y-2">
        {weeks.map(w => (
          <div key={w.n} className="border border-gray-200 rounded-lg p-2.5">
            <div className="grid md:grid-cols-[68px_1fr_1fr] gap-3">
              <div className="md:pt-0.5">
                <div className="text-sm font-bold text-gray-900 leading-tight">{w.label}</div>
                <div className="text-[11px] text-gray-400">{w.range}</div>
              </div>
              {COLS.map(c => <Cell key={c.key} col={c} w={w} />)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ─── Team meeting / fun event card (shows matching events + add) ──────────────
function TeamEventCard({ icon, accent, btn, title, matched, hint, defaultTitle, contentKey, fieldLabel, fieldKey, content, patchContent, onAdd, year, month }) {
  const rec = content[contentKey] || {}
  const inp = 'w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-red-500'
  return (
    <Card icon={icon} title={title} accent={accent}>
      {matched.length > 0 ? (
        <div className="space-y-1.5 mb-3">
          {matched.map(e => (
            <div key={e.id} className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
              <p className="text-sm font-semibold text-gray-900 truncate">{e.title}</p>
              <p className="text-[11px] text-gray-500">{fmtDay(e.start_date)}{e.start_time ? ` · ${fmtTime(e.start_time)}` : ''}</p>
            </div>
          ))}
        </div>
      ) : <p className="text-xs text-gray-400 mb-3">{hint}</p>}

      <input className={`${inp} mb-2`} placeholder={fieldLabel} defaultValue={rec[fieldKey] || ''}
        onBlur={e => patchContent({ [contentKey]: { ...rec, [fieldKey]: e.target.value } })} />
      <button onClick={() => onAdd({ presetTitle: defaultTitle })}
        className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 ${btn} text-white text-sm font-semibold rounded-lg`}>
        <Plus size={13} /> Add to Events
      </button>
    </Card>
  )
}

// ─── Contest card — populated from the Contests module ───────────────────────
function ContestCard({ contests, month, year, onCreated }) {
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ theme: '', metric: 'memberships', prize: '' })
  const inp = 'w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-red-500'

  const create = async () => {
    if (!form.theme.trim()) { alert('Add a contest title first.'); return }
    setBusy(true)
    try {
      await apiPost('/api/contests', {
        title: form.theme.trim(), prize: form.prize || null, scoring_mode: 'auto', metric: form.metric,
        period_month: month, period_year: year,
        starts_on: monthStartDate(year, month), ends_on: monthEndDate(year, month),
      })
      setForm({ theme: '', metric: 'memberships', prize: '' })
      onCreated && onCreated()
    } catch (e) { alert('Could not create the contest: ' + (e?.message || '')) }
    finally { setBusy(false) }
  }

  return (
    <Card icon={Trophy} title="Monthly contest" accent="text-amber-600"
      right={<Link to="/contest" className="text-xs text-red-600 font-medium flex items-center gap-1">Open <ExternalLink size={12} /></Link>}>
      {contests.length > 0 ? (
        <div className="space-y-1.5">
          {contests.map(c => (
            <div key={c.id} className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
              <p className="text-sm font-bold text-gray-900 truncate">{c.title}</p>
              <p className="text-[11px] text-gray-600">
                {(c.effective_status || c.status)}{c.metric ? ` · ${c.metric}` : ''}{c.prize ? ` · 🎁 ${c.prize}` : ''}
              </p>
              <p className="text-[11px] text-gray-400">{fmtDay(c.starts_on)} – {fmtDay(c.ends_on)}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">No contest for this month yet.</p>
          <input className={inp} placeholder="Contest title" value={form.theme} onChange={e => setForm(f => ({ ...f, theme: e.target.value }))} />
          <select className={inp} value={form.metric} onChange={e => setForm(f => ({ ...f, metric: e.target.value }))}>
            <option value="memberships">Memberships</option><option value="retail">Retail</option><option value="eft">EFT</option>
            <option value="outreach">Outreach</option><option value="leadgen_points">Lead-gen points</option><option value="commission">Commission</option>
          </select>
          <input className={inp} placeholder="Prize" value={form.prize} onChange={e => setForm(f => ({ ...f, prize: e.target.value }))} />
          <button onClick={create} disabled={busy}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create contest
          </button>
        </div>
      )}
    </Card>
  )
}

// ─── Holidays & seasonal ─────────────────────────────────────────────────────
function HolidaysCard({ year, month, custom, content, patchContent, onChanged }) {
  const majors = majorHolidays(year, month)
  const [label, setLabel] = useState('')
  const [day, setDay] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (!label.trim()) return
    setBusy(true)
    try {
      await apiPost('/api/monthly-planner/holidays', { month, label: label.trim(), day: day || null })
      setLabel(''); setDay(''); onChanged && onChanged()
    } catch (e) { alert('Could not add: ' + (e?.message || '')) }
    finally { setBusy(false) }
  }
  const remove = async (id) => {
    try { await apiDelete(`/api/monthly-planner/holidays/${id}`); onChanged && onChanged() }
    catch (e) { alert('Could not remove: ' + (e?.message || '')) }
  }

  return (
    <Card icon={CalendarDays} title="Holidays & seasonal" accent="text-pink-600"
      subtitle={`Major holidays for ${MONTHS[month-1]}, plus your own. Anything you add here comes back every ${MONTHS[month-1]}.`}>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Major holidays</p>
          {majors.length === 0 ? <p className="text-sm text-gray-400">No major holidays this month.</p> : (
            <ul className="space-y-1">{majors.map(h => (
              <li key={h.date} className="text-sm text-gray-700 flex items-center gap-2">
                <span className="text-[11px] font-semibold text-pink-700 bg-pink-50 border border-pink-200 rounded px-1.5 py-0.5 w-20 text-center">{fmtDay(h.date).replace(/^\w+, /, '')}</span>
                {h.label}
              </li>
            ))}</ul>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Ours (repeats yearly)</p>
          {custom.length === 0 ? <p className="text-sm text-gray-400">None added yet.</p> : (
            <ul className="space-y-1 mb-2">{custom.map(h => (
              <li key={h.id} className="text-sm text-gray-700 flex items-center gap-2 group">
                <span className="text-[11px] font-semibold text-gray-600 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 w-20 text-center">
                  {h.day ? `${MON_SHORT[month-1]} ${h.day}` : MON_SHORT[month-1]}
                </span>
                <span className="flex-1">{h.label}</span>
                <button onClick={() => remove(h.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 size={13} /></button>
              </li>
            ))}</ul>
          )}
          <div className="flex gap-1.5">
            <input type="number" min="1" max="31" value={day} onChange={e => setDay(e.target.value)} placeholder="Day"
              className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-500" />
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Best Friends Day"
              onKeyDown={e => { if (e.key === 'Enter') add() }}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-red-500" />
            <button onClick={add} disabled={busy || !label.trim()} className="px-3 py-1.5 bg-gray-800 hover:bg-black text-white text-sm font-semibold rounded-lg disabled:opacity-40">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={14} />}
            </button>
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        <span className="font-semibold">Seasonal:</span> {SEASONAL[month]}
      </p>
      <textarea defaultValue={content.seasonal_notes || ''}
        onBlur={e => patchContent({ seasonal_notes: e.target.value })}
        placeholder="Seasonal notes — themes, décor, seasonal offers…" rows={2}
        className="w-full mt-3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500" />
    </Card>
  )
}

// ─── Reusable pick-from-data card ─────────────────────────────────────────────
function PickerCard({ icon, title, subtitle, accent, items, selected, onToggle, render, link, emptyText }) {
  const [showAll, setShowAll] = useState(false)
  const selectedSet = new Set(selected)
  const sorted = [...items].sort((a, b) => (selectedSet.has(b.id) ? 1 : 0) - (selectedSet.has(a.id) ? 1 : 0))
  const shown = showAll ? sorted : sorted.slice(0, 12)
  return (
    <Card icon={icon} title={title} subtitle={subtitle} accent={accent}
      right={<Link to={link} className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1">Open <ExternalLink size={13} /></Link>}>
      {items.length === 0 ? <p className="text-sm text-gray-400">{emptyText}</p> : (
        <>
          <div className="space-y-1.5">
            {shown.map(it => {
              const r = render(it); const on = selectedSet.has(it.id)
              return (
                <button key={it.id} onClick={() => onToggle(it.id)}
                  className={`w-full flex items-center gap-2.5 text-left rounded-lg border px-3 py-2 transition-colors ${on ? 'bg-red-50 border-red-300' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                  <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${on ? 'bg-red-600 border-red-600' : 'border-gray-300'}`}>
                    {on && <Check size={12} className="text-white" />}
                  </span>
                  <Logo url={r.logo} name={r.title} size={20} />
                  <span className="font-semibold text-gray-900 text-sm flex-1 min-w-0 truncate">{r.title}</span>
                  {r.meta && <span className={`text-xs ${r.warn ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{r.meta}</span>}
                </button>
              )
            })}
          </div>
          {sorted.length > 12 && (
            <button onClick={() => setShowAll(s => !s)} className="mt-2 text-xs text-red-600 font-medium">
              {showAll ? 'Show fewer' : `Show all ${sorted.length}`}
            </button>
          )}
          <p className="text-xs text-gray-400 mt-2">{selected.length} selected for this month</p>
        </>
      )}
    </Card>
  )
}

