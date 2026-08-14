import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { useStudio } from '@/contexts/StudioContext'
import { useRole } from '@/hooks/useRole'
import { Rocket, Loader2, Plus, Check, Calendar, TrendingUp, Pencil, X, Users, Store, Search, Trash2, Link2, CalendarPlus } from 'lucide-react'

const fmt = (n) => (n ?? 0).toLocaleString()
const GROUP_ORDER = ['Always on', 'Feet on the street', 'Ambassadors', 'People', 'Other']

// Partner roles — each maps to the ledger channel its attributed leads land in.
const ROLES = [
  { key: 'hour_sponsor', label: 'Hour Sponsor', channel: 'bizcanvass' },
  { key: 'prize_donor', label: 'Prize Donor', channel: 'bizcanvass' },
  { key: 'business_ambassador', label: 'Business Ambassador', channel: 'bizamb' },
  { key: 'event_host', label: 'Event Host', channel: 'events' },
  { key: 'corporate', label: 'Corporate Partner', channel: 'commamb' },
  { key: 'apartment', label: 'Apartment', channel: 'apartments' },
]
const ROLE_LABEL = Object.fromEntries(ROLES.map(r => [r.key, r.label]))
const STATUS = {
  pitched: { label: 'Pitched', cls: 'bg-gray-100 text-gray-600' },
  committed: { label: 'Committed', cls: 'bg-amber-100 text-amber-700' },
  confirmed: { label: 'Confirmed', cls: 'bg-emerald-100 text-emerald-700' },
  declined: { label: 'Declined', cls: 'bg-red-100 text-red-500' },
}
const STATUS_CYCLE = ['pitched', 'committed', 'confirmed', 'declined']

// One channel row: actual/planned bar + a quick "+ leads" logger.
function ChannelRow({ ch, editing, onLog, onPlan }) {
  const [n, setN] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const pct = ch.planned > 0 ? Math.min(100, Math.round((ch.actual / ch.planned) * 100)) : (ch.actual > 0 ? 100 : 0)
  const log = async () => {
    const v = parseInt(n); if (!Number.isFinite(v) || v === 0) return
    setSaving(true); await onLog(ch.id, v, note); setN(''); setNote(''); setSaving(false)
  }
  return (
    <div className="py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="text-sm font-semibold text-gray-800">{ch.label}</span>
        <span className="text-xs font-bold text-gray-900">{fmt(ch.actual)}<span className="text-gray-400 font-normal"> / {fmt(ch.planned)}</span></span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1.5">
        <div className="h-full rounded-full bg-[#C8102E]" style={{ width: `${pct}%` }} />
      </div>
      {editing ? (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Plan:</span>
          <input type="number" defaultValue={ch.plan_units} onBlur={e => onPlan(ch.id, { plan_units: e.target.value })}
            className="w-16 border border-gray-300 rounded px-1.5 py-0.5 text-right" /> units ×
          <input type="number" defaultValue={ch.plan_per_unit} onBlur={e => onPlan(ch.id, { plan_per_unit: e.target.value })}
            className="w-16 border border-gray-300 rounded px-1.5 py-0.5 text-right" /> each = <b className="text-gray-700">{fmt(ch.plan_units * ch.plan_per_unit)}</b>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <input type="number" value={n} onChange={e => setN(e.target.value)} onKeyDown={e => e.key === 'Enter' && log()}
            placeholder="+ leads" className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm" />
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="source / note (optional)"
            className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1 text-xs" />
          <button onClick={log} disabled={saving} className="flex-shrink-0 bg-gray-800 hover:bg-black text-white rounded-lg px-2 py-1.5 disabled:opacity-50">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          </button>
        </div>
      )}
    </div>
  )
}

function Sparkline({ daily }) {
  const max = Math.max(1, ...daily.map(d => d.count))
  return (
    <div className="flex items-end gap-0.5 h-10">
      {daily.map(d => (
        <div key={d.date} title={`${d.date}: ${d.count}`} className="flex-1 bg-[#C8102E]/70 rounded-sm" style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }} />
      ))}
    </div>
  )
}

