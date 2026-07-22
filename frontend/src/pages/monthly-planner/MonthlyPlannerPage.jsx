import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useMonth } from '@/contexts/MonthContext'
import { useStudio } from '@/contexts/StudioContext'
import { useRole } from '@/hooks/useRole'
import { apiGet, apiPut, apiPost } from '@/hooks/useApi'
import {
  CalendarRange, Target, Users, Building2, MapPin, Trophy, Megaphone,
  PartyPopper, GraduationCap, Sparkles, Check, Plus, ExternalLink, Loader2,
  CalendarDays, DollarSign, AlertCircle, CheckCircle2,
} from 'lucide-react'

// ─── helpers ──────────────────────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const fmtMoney = n => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const fmtNum   = n => (n == null ? '—' : Number(n).toLocaleString('en-US'))
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
const monthEndDate = (year, month) => `${year}-${String(month).padStart(2,'0')}-${String(new Date(year, month, 0).getDate()).padStart(2,'0')}`
const monthStartDate = (year, month) => `${year}-${String(month).padStart(2,'0')}-01`

// Built-in US fitness-studio holiday / seasonal cues per month (1–12).
const SEASONAL = {
  1:  ['New Year — resolution surge, push new memberships', "Martin Luther King Jr. Day"],
  2:  ['Valentine’s Day — couples/referral promo', 'Heart Health Month'],
  3:  ['Spring forward / Daylight Saving', 'Spring break — schedule shifts'],
  4:  ['Easter', 'Spring into fitness — outdoor/community events'],
  5:  ['Mother’s Day', 'Memorial Day (studio hours)', 'Summer body kickoff'],
  6:  ['Father’s Day', 'Summer challenge launch', 'Juneteenth'],
  7:  ['Independence Day (studio hours)', 'Mid-summer contest'],
  8:  ['Back-to-school — students & teachers push', 'End-of-summer challenge'],
  9:  ['Labor Day (studio hours)', 'Fall reset — re-engage lapsed members'],
  10: ['Halloween event', 'Breast Cancer Awareness (pink promo)'],
  11: ['Thanksgiving (studio hours)', 'Black Friday / holiday retail push', 'Refer-a-friend'],
  12: ['Holiday hours', 'New Year prep — pre-sell January', 'Year-end retail clearance'],
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

// A number field with an optional last-year reference shown beside it.
function TargetField({ label, prefix, value, lastYear, onChange }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
      <div className="flex items-center gap-1 mt-1">
        {prefix && <span className="text-gray-400 text-sm">{prefix}</span>}
        <input type="number" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-red-500" />
      </div>
      <p className="text-[11px] text-gray-400 mt-1">Last yr: {prefix || ''}{lastYear ?? '—'}</p>
    </div>
  )
}