// Modal to pull businesses out of the B2B tracker into the campaign (or onto an event).
function BusinessPicker({ mode, onClose, onSubmit }) {
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState({})
  const [role, setRole] = useState('business_ambassador')
  const [saving, setSaving] = useState(false)
  useEffect(() => { apiGet('/api/presale/businesses').then(setRows).catch(() => setRows([])) }, [])
  const ids = Object.keys(sel).filter(k => sel[k])
  const filtered = (rows || []).filter(r => !q || (r.business_name || '').toLowerCase().includes(q.toLowerCase()) || (r.industry || '').toLowerCase().includes(q.toLowerCase()))
  const submit = async () => {
    if (!ids.length) return
    setSaving(true); await onSubmit(ids, role); setSaving(false); onClose()
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{mode === 'attach' ? 'Attach businesses to event' : 'Add businesses to campaign'}</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="p-4 space-y-3">
          {mode !== 'attach' && (
            <div>
              <label className="text-xs font-semibold text-gray-500">Role</label>
              <select value={role} onChange={e => setRole(e.target.value)} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>
          )}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search your B2B contacts…" className="w-full border border-gray-300 rounded-lg pl-8 pr-2 py-1.5 text-sm" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {rows === null ? <div className="py-8 text-center"><Loader2 className="animate-spin mx-auto text-gray-300" /></div>
            : filtered.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No B2B contacts match.</p>
              : filtered.map(r => {
                const already = (r.partner_roles || []).length > 0
                return (
                  <label key={r.id} className="flex items-center gap-2.5 py-2 border-b border-gray-50 cursor-pointer">
                    <input type="checkbox" checked={!!sel[r.id]} onChange={e => setSel(s => ({ ...s, [r.id]: e.target.checked }))} className="accent-[#C8102E]" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 truncate">{r.business_name}</div>
                      <div className="text-[11px] text-gray-400 truncate">
                        {r.industry || '—'}{r.distance_mi != null ? ` · ${r.distance_mi} mi` : ''}
                        {already ? ` · in campaign: ${r.partner_roles.map(pr => ROLE_LABEL[pr] || pr).join(', ')}` : ''}
                      </div>
                    </div>
                  </label>
                )
              })}
        </div>
        <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="text-sm font-semibold text-gray-500 px-3 py-2">Cancel</button>
          <button onClick={submit} disabled={!ids.length || saving} className="bg-[#C8102E] text-white text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-40 flex items-center gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add {ids.length || ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// One partner card: status pill (click to advance), attributed leads, quick logger, remove.
function PartnerRow({ p, channelId, onLog, onStatus, onRemove }) {
  const [n, setN] = useState('')
  const [saving, setSaving] = useState(false)
  const st = STATUS[p.status] || STATUS.pitched
  const log = async () => {
    const v = parseInt(n); if (!Number.isFinite(v) || v === 0) return
    setSaving(true); await onLog(p, channelId, v); setN(''); setSaving(false)
  }
  return (
    <div className="py-2.5 border-b border-gray-100 last:border-0 flex items-center gap-2 flex-wrap">
      <div className="flex-1 min-w-[140px]">
        <div className="text-sm font-semibold text-gray-800">{p.business_name}</div>
        <div className="text-[11px] text-gray-400">{p.industry || '—'}{p.leads_attributed ? ` · ${p.leads_attributed} leads attributed` : ''}</div>
      </div>
      <button onClick={() => onStatus(p)} className={`text-[11px] font-bold px-2 py-1 rounded-full ${st.cls}`} title="Click to advance status">{st.label}</button>
      <div className="flex items-center gap-1">
        <input type="number" value={n} onChange={e => setN(e.target.value)} onKeyDown={e => e.key === 'Enter' && log()} placeholder="+ leads" className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm" />
        <button onClick={log} disabled={saving} className="bg-gray-800 hover:bg-black text-white rounded-lg px-2 py-1.5 disabled:opacity-50">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
        </button>
        <button onClick={() => onRemove(p)} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={14} /></button>
      </div>
    </div>
  )
}

function EventRow({ ev, onLog, onAttach }) {
  const [n, setN] = useState('')
  const [saving, setSaving] = useState(false)
  const log = async () => {
    const v = parseInt(n); if (!Number.isFinite(v) || v === 0) return
    setSaving(true); await onLog(ev, v); setN(''); setSaving(false)
  }
  return (
    <div className="py-2.5 border-b border-gray-100 last:border-0 flex items-center gap-2 flex-wrap">
      <div className="flex-1 min-w-[140px]">
        <div className="text-sm font-semibold text-gray-800">{ev.title}</div>
        <div className="text-[11px] text-gray-400">{ev.start_date || '—'} · {ev.businesses} business{ev.businesses === 1 ? '' : 'es'} · {ev.leads_captured} leads captured</div>
      </div>
      <button onClick={() => onAttach(ev)} className="text-[11px] font-semibold text-gray-600 border border-gray-200 rounded-lg px-2 py-1 hover:bg-gray-50">+ businesses</button>
      <div className="flex items-center gap-1">
        <input type="number" value={n} onChange={e => setN(e.target.value)} onKeyDown={e => e.key === 'Enter' && log()} placeholder="+ leads" className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm" />
        <button onClick={log} disabled={saving} className="bg-gray-800 hover:bg-black text-white rounded-lg px-2 py-1.5 disabled:opacity-50">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
        </button>
      </div>
    </div>
  )
}

export default function PreSalePage() {
  const { currentStudio } = useStudio()
  const { isOwner } = useRole()
  const [data, setData] = useState(null)
  const [partners, setPartners] = useState([])
  const [events, setEvents] = useState({ linked: [], available: [], events_channel_id: null })
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [picker, setPicker] = useState(null) // {mode:'partner'} | {mode:'attach', eventId}
  const [newEvent, setNewEvent] = useState(null) // {title,start_date}

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [d, p, e] = await Promise.all([
        apiGet('/api/presale/dashboard'),
        apiGet('/api/presale/partners').catch(() => []),
        apiGet('/api/presale/events').catch(() => ({ linked: [], available: [] })),
      ])
      setData(d); setPartners(p || []); setEvents(e || { linked: [], available: [] })
    } catch { setData(null) }
    finally { setLoading(false) }
  }, [currentStudio?.id])
  useEffect(() => { load() }, [load])

  const logLead = async (channel_id, lead_count, notes) => {
    try { await apiPost('/api/presale/leads', { channel_id, lead_count, notes }); await load() } catch { /* ignore */ }
  }
  const savePlan = async (id, patch) => {
    try { await apiPut(`/api/presale/channels/${id}/plan`, patch); await load() } catch { /* ignore */ }
  }
  const saveCampaign = async (patch) => {
    try { await apiPut('/api/presale/campaign', patch); await load() } catch { /* ignore */ }
  }
  // Partners
  const channelIdForRole = (role) => {
    const key = ROLES.find(r => r.key === role)?.channel
    const chans = data?.channels || []
    return chans.find(c => c.key === key)?.id || chans[0]?.id
  }
  const addPartners = async (contact_ids, role) => {
    try { await apiPost('/api/presale/partners', { contact_ids, role }); await load() } catch { /* ignore */ }
  }
  const logPartnerLead = async (p, channel_id, lead_count) => {
    try { await apiPost('/api/presale/leads', { channel_id, lead_count, b2b_contact_id: p.b2b_contact_id, source_tag: `partner-${p.b2b_contact_id.slice(0, 8)}` }); await load() } catch { /* ignore */ }
  }
  const advanceStatus = async (p) => {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(p.status) + 1) % STATUS_CYCLE.length]
    try { await apiPut(`/api/presale/partners/${p.id}`, { status: next }); await load() } catch { /* ignore */ }
  }
  const removePartner = async (p) => {
    if (!window.confirm(`Remove ${p.business_name} from the campaign?`)) return
    try { await apiDelete(`/api/presale/partners/${p.id}`); await load() } catch { /* ignore */ }
  }
  // Events
  const createEvent = async () => {
    if (!newEvent?.title || !newEvent?.start_date) return
    try { await apiPost('/api/presale/events', newEvent); setNewEvent(null); await load() } catch { /* ignore */ }
  }
  const linkEvent = async (event_id) => {
    if (!event_id) return
    try { await apiPost('/api/presale/events/link', { event_id }); await load() } catch { /* ignore */ }
  }
  const logEventLeads = async (ev, lead_count) => {
    try { await apiPost(`/api/presale/events/${ev.id}/leads`, { lead_count }); await load() } catch { /* ignore */ }
  }
  const attachToEvent = async (contact_ids) => {
    const eventId = picker?.eventId
    if (!eventId) return
    try { await apiPost(`/api/presale/events/${eventId}/attach`, { contact_ids }); await load() } catch { /* ignore */ }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#C8102E]" size={26} /></div>
  if (!data?.campaign) return (
    <div className="max-w-2xl mx-auto text-center py-20">
      <Rocket className="mx-auto text-gray-300 mb-3" size={30} />
      <p className="text-sm font-semibold text-gray-700">No pre-sale campaign for this studio.</p>
      <p className="text-xs text-gray-400 mt-1">The Pre-Sale tab is enabled per studio in Franchise Admin.</p>
    </div>
  )

  const { campaign, goal, actual, planned, channels, pace, daily } = data
  const pct = goal > 0 ? Math.min(100, Math.round((actual / goal) * 100)) : 0
  const planPct = goal > 0 ? Math.min(100, Math.round((planned / goal) * 100)) : 0
  const groups = {}
  for (const c of channels) (groups[c.channel_group] = groups[c.channel_group] || []).push(c)
  const orderedGroups = GROUP_ORDER.filter(g => groups[g])
  // Partners grouped by role.
  const partnersByRole = {}
  for (const p of partners) (partnersByRole[p.role] = partnersByRole[p.role] || []).push(p)

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-10">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5"><Rocket size={22} className="text-[#C8102E]" /> {campaign.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{currentStudio?.name} · pre-sale lead campaign</p>
        </div>
        {isOwner && (
          <button onClick={() => setEditing(e => !e)} className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">
            {editing ? <><X size={13} /> Done</> : <><Pencil size={13} /> Edit plan</>}
          </button>
        )}
      </div>

      {/* The math */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-4xl font-black text-gray-900 tracking-tight">{fmt(actual)}<span className="text-xl text-gray-400 font-bold"> / {fmt(goal)}</span></div>
            <div className="text-xs text-gray-500 mt-0.5">leads banked · {pct}% of goal</div>
          </div>
          <div className="flex gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-gray-900">{pace.days_remaining ?? '—'}</div>
              <div className="text-[11px] text-gray-500">days to launch</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#C8102E]">{pace.per_day_required != null ? fmt(pace.per_day_required) : '—'}</div>
              <div className="text-[11px] text-gray-500">leads/day needed</div>
            </div>
          </div>
        </div>
        {/* Dual bar: actual (solid) over plan (ghost) on the same goal scale */}
        <div className="mt-4 relative h-4 bg-gray-100 rounded-full overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-gray-200 rounded-full" style={{ width: `${planPct}%` }} title={`Plan: ${fmt(planned)}`} />
          <div className="absolute inset-y-0 left-0 bg-[#C8102E] rounded-full" style={{ width: `${pct}%` }} title={`Actual: ${fmt(actual)}`} />
        </div>
        <div className="flex justify-between text-[11px] text-gray-400 mt-1">
          <span><span className="inline-block w-2 h-2 rounded-full bg-[#C8102E] mr-1" />Actual {fmt(actual)}</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-gray-300 mr-1" />Planned {fmt(planned)}</span>
          <span>Goal {fmt(goal)}</span>
        </div>

        {isOwner && editing && (
          <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-gray-100 text-sm">
            <label className="flex items-center gap-1.5 text-gray-600">Goal
              <input type="number" defaultValue={goal} onBlur={e => saveCampaign({ goal_leads: e.target.value })} className="w-24 border border-gray-300 rounded px-2 py-1" /></label>
            <label className="flex items-center gap-1.5 text-gray-600"><Calendar size={14} /> Launch day
              <input type="date" defaultValue={campaign.launch_day || ''} onBlur={e => saveCampaign({ launch_day: e.target.value })} className="border border-gray-300 rounded px-2 py-1" /></label>
          </div>
        )}
      </div>

      {/* 14-day trend */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-1.5"><span className="text-[13px] font-bold text-gray-700 flex items-center gap-1.5"><TrendingUp size={14} /> Last 14 days</span></div>
        <Sparkline daily={daily} />
      </div>

      {/* Channels */}
      {orderedGroups.map(g => (
        <div key={g} className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
          <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">{g}</h2>
          {groups[g].map(ch => <ChannelRow key={ch.id} ch={ch} editing={editing} onLog={logLead} onPlan={savePlan} />)}
        </div>
      ))}

      {/* Partners — pulled from the B2B tracker */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1.5"><Store size={15} className="text-[#C8102E]" /> Partners</h2>
          <button onClick={() => setPicker({ mode: 'partner' })} className="flex items-center gap-1 text-[13px] font-semibold text-[#C8102E] border border-[#C8102E]/30 rounded-lg px-2.5 py-1 hover:bg-[#C8102E]/5">
            <Users size={13} /> Add businesses
          </button>
        </div>
        {partners.length === 0 ? (
          <p className="text-sm text-gray-400 py-3">No partners yet. Pull hour sponsors, prize donors, ambassadors, and corporate/apartment partners straight from your B2B contacts — every action logs back onto their business card.</p>
        ) : ROLES.filter(r => partnersByRole[r.key]).map(r => (
          <div key={r.key} className="mb-2 last:mb-0">
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mt-2 mb-0.5">{r.label}</div>
            {partnersByRole[r.key].map(p => (
              <PartnerRow key={p.id} p={p} channelId={channelIdForRole(p.role)} onLog={logPartnerLead} onStatus={advanceStatus} onRemove={removePartner} />
            ))}
          </div>
        ))}
      </div>

      {/* Events */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1.5"><Calendar size={15} className="text-[#C8102E]" /> Events</h2>
          <button onClick={() => setNewEvent(newEvent ? null : { title: '', start_date: '' })} className="flex items-center gap-1 text-[13px] font-semibold text-[#C8102E] border border-[#C8102E]/30 rounded-lg px-2.5 py-1 hover:bg-[#C8102E]/5">
            <CalendarPlus size={13} /> New event
          </button>
        </div>
        {newEvent && (
          <div className="flex flex-wrap items-center gap-2 mb-3 p-2.5 bg-gray-50 rounded-lg">
            <input value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} placeholder="Event name" className="flex-1 min-w-[140px] border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            <input type="date" value={newEvent.start_date} onChange={e => setNewEvent({ ...newEvent, start_date: e.target.value })} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            <button onClick={createEvent} disabled={!newEvent.title || !newEvent.start_date} className="bg-[#C8102E] text-white text-sm font-semibold rounded-lg px-3 py-1.5 disabled:opacity-40">Create</button>
          </div>
        )}
        {events.available?.length > 0 && (
          <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
            <Link2 size={13} /> Link an existing event:
            <select onChange={e => { linkEvent(e.target.value); e.target.value = '' }} defaultValue="" className="border border-gray-300 rounded-lg px-2 py-1 text-xs">
              <option value="" disabled>Choose…</option>
              {events.available.map(e => <option key={e.id} value={e.id}>{e.title}{e.start_date ? ` — ${e.start_date}` : ''}</option>)}
            </select>
          </div>
        )}
        {(!events.linked || events.linked.length === 0) ? (
          <p className="text-sm text-gray-400 py-2">No events linked yet. Create a pop-up or link an existing event, attach the businesses hosting it, then log the leads it captured.</p>
        ) : events.linked.map(ev => (
          <EventRow key={ev.id} ev={ev} onLog={logEventLeads} onAttach={(e) => setPicker({ mode: 'attach', eventId: e.id })} />
        ))}
      </div>

      <p className="text-xs text-gray-400 flex items-center gap-1.5"><Check size={12} /> Every lead is a ledger entry — channel totals are the sum, never typed over. Partner & event actions also post to each business's B2B card.</p>

      {picker && (
        <BusinessPicker
          mode={picker.mode}
          onClose={() => setPicker(null)}
          onSubmit={picker.mode === 'attach' ? (ids) => attachToEvent(ids) : (ids, role) => addPartners(ids, role)}
        />
      )}
    </div>
  )
}