export default function MonthlyPlannerPage() {
  const { selectedMonth: { month, year } } = useMonth()
  const { currentStudio } = useStudio()
  const { isOwner } = useRole()
  const studioId = currentStudio?.id

  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [plan, setPlan]       = useState(null)      // monthly_plans row
  const [content, setContent] = useState({})        // editable planner content
  const [reference, setReference] = useState(null)  // read-only surfaced numbers
  const [goals, setGoals]     = useState(null)      // current studio targets (editable)
  const [lastYearGoals, setLastYearGoals] = useState(null)
  const [b2b, setB2b]         = useState([])
  const [territories, setTerritories] = useState([])
  const [events, setEvents]   = useState([])
  const [lastYearEvents, setLastYearEvents] = useState([])
  const [roi, setRoi]         = useState(null)
  const [savingContent, setSavingContent] = useState(false)
  const [savingGoals, setSavingGoals] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const prYear = month === 1 ? year - 1 : year
      const prMonth = month === 1 ? 12 : month - 1
      const [pl, cur, contacts, terr, evs, lyEvs] = await Promise.all([
        apiGet(`/api/monthly-planner/${year}/${month}`),
        apiGet(`/api/goals/studio?month=${month}&year=${year}`),
        apiGet('/api/b2b/contacts').catch(() => []),
        apiGet('/api/territories').catch(() => []),
        apiGet(`/api/events?month=${month}&year=${year}`).catch(() => []),
        apiGet(`/api/events?month=${month}&year=${year - 1}`).catch(() => []),
      ])
      setPlan(pl.plan); setContent(pl.plan?.content || {}); setReference(pl.reference)
      // Accurate last-year targets (null when none set) come from the planner ref.
      setGoals(cur); setLastYearGoals(pl.reference?.lastYearGoals || null)
      setB2b(contacts || []); setTerritories(terr || []); setEvents(evs || []); setLastYearEvents(lyEvs || [])
      // Team ROI (owner only) — prior month
      if (isOwner) {
        apiGet(`/api/labor/summary?year=${prYear}&month=${prMonth}`).then(setRoi).catch(() => setRoi(null))
      }
    } catch (e) {
      setError(e?.message || 'Could not load the planner.')
    } finally { setLoading(false) }
  }, [studioId, year, month, isOwner])
  useEffect(() => { load() }, [load])

  // Merge a patch into content and persist the whole content object.
  const patchContent = useCallback(async (partial) => {
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

  const saveGoals = async (patch) => {
    setSavingGoals(true)
    try {
      const saved = await apiPut('/api/goals/studio', { month, year, ...goals, ...patch })
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
  const nonCorporate = useMemo(() => b2b.filter(c => c.partner_type !== 'corporate'), [b2b])
  const priorLabel = reference?.prior ? `${MONTHS[reference.prior.month - 1]} ${reference.prior.year}` : 'last month'

  if (loading) return (
    <div className="flex items-center justify-center h-64"><Loader2 size={26} className="animate-spin text-red-600" /></div>
  )

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-10">
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
          {finalized ? <CheckCircle2 size={16} /> : <Check size={16} />}
          {finalized ? 'Plan finalized' : 'Mark plan finalized'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2"><AlertCircle size={15} /> {error}</div>}
      {savingContent && <p className="text-xs text-gray-400 -mt-2">Saving…</p>}

      {/* 1. GOALS */}
      <Card icon={Target} title="Goals for the month" subtitle="Set this month's studio targets — shown next to last year. Saves straight to Goals.">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <TargetField label="EFT increase" prefix="$" value={goals?.eft_target} lastYear={lastYearGoals?.eft_target} onChange={v => setGoals(g => ({ ...g, eft_target: v }))} />
          <TargetField label="New members" value={goals?.memberships_target} lastYear={lastYearGoals?.memberships_target} onChange={v => setGoals(g => ({ ...g, memberships_target: v }))} />
          <TargetField label="Retail" prefix="$" value={goals?.retail_target} lastYear={lastYearGoals?.retail_target} onChange={v => setGoals(g => ({ ...g, retail_target: v }))} />
          <TargetField label="In the Bank" prefix="$" value={goals?.in_the_bank_target} lastYear={lastYearGoals?.in_the_bank_target} onChange={v => setGoals(g => ({ ...g, in_the_bank_target: v }))} />
          <TargetField label="Leads (outreach)" value={goals?.total_leads_target} lastYear={lastYearGoals?.total_leads_target} onChange={v => setGoals(g => ({ ...g, total_leads_target: v }))} />
          <TargetField label="Conversion %" value={goals?.conversion_rate_target} lastYear={lastYearGoals?.conversion_rate_target} onChange={v => setGoals(g => ({ ...g, conversion_rate_target: v }))} />
          <TargetField label="Show rate %" value={goals?.checkin_show_rate_target} lastYear={lastYearGoals?.checkin_show_rate_target} onChange={v => setGoals(g => ({ ...g, checkin_show_rate_target: v }))} />
          <TargetField label="Close rate %" value={goals?.close_rate_target} lastYear={lastYearGoals?.close_rate_target} onChange={v => setGoals(g => ({ ...g, close_rate_target: v }))} />
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button onClick={() => saveGoals({})} disabled={savingGoals}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
            {savingGoals ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save goals
          </button>
          <Link to="/goals" className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1">
            Set individual goals <ExternalLink size={13} />
          </Link>
        </div>
      </Card>

      {/* 2. LAST MONTH PERFORMANCE */}
      <Card icon={CalendarDays} title={`Last month — staffed hours by person / week`} subtitle={`${priorLabel} · for planning the schedule ahead`}>
        {(reference?.hoursByPersonWeek || []).length === 0 ? (
          <p className="text-sm text-gray-400">No shifts recorded for {priorLabel}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-xs uppercase border-b border-gray-200">
                <tr><th className="text-left py-2 font-semibold">Team member</th>
                  {[1,2,3,4,5].map(w => <th key={w} className="text-right py-2 px-3 font-semibold">Wk {w}</th>)}
                  <th className="text-right py-2 px-3 font-semibold">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reference.hoursByPersonWeek.map(p => (
                  <tr key={p.id}>
                    <td className="py-2 font-semibold text-gray-900">{p.name}</td>
                    {[1,2,3,4,5].map(w => <td key={w} className="py-2 px-3 text-right text-gray-600">{p.weeks[w] ? p.weeks[w] : '·'}</td>)}
                    <td className="py-2 px-3 text-right font-bold text-gray-900">{p.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isOwner && (
        <Card icon={DollarSign} title="Last month — Team ROI" subtitle={`${priorLabel} · labor cost vs revenue per person (owner only)`} accent="text-emerald-600">
          {!roi || !(roi.rows || roi.employees || []).length ? (
            <p className="text-sm text-gray-400">No ROI data for {priorLabel}. <Link to="/team-roi" className="text-red-600">Open Team ROI →</Link></p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-gray-500 text-xs uppercase border-b border-gray-200">
                  <tr><th className="text-left py-2 font-semibold">Team member</th>
                    <th className="text-right py-2 px-3 font-semibold">Hours</th>
                    <th className="text-right py-2 px-3 font-semibold">Cost</th>
                    <th className="text-right py-2 px-3 font-semibold">Revenue</th>
                    <th className="text-right py-2 px-3 font-semibold">Ratio</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(roi.rows || roi.employees).map(r => (
                    <tr key={r.id || r.user_id || r.name}>
                      <td className="py-2 font-semibold text-gray-900">{r.name}</td>
                      <td className="py-2 px-3 text-right text-gray-600">{r.hours ?? '—'}</td>
                      <td className="py-2 px-3 text-right text-gray-600">{fmtMoney(r.total_cost)}</td>
                      <td className="py-2 px-3 text-right text-gray-600">{fmtMoney(r.revenue)}</td>
                      <td className={`py-2 px-3 text-right font-bold ${Number(r.ratio) >= 1 ? 'text-green-600' : 'text-red-600'}`}>{r.ratio != null ? `${Number(r.ratio).toFixed(1)}×` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* 3. EVENTS & PROMOTIONS */}
      <Card icon={Megaphone} title="Events & promotions" subtitle="What ran last year this month, and what you're planning now."
        right={<Link to="/events" className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1">Open Events <ExternalLink size={13} /></Link>}>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Last year this month</p>
            {lastYearEvents.length === 0 ? <p className="text-sm text-gray-400">Nothing logged last year.</p> : (
              <ul className="space-y-1">{lastYearEvents.map(e => <li key={e.id} className="text-sm text-gray-700">• {e.title} <span className="text-gray-400">({e.event_type})</span></li>)}</ul>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Planned this month</p>
            {events.length === 0 ? <p className="text-sm text-gray-400">None yet — add events/promos in the Events module.</p> : (
              <ul className="space-y-1">{events.map(e => <li key={e.id} className="text-sm text-gray-700">• {e.title} <span className="text-gray-400">({e.event_type})</span></li>)}</ul>
            )}
          </div>
        </div>
        <textarea value={content.events_notes || ''} onChange={e => setContent(c => ({ ...c, events_notes: e.target.value }))} onBlur={e => patchContent({ events_notes: e.target.value })}
          placeholder="Planning notes for events & promotions…" rows={2}
          className="w-full mt-3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500" />
      </Card>

      {/* 4. BUSINESSES TO REACH OUT TO */}
      <PickerCard icon={Building2} title="Businesses to reach out to / visit" subtitle="Check the ones to target this month."
        items={nonCorporate} selected={content.b2b_targets || []} onToggle={id => toggleId('b2b_targets', id)}
        render={c => ({ title: c.business_name, meta: [c.industry, c.next_action_date ? `next: ${c.next_action_date}` : c.status].filter(Boolean).join(' · ') })}
        link="/b2b" emptyText="No businesses in your B2B list yet." />

      {/* 5. CORPORATE ACCOUNTS */}
      <PickerCard icon={Building2} title="Corporate accounts to target" subtitle="Check the corporate partners to pursue this month." accent="text-indigo-600"
        items={corporate} selected={content.corporate_targets || []} onToggle={id => toggleId('corporate_targets', id)}
        render={c => ({ title: c.business_name, meta: [c.industry, c.status].filter(Boolean).join(' · ') })}
        link="/b2b" emptyText="No corporate accounts yet — mark contacts as corporate in B2B." />

      {/* 6. APARTMENTS & NEIGHBORHOODS */}
      <PickerCard icon={MapPin} title="Apartments & neighborhoods to hit" subtitle="Check the canvassing zones to work this month." accent="text-orange-600"
        items={territories} selected={content.territory_targets || []} onToggle={id => toggleId('territory_targets', id)}
        render={z => ({ title: z.name, meta: [z.type, z.status === 'overdue' ? `${z.days_overdue}d overdue` : z.status].filter(Boolean).join(' · '), warn: z.status === 'overdue' })}
        link="/b2b" emptyText="No canvassing zones yet — add them in Canvassing." />

      {/* 7-9. TEAM MEETING / FUN EVENT / CONTEST */}
      <OneClickCreate content={content} setContent={setContent} patchContent={patchContent}
        month={month} year={year} onCreatedEvent={load} onCreatedContest={load} />

      {/* 10. SOCIAL MUST-POSTS */}
      <SocialPosts content={content} patchContent={patchContent} events={events} />

      {/* 11. HOLIDAYS & SEASONAL */}
      <Card icon={CalendarDays} title="Holidays & seasonal" subtitle="What's coming up this month to plan around." accent="text-pink-600">
        <ul className="space-y-1 mb-2">
          {(SEASONAL[month] || []).map((h, i) => <li key={i} className="text-sm text-gray-700">• {h}</li>)}
          {(reference?.holidays || []).map(h => <li key={h.block_date} className="text-sm text-gray-700">• {h.label} <span className="text-gray-400">({h.block_date})</span></li>)}
        </ul>
        <textarea value={content.seasonal_notes || ''} onChange={e => setContent(c => ({ ...c, seasonal_notes: e.target.value }))} onBlur={e => patchContent({ seasonal_notes: e.target.value })}
          placeholder="Seasonal notes — themes, décor, seasonal offers…" rows={2}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500" />
      </Card>

      {/* 12. WHAT ELSE */}
      <Card icon={Sparkles} title="What else should we plan for?" subtitle="Anything else on the radar for this month." accent="text-violet-600">
        <textarea value={content.notes || ''} onChange={e => setContent(c => ({ ...c, notes: e.target.value }))} onBlur={e => patchContent({ notes: e.target.value })}
          placeholder="Staffing, maintenance, orders, training, community partnerships…" rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500" />
      </Card>
    </div>
  )
}

// ─── Reusable pick-from-data card ─────────────────────────────────────────────
function PickerCard({ icon, title, subtitle, accent, items, selected, onToggle, render, link, emptyText }) {
  const [showAll, setShowAll] = useState(false)
  const selectedSet = new Set(selected)
  // Selected first, then overdue/actionable, cap the list unless expanded.
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

// ─── Team meeting / fun event / contest — plan + one-click create ─────────────
function OneClickCreate({ content, setContent, patchContent, month, year, onCreatedEvent, onCreatedContest }) {
  const [busy, setBusy] = useState('')
  const tm = content.training_meeting || {}
  const fe = content.fun_event || {}
  const ct = content.contest || {}
  const setField = (key, field, value) => setContent(c => ({ ...c, [key]: { ...(c[key] || {}), [field]: value } }))
  const blurSave = (key) => patchContent({ [key]: content[key] })

  const createEvent = async (key, defaultTitle, typeLabel) => {
    const rec = content[key] || {}
    if (!rec.date) { alert('Pick a date first.'); return }
    setBusy(key)
    try {
      const [y, m] = rec.date.split('-').map(Number)
      const ev = await apiPost('/api/events', {
        title: (key === 'training_meeting' ? rec.topic : rec.idea) || defaultTitle,
        event_type: 'team', start_date: rec.date, month: m, year: y,
        notes: `${typeLabel} — planned in the Monthly Planner`,
      })
      await patchContent({ [key]: { ...rec, event_id: ev.id } })
      onCreatedEvent && onCreatedEvent()
    } catch (e) { alert('Could not create the event: ' + (e?.message || '')) }
    finally { setBusy('') }
  }

  const createContest = async () => {
    if (!ct.theme) { alert('Add a contest theme/title first.'); return }
    setBusy('contest')
    try {
      const c = await apiPost('/api/contests', {
        title: ct.theme,
        prize: ct.prize || null,
        scoring_mode: 'auto',
        metric: ct.metric || 'memberships',
        period_month: month, period_year: year,
        starts_on: ct.starts_on || monthStartDate(year, month),
        ends_on: ct.ends_on || monthEndDate(year, month),
      })
      await patchContent({ contest: { ...ct, contest_id: c.id } })
      onCreatedContest && onCreatedContest()
    } catch (e) { alert('Could not create the contest: ' + (e?.message || '')) }
    finally { setBusy('') }
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-red-500'

  return (
    <div className="grid md:grid-cols-3 gap-4">
      {/* Team training meeting */}
      <Card icon={GraduationCap} title="Team training meeting" accent="text-blue-600">
        <div className="space-y-2">
          <input type="date" className={inp} value={tm.date || ''} onChange={e => setField('training_meeting','date',e.target.value)} onBlur={() => blurSave('training_meeting')} />
          <input className={inp} placeholder="Topic / agenda" value={tm.topic || ''} onChange={e => setField('training_meeting','topic',e.target.value)} onBlur={() => blurSave('training_meeting')} />
          {tm.event_id
            ? <p className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle2 size={13} /> Added to Events</p>
            : <button onClick={() => createEvent('training_meeting','Team Training Meeting','Team training meeting')} disabled={busy==='training_meeting'}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                {busy==='training_meeting' ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create in Events
              </button>}
        </div>
      </Card>

      {/* Team fun event */}
      <Card icon={PartyPopper} title="Team fun event" accent="text-fuchsia-600">
        <div className="space-y-2">
          <input type="date" className={inp} value={fe.date || ''} onChange={e => setField('fun_event','date',e.target.value)} onBlur={() => blurSave('fun_event')} />
          <input className={inp} placeholder="Idea (bowling, dinner…)" value={fe.idea || ''} onChange={e => setField('fun_event','idea',e.target.value)} onBlur={() => blurSave('fun_event')} />
          {fe.event_id
            ? <p className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle2 size={13} /> Added to Events</p>
            : <button onClick={() => createEvent('fun_event','Team Fun Event','Team fun event')} disabled={busy==='fun_event'}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                {busy==='fun_event' ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create in Events
              </button>}
        </div>
      </Card>

      {/* Contest */}
      <Card icon={Trophy} title="Monthly contest" accent="text-amber-600">
        <div className="space-y-2">
          <input className={inp} placeholder="Theme / title" value={ct.theme || ''} onChange={e => setField('contest','theme',e.target.value)} onBlur={() => blurSave('contest')} />
          <select className={inp} value={ct.metric || 'memberships'} onChange={e => setField('contest','metric',e.target.value)} onBlur={() => blurSave('contest')}>
            <option value="memberships">Memberships</option><option value="retail">Retail</option><option value="eft">EFT</option>
            <option value="outreach">Outreach</option><option value="leadgen_points">Lead-gen points</option><option value="commission">Commission</option>
          </select>
          <input className={inp} placeholder="Prize" value={ct.prize || ''} onChange={e => setField('contest','prize',e.target.value)} onBlur={() => blurSave('contest')} />
          {ct.contest_id
            ? <p className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle2 size={13} /> Contest created</p>
            : <button onClick={createContest} disabled={busy==='contest'}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                {busy==='contest' ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create contest
              </button>}
        </div>
      </Card>
    </div>
  )
}

// ─── Social media must-posts ──────────────────────────────────────────────────
function SocialPosts({ content, patchContent, events }) {
  const posts = content.social_posts || []
  const [text, setText] = useState('')
  const add = (t) => { if (!t.trim()) return; patchContent({ social_posts: [...posts, { id: uid(), text: t.trim(), checked: false }] }); setText('') }
  const toggle = (id) => patchContent({ social_posts: posts.map(p => p.id === id ? { ...p, checked: !p.checked } : p) })
  const remove = (id) => patchContent({ social_posts: posts.filter(p => p.id !== id) })
  const suggestions = events.filter(e => !posts.some(p => p.text.includes(e.title))).slice(0, 4).map(e => `Post about ${e.title}`)

  return (
    <Card icon={Megaphone} title="Social media must-posts" subtitle="What to post this month — events, promos, member wins." accent="text-sky-600">
      <div className="space-y-1.5 mb-3">
        {posts.length === 0 && <p className="text-sm text-gray-400">No posts planned yet.</p>}
        {posts.map(p => (
          <div key={p.id} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${p.checked ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'}`}>
            <button onClick={() => toggle(p.id)} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${p.checked ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
              {p.checked && <Check size={12} className="text-white" />}
            </button>
            <span className={`flex-1 text-sm ${p.checked ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{p.text}</span>
            <button onClick={() => remove(p.id)} className="text-gray-300 hover:text-red-500 text-xs">✕</button>
          </div>
        ))}
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {suggestions.map(s => <button key={s} onClick={() => add(s)} className="text-xs px-2.5 py-1 bg-sky-50 text-sky-700 border border-sky-200 rounded-full hover:bg-sky-100">+ {s}</button>)}
        </div>
      )}
      <div className="flex gap-2">
        <input className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-red-500"
          placeholder="Add a post to make…" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(text) }} />
        <button onClick={() => add(text)} className="px-3 py-1.5 bg-gray-800 hover:bg-black text-white text-sm font-semibold rounded-lg flex items-center gap-1"><Plus size={14} /> Add</button>
      </div>
    </Card>
  )
}
