import { useState, useEffect, useCallback } from 'react'
import { useRole } from '@/hooks/useRole'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { useMonth } from '@/contexts/MonthContext'
import {
  Plus, X, Edit2, Trash2, Calendar, Tag, Repeat,
  Gift, MapPin, Clock, ChevronDown, ChevronUp,
  AlertCircle, Loader2, Building2, Phone, Mail, Search, Star, Share2, ShoppingCart,
  Check, ArrowRight,
} from 'lucide-react'
import CalendarView from '@/components/CalendarView'
import { RichTextEditor, renderRichText } from '@/components/RichText'
import RatingModal, { StarDisplay } from '@/components/RatingModal'
import ThumbsWidget, { useFeedbackSignals } from '@/components/ThumbsWidget'

// ─── Constants ───────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  { value: 'in-store',    label: 'In-Store',    color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'community',   label: 'Community',   color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'corporate',   label: 'Corporate',   color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { value: 'partnership', label: 'Partnership', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { value: 'online',      label: 'Online',      color: 'bg-sky-100 text-sky-800 border-sky-300' },
  { value: 'business_of_the_month', label: 'Business of the Month', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { value: 'influencer_visit',      label: 'Influencer Visit',      color: 'bg-pink-100 text-pink-800 border-pink-300' },
  { value: 'pop_up',      label: 'Pop Up',      color: 'bg-teal-100 text-teal-800 border-teal-300' },
  { value: 'team',        label: 'Team',        color: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  { value: 'other',       label: 'Other',       color: 'bg-gray-100 text-gray-700 border-gray-300' },
]

const PROMO_TYPES = [
  { value: 'discount',     label: 'Discount' },
  { value: 'free_session', label: 'Free Session' },
  { value: 'referral',     label: 'Referral' },
  { value: 'flash_sale',   label: 'Flash Sale' },
  { value: 'bundle',       label: 'Bundle' },
  { value: 'hotworx',      label: 'HOTWORX' },
  { value: 'other',        label: 'Other' },
]

const DISCOUNT_UNITS = [
  { value: '%',    label: '% off' },
  { value: '$',    label: '$ off' },
  { value: 'free', label: 'Free' },
  { value: 'other',label: 'Other' },
]

function eventTypeMeta(val) {
  return EVENT_TYPES.find(t => t.value === val) || EVENT_TYPES[EVENT_TYPES.length - 1]
}

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(str) {
  if (!str) return ''
  const [h, m] = str.split(':')
  const hour = parseInt(h, 10)
  return `${hour % 12 || 12}:${m} ${hour < 12 ? 'AM' : 'PM'}`
}

function isExpired(endDate) {
  if (!endDate) return false
  return new Date(endDate + 'T23:59:59') < new Date()
}

// ─── Shared UI ───────────────────────────────────────────────────────────────

function PageTabs({ active, onChange }) {
  const tabs = [
    { id: 'events',    label: 'Events' },
    { id: 'promos',    label: 'Promotions' },
    { id: 'discounts', label: 'B2B Partner Discounts' },
    { id: 'calendar',  label: 'Public Calendar' },
  ]
  return (
    <div className="flex border-b border-gray-200 mb-6">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            active === t.id
              ? 'border-orange-500 text-orange-500'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function EmptyState({ icon: Icon, message }) {
  return (
    <div className="text-center py-14 text-gray-400">
      <Icon className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 bg-gray-800 rounded-t-xl flex-shrink-0">
          <h2 className="text-white font-semibold text-base">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4 flex-1">{children}</div>
      </div>
    </div>
  )
}

function FormField({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500'

// ─── Events Tab ──────────────────────────────────────────────────────────────

// One marketing-plan step: push it to a chosen teammate's To-Do list (coaching-style).
function PlanItemRow({ item, canEdit, onPush }) {
  const [pushing, setPushing] = useState(false)
  const [pushed, setPushed] = useState(item.pushed_to_todo)
  const [showPicker, setShowPicker] = useState(false)
  const [managers, setManagers] = useState([])

  const openPicker = async () => {
    setShowPicker(true)
    if (!managers.length) {
      try { const m = await apiGet('/api/todo/managers'); setManagers(Array.isArray(m) ? m : []) } catch { /* ignore */ }
    }
  }
  const handlePush = async (target) => {
    setPushing(true); setShowPicker(false)
    try { await onPush(item, target); setPushed(true) } catch { /* ignore */ } finally { setPushing(false) }
  }

  return (
    <div className={`flex items-start gap-2 px-2.5 py-2 rounded-lg ${pushed ? 'bg-green-50' : 'bg-gray-50'}`}>
      <div className={`mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center ${pushed ? 'bg-green-500' : 'bg-gray-300'}`}>
        {pushed && <Check size={10} className="text-white" strokeWidth={3} />}
      </div>
      <p className={`text-sm flex-1 ${pushed ? 'text-gray-500 line-through' : 'text-gray-800'}`}>{item.text}</p>
      {canEdit && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {pushed ? (
            <span className="text-[11px] text-green-600 font-medium whitespace-nowrap">✓ In To-Do</span>
          ) : showPicker ? (
            <div className="flex items-center gap-1 flex-wrap justify-end">
              <span className="text-[11px] text-gray-500">To:</span>
              {managers.map(m => (
                <button key={m.id} onClick={() => handlePush({ list_target: 'manager', assigned_to: m.id })} disabled={pushing}
                  className="text-[11px] font-semibold px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">{m.name}</button>
              ))}
              <button onClick={() => handlePush({ list_target: 'owner', assigned_to: '' })} disabled={pushing}
                className="text-[11px] font-semibold px-2 py-0.5 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50">Owner</button>
              <button onClick={() => setShowPicker(false)} className="p-0.5 text-gray-400 hover:text-gray-600"><X className="w-3 h-3" /></button>
            </div>
          ) : (
            <button onClick={openPicker} disabled={pushing}
              className="flex items-center gap-1 text-[11px] font-semibold text-orange-600 hover:text-orange-700 whitespace-nowrap">
              {pushing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />} Push to To-Do
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function EventCard({ event, canEdit, onEdit, onDelete, rating, onRate, signal }) {
  const [expanded, setExpanded] = useState(false)
  const [supplies, setSupplies] = useState(Array.isArray(event.supplies) ? event.supplies : [])
  const [addedTodos, setAddedTodos] = useState({})
  const [addedOrders, setAddedOrders] = useState({})
  const [orderingAll, setOrderingAll] = useState(false)
  const [planItems, setPlanItems] = useState(Array.isArray(event.marketing_plan_items) ? event.marketing_plan_items : [])
  const meta = eventTypeMeta(event.event_type)
  const past = isExpired(event.end_date || event.start_date)

  const toggleSupply = async (id) => {
    const next = supplies.map(s => s.id === id ? { ...s, checked: !s.checked } : s)
    setSupplies(next)
    try { await apiPut(`/api/events/${event.id}/supplies`, { supplies: next }) } catch { /* revert on error */ setSupplies(supplies) }
  }
  const addSupplyToTodo = async (item) => {
    try {
      await apiPost('/api/todo', { title: item.text, area: 'Events', source: 'event', notes: `For event: ${event.title}` })
      setAddedTodos(p => ({ ...p, [item.id]: true }))
    } catch { /* ignore */ }
  }
  const addSupplyToOrder = async (item) => {
    await apiPost('/api/orders', {
      item_name: item.text, quantity: 1, category: 'supplies',
      notes: `For event: ${event.title} (${fmtDate(event.start_date)})`,
    })
    setAddedOrders(p => ({ ...p, [item.id]: true }))
  }
  const pushAllToOrders = async () => {
    const pending = supplies.filter(s => !addedOrders[s.id])
    if (pending.length === 0) return
    setOrderingAll(true)
    try {
      await apiPost('/api/orders/bulk', {
        items: pending.map(s => ({ text: s.text })),
        category: 'supplies',
        source: `For event: ${event.title} (${fmtDate(event.start_date)})`,
      })
      setAddedOrders(p => { const n = { ...p }; for (const s of pending) n[s.id] = true; return n })
    } catch { /* leave buttons available to retry */ } finally { setOrderingAll(false) }
  }
  // Marketing-plan checklist → push an item to a teammate's To-Do list (coaching-style)
  const pushPlanItem = async (item, target) => {
    await apiPost('/api/todo', {
      title: item.text, area: 'Events', source: 'event',
      notes: `Marketing — ${event.title}`,
      list_target: target.list_target, assigned_to: target.assigned_to,
    })
    const next = planItems.map(p => p.id === item.id ? { ...p, pushed_to_todo: true } : p)
    setPlanItems(next)
    try { await apiPut(`/api/events/${event.id}/marketing-plan`, { marketing_plan_items: next }) } catch { /* keep UI state */ }
  }
  const hasPlanning = event.goal || event.marketing_plan || planItems.length > 0 || supplies.length > 0

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-opacity ${past ? 'opacity-60' : ''}`}>
      {/* Orange top accent */}
      <div className="h-1 bg-orange-500" />

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${meta.color}`}>
                {meta.label}
              </span>
              {past && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                  Past
                </span>
              )}
            </div>
            <h3 className="font-semibold text-gray-900 text-base leading-snug">{event.title}</h3>
            <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500 flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {fmtDate(event.start_date)}
                {event.end_date && event.end_date !== event.start_date && ` – ${fmtDate(event.end_date)}`}
              </span>
              {(event.start_time || event.end_time) && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {fmtTime(event.start_time)}{event.end_time && ` – ${fmtTime(event.end_time)}`}
                </span>
              )}
              {event.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {event.location}
                </span>
              )}
              {event.b2b_partners?.map(p => (
                <span key={p.id} className="flex items-center gap-1 text-orange-600 font-medium">
                  <Building2 className="w-3.5 h-3.5" />
                  {p.business_name}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <ThumbsWidget
              entityType="event"
              entityId={event.id}
              entityLabel={event.title}
              initialUp={signal?.up ?? 0}
              initialNeutral={signal?.neutral ?? 0}
              initialDown={signal?.down ?? 0}
              initialMine={signal?.mine ?? null}
            />
            {past && (
              <button
                onClick={() => onRate(event)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${rating ? 'text-amber-600 hover:bg-amber-50' : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'}`}
                title="Rate this event"
              >
                <Star className="w-3.5 h-3.5" fill={rating ? '#fbbf24' : 'none'} strokeWidth={1.5} />
                {rating ? <StarDisplay rating={rating.rating} size={11} /> : <span className="hidden sm:inline">Rate</span>}
              </button>
            )}
            {canEdit && (
              <>
                <button onClick={() => onEdit(event)} className="p-1.5 rounded-lg text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-colors">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => onDelete(event.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            <button onClick={() => setExpanded(e => !e)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {expanded && (event.description || event.notes || hasPlanning) && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
            {event.description && <div className="rich-content text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: renderRichText(event.description) }} />}
            {event.notes && (
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
                <span className="font-semibold text-gray-700">Notes: </span>{event.notes}
              </div>
            )}
            {event.goal && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Goal</p>
                <p className="text-sm text-gray-700 whitespace-pre-line">{event.goal}</p>
              </div>
            )}
            {(planItems.length > 0 || event.marketing_plan) && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Marketing Plan</p>
                {event.marketing_plan && <p className="text-sm text-gray-700 whitespace-pre-line mb-2">{event.marketing_plan}</p>}
                <div className="space-y-1.5">
                  {planItems.map(item => (
                    <PlanItemRow key={item.id} item={item} canEdit={canEdit} onPush={pushPlanItem} />
                  ))}
                </div>
              </div>
            )}
            {supplies.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Supplies <span className="text-gray-400 normal-case">· {supplies.filter(s => s.checked).length}/{supplies.length} ready</span>
                  </p>
                  {canEdit && (
                    <button onClick={pushAllToOrders} disabled={orderingAll || supplies.every(s => addedOrders[s.id])}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-orange-200 bg-orange-50 text-[11px] font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50 disabled:cursor-default">
                      <ShoppingCart className="w-3.5 h-3.5" />
                      {orderingAll ? 'Adding…' : supplies.every(s => addedOrders[s.id]) ? 'All ordered ✓' : 'Order all supplies'}
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {supplies.map(s => (
                    <div key={s.id} className="flex items-center gap-2 group">
                      <input type="checkbox" checked={!!s.checked} disabled={!canEdit} onChange={() => toggleSupply(s.id)}
                        className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500 disabled:opacity-50" />
                      <span className={`flex-1 text-sm ${s.checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>{s.text}</span>
                      {canEdit && (addedOrders[s.id]
                        ? <span className="text-[11px] text-green-600 font-medium flex-shrink-0">✓ Ordered</span>
                        : <button onClick={() => addSupplyToOrder(s).catch(() => {})} className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600 hover:text-orange-700 flex-shrink-0"><ShoppingCart className="w-3 h-3" /> Order</button>
                      )}
                      {canEdit && (addedTodos[s.id]
                        ? <span className="text-[11px] text-green-600 font-medium flex-shrink-0">✓ on To-Do</span>
                        : <button onClick={() => addSupplyToTodo(s)} className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 flex-shrink-0">+ To-Do</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function EventForm({ event, month, year, onSave, onClose }) {
  const [form, setForm] = useState({
    title: event?.title || '',
    description: event?.description || '',
    event_type: event?.event_type || 'in-store',
    start_date: event?.start_date?.slice(0, 10) || '',
    end_date: event?.end_date?.slice(0, 10) || '',
    start_time: event?.start_time?.slice(0, 5) || '',
    end_time: event?.end_time?.slice(0, 5) || '',
    location: event?.location || '',
    notes: event?.notes || '',
    goal: event?.goal || '',
    marketing_plan: event?.marketing_plan || '',
    registration_url: event?.registration_url || '',
  })
  // Supplies checklist: [{ id, text, checked }]
  const [supplies, setSupplies] = useState(Array.isArray(event?.supplies) ? event.supplies : [])
  const [newSupply, setNewSupply] = useState('')
  const addSupply = () => {
    const t = newSupply.trim(); if (!t) return
    setSupplies(prev => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: t, checked: false }])
    setNewSupply('')
  }
  const toggleSupply = (id) => setSupplies(prev => prev.map(s => s.id === id ? { ...s, checked: !s.checked } : s))
  const removeSupply = (id) => setSupplies(prev => prev.filter(s => s.id !== id))
  // Marketing plan checklist: [{ id, text, pushed_to_todo }] — pushable to to-do lists
  const [planItems, setPlanItems] = useState(Array.isArray(event?.marketing_plan_items) ? event.marketing_plan_items : [])
  const [newPlan, setNewPlan] = useState('')
  const addPlan = () => {
    const t = newPlan.trim(); if (!t) return
    setPlanItems(prev => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: t, pushed_to_todo: false }])
    setNewPlan('')
  }
  const removePlan = (id) => setPlanItems(prev => prev.filter(s => s.id !== id))
  // Multi-select B2B partners: [{ id, business_name }]
  const [selectedPartners, setSelectedPartners] = useState(event?.b2b_partners || [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [contacts, setContacts] = useState([])
  const [contactsLoading, setContactsLoading] = useState(true)
  const [contactSearch, setContactSearch] = useState('')
  const [showContactList, setShowContactList] = useState(false)

  useEffect(() => {
    apiGet('/api/b2b/contacts')
      .then(setContacts)
      .catch(err => console.error('Failed to load B2B contacts:', err))
      .finally(() => setContactsLoading(false))
  }, [])

  const selectedIds = selectedPartners.map(p => p.id)
  const filteredContacts = contacts.filter(c =>
    !selectedIds.includes(c.id) &&
    c.business_name.toLowerCase().includes(contactSearch.toLowerCase())
  )

  function addPartner(c) {
    setSelectedPartners(prev => [...prev, { id: c.id, business_name: c.business_name }])
    setContactSearch('')
    setShowContactList(false)
  }

  function removePartner(id) {
    setSelectedPartners(prev => prev.filter(p => p.id !== id))
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.start_date) {
      setError('Title and start date are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = { ...form, month, year, b2b_contact_ids: selectedIds, supplies, marketing_plan_items: planItems }
      const result = event
        ? await apiPut(`/api/events/${event.id}`, payload)
        : await apiPost('/api/events', payload)
      onSave(result, !!event)
    } catch (err) {
      setError(err.message || 'Failed to save event.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title={event ? 'Edit Event' : 'Add Event'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <FormField label="Title" required>
          <input className={inputCls} value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Bring a Friend Day" />
        </FormField>

        <FormField label="Type">
          <select className={inputCls} value={form.event_type} onChange={e => set('event_type', e.target.value)}>
            {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </FormField>

        <FormField label="Description">
          <RichTextEditor value={form.description} onChange={v => set('description', v)} />
          <p className="text-xs text-gray-400 mt-1">Shown to members when they tap the event on the public calendar. Formatting supported.</p>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Start Date" required>
            <input type="date" className={inputCls} value={form.start_date} onChange={e => set('start_date', e.target.value)} />
          </FormField>
          <FormField label="End Date">
            <input type="date" className={inputCls} value={form.end_date} onChange={e => set('end_date', e.target.value)} />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Start Time">
            <input type="time" className={inputCls} value={form.start_time} onChange={e => set('start_time', e.target.value)} />
          </FormField>
          <FormField label="End Time">
            <input type="time" className={inputCls} value={form.end_time} onChange={e => set('end_time', e.target.value)} />
          </FormField>
        </div>

        <FormField label="Location">
          <input className={inputCls} value={form.location} onChange={e => set('location', e.target.value)} placeholder="e.g. Studio floor, Local park, Zoom" />
        </FormField>

        <FormField label="Registration link (optional)">
          <input className={inputCls} type="url" value={form.registration_url} onChange={e => set('registration_url', e.target.value)} placeholder="https://… — members can tap the event on the public calendar to sign up" />
        </FormField>

        <FormField label="B2B Partners (optional — add as many as needed)">
          {/* Selected partner chips */}
          {selectedPartners.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selectedPartners.map(p => (
                <span key={p.id} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 bg-orange-50 border border-orange-200 rounded-full text-xs font-semibold text-orange-800">
                  <Building2 className="w-3 h-3" />
                  {p.business_name}
                  <button type="button" onClick={() => removePartner(p.id)}
                    className="ml-0.5 text-orange-400 hover:text-orange-700 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {/* Search dropdown */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              className={`${inputCls} pl-8`}
              value={contactSearch}
              onChange={e => { setContactSearch(e.target.value); setShowContactList(true) }}
              onFocus={() => setShowContactList(true)}
              onBlur={() => setTimeout(() => setShowContactList(false), 150)}
              placeholder={selectedPartners.length ? 'Add another business…' : 'Search B2B contacts…'}
              autoComplete="off"
            />
            {showContactList && contactSearch && (
              <div className="absolute z-10 mt-1 w-full bg-white rounded-lg border border-gray-200 shadow-lg max-h-40 overflow-y-auto">
                {contactsLoading ? (
                  <p className="px-3 py-2 text-xs text-gray-400">Loading contacts…</p>
                ) : filteredContacts.length > 0 ? (
                  filteredContacts.map(c => (
                    <button key={c.id} type="button"
                      onMouseDown={() => addPartner(c)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="font-medium text-gray-800">{c.business_name}</span>
                      {c.industry && <span className="text-gray-400 text-xs">· {c.industry}</span>}
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2 text-xs text-gray-400 italic">
                    {contacts.length === 0 ? 'No B2B contacts found — add some in the B2B Outreach module first' : 'No matching contacts'}
                  </p>
                )}
              </div>
            )}
          </div>
        </FormField>

        <FormField label="Internal Notes">
          <textarea className={inputCls} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Team prep notes, what to bring, etc." />
        </FormField>

        {/* ── Planning ── */}
        <div className="pt-3 border-t border-gray-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Planning</p>

          <FormField label="Goal">
            <textarea className={inputCls} rows={2} value={form.goal} onChange={e => set('goal', e.target.value)} placeholder="What does success look like? (e.g. 15 guest passes, 5 new sign-ups)" />
          </FormField>

          <FormField label="Marketing Plan">
            <p className="text-xs text-gray-400 mb-1.5">Add each step as a checklist item — you can push any item to a teammate’s To-Do list.</p>
            <div className="space-y-1.5">
              {planItems.map(s => (
                <div key={s.id} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                  <span className="flex-1 text-sm text-gray-700">{s.text}</span>
                  <button type="button" onClick={() => removePlan(s.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  className={inputCls} value={newPlan} onChange={e => setNewPlan(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPlan() } }}
                  placeholder="Add a marketing step… (e.g. Post 3 IG stories, Email past guests)"
                />
                <button type="button" onClick={addPlan} className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 flex-shrink-0">Add</button>
              </div>
            </div>
          </FormField>

          <FormField label="Supplies">
            <div className="space-y-1.5">
              {supplies.map(s => (
                <div key={s.id} className="flex items-center gap-2">
                  <input type="checkbox" checked={!!s.checked} onChange={() => toggleSupply(s.id)} className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
                  <span className={`flex-1 text-sm ${s.checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>{s.text}</span>
                  <button type="button" onClick={() => removeSupply(s.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  className={inputCls} value={newSupply} onChange={e => setNewSupply(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSupply() } }}
                  placeholder="Add a supply item…"
                />
                <button type="button" onClick={addSupply} className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 flex-shrink-0">Add</button>
              </div>
            </div>
          </FormField>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 font-medium hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {event ? 'Save Changes' : 'Add Event'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

function EventsTab({ month, year, canEdit }) {
  const nowMonth = new Date().getMonth() + 1
  const nowYear  = new Date().getFullYear()

  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('future')
  const [filterMonth, setFilterMonth] = useState(String(nowMonth))
  const [filterYear, setFilterYear] = useState(String(nowYear))

  function switchTab(v) {
    setFilter(v)
    setFilterMonth(v === 'future' ? String(nowMonth) : 'all')
    setFilterYear(v === 'future' ? String(nowYear) : 'all')
  }
  const [ratings, setRatings] = useState({})          // keyed by event.id → feedback row
  const [ratingTarget, setRatingTarget] = useState(null)  // event being rated

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch ALL events (no month/year filter) so Past and All tabs show full history.
      // The month/year from context is only used when creating a new event.
      const [data, feedbackData] = await Promise.all([
        apiGet('/api/events'),
        apiGet('/api/feedback?item_type=event').catch(() => []),
      ])
      setEvents(data)
      const map = {}
      feedbackData.forEach(f => { map[f.item_id] = f })
      setRatings(map)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  const eventIds = events.map(e => String(e.id))
  const eventSignals = useFeedbackSignals('event', eventIds)

  useEffect(() => { load() }, [load])

  function handleSave(result, isEdit) {
    setEvents(prev => isEdit
      ? prev.map(e => e.id === result.id ? result : e)
      : [result, ...prev]
    )
    setShowForm(false)
    setEditing(null)
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this event?')) return
    await apiDelete(`/api/events/${id}`)
    setEvents(prev => prev.filter(e => e.id !== id))
  }

  // Sort soonest-first for this-month/upcoming; newest-first for past/all
  const sortedAsc  = [...events].sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
  const sortedDesc = [...events].sort((a, b) => new Date(b.start_date) - new Date(a.start_date))

  const upcoming = sortedAsc.filter(e => !isExpired(e.end_date || e.start_date))
  const past     = sortedDesc.filter(e => isExpired(e.end_date || e.start_date))

  // Unique years from all events for the year dropdown
  const availableYears = [...new Set(events.map(e => new Date(e.start_date + 'T00:00:00').getFullYear()))].sort((a, b) => b - a)

  function applyDateFilters(list) {
    return list.filter(e => {
      const d = new Date(e.start_date + 'T00:00:00')
      if (filterMonth !== 'all' && d.getMonth() + 1 !== Number(filterMonth)) return false
      if (filterYear !== 'all' && d.getFullYear() !== Number(filterYear)) return false
      return true
    })
  }

  // "This Month" uses the full list — the month filter (pre-set to current month) does the scoping
  const base = filter === 'future' ? sortedAsc : filter === 'upcoming' ? upcoming : filter === 'past' ? past : sortedDesc
  const filtered = applyDateFilters(base)

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[['future','This Month'], ['upcoming','Upcoming'], ['past','Past'], ['all','All']].map(([v, l]) => (
            <button key={v} onClick={() => switchTab(v)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${filter === v ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {l}
            </button>
          ))}
        </div>
        {canEdit && (
          <button onClick={() => { setEditing(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors">
            <Plus className="w-4 h-4" /> Add Event
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select
          value={filterMonth}
          onChange={e => setFilterMonth(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white text-gray-700 px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500"
        >
          <option value="all">All Months</option>
          {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
        <select
          value={filterYear}
          onChange={e => setFilterYear(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white text-gray-700 px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500"
        >
          <option value="all">All Years</option>
          {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {(filterMonth !== 'all' || filterYear !== 'all') && (
          <button
            onClick={() => { setFilterMonth('all'); setFilterYear('all') }}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Calendar} message={filter === 'past' ? 'No past events found.' : filter === 'future' ? 'No upcoming events this month.' : 'No events yet — add the first one!'} />
      ) : (
        <div className="space-y-3">
          {filtered.map(e => (
            <EventCard key={e.id} event={e} canEdit={canEdit}
              onEdit={ev => { setEditing(ev); setShowForm(true) }}
              onDelete={handleDelete}
              rating={ratings[e.id] || null}
              onRate={ev => setRatingTarget(ev)}
              signal={eventSignals[String(e.id)] ?? null}
            />
          ))}
        </div>
      )}

      {showForm && (
        <EventForm
          event={editing}
          month={month}
          year={year}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}

      {ratingTarget && (
        <RatingModal
          itemType="event"
          itemId={ratingTarget.id}
          itemTitle={ratingTarget.title}
          month={ratingTarget.start_date ? new Date(ratingTarget.start_date + 'T00:00:00').getMonth() + 1 : month}
          year={ratingTarget.start_date ? new Date(ratingTarget.start_date + 'T00:00:00').getFullYear() : year}
          existing={ratings[ratingTarget.id] || null}
          onSaved={result => setRatings(prev => ({ ...prev, [ratingTarget.id]: result }))}
          onClose={() => setRatingTarget(null)}
        />
      )}
    </div>
  )
}

// ─── Promotions Tab ───────────────────────────────────────────────────────────

function PromoCard({ promo, canEdit, onEdit, onDelete, rating, onRate, signal }) {
  function formatDiscount() {
    if (!promo.discount_value && promo.discount_unit !== 'free') return null
    if (promo.discount_unit === 'free') return 'Free'
    if (promo.discount_unit === '%') return `${promo.discount_value}% off`
    if (promo.discount_unit === '$') return `$${promo.discount_value} off`
    return promo.discount_value
  }

  const discountStr = formatDiscount()
  const expired = promo.end_date && isExpired(promo.end_date)
  const promoTypeMeta = PROMO_TYPES.find(p => p.value === promo.promo_type) || PROMO_TYPES[PROMO_TYPES.length - 1]

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${!promo.active || expired ? 'opacity-60' : ''}`}>
      <div className="h-1 bg-orange-500" />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">
                {promoTypeMeta.label}
              </span>
              {promo.ongoing && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                  <Repeat className="w-3 h-3" /> Ongoing
                </span>
              )}
              {!promo.active && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                  Inactive
                </span>
              )}
              {expired && promo.active && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                  Expired
                </span>
              )}
            </div>
            <h3 className="font-semibold text-gray-900 text-base">{promo.title}</h3>
            <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 flex-wrap">
              {discountStr && (
                <span className="flex items-center gap-1 font-semibold text-orange-500">
                  <Tag className="w-3.5 h-3.5" /> {discountStr}
                </span>
              )}
              {(promo.start_date || promo.end_date) && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {promo.start_date ? fmtDate(promo.start_date) : 'Open'}
                  {promo.end_date && ` – ${fmtDate(promo.end_date)}`}
                </span>
              )}
            </div>
            {promo.description && (
              <p className="text-sm text-gray-600 mt-1.5">{promo.description}</p>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <ThumbsWidget
              entityType="promo"
              entityId={promo.id}
              entityLabel={promo.title}
              initialUp={signal?.up ?? 0}
              initialNeutral={signal?.neutral ?? 0}
              initialDown={signal?.down ?? 0}
              initialMine={signal?.mine ?? null}
            />
            {expired && (
              <button
                onClick={() => onRate(promo)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${rating ? 'text-amber-600 hover:bg-amber-50' : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'}`}
                title="Rate this promotion"
              >
                <Star className="w-3.5 h-3.5" fill={rating ? '#fbbf24' : 'none'} strokeWidth={1.5} />
                {rating ? <StarDisplay rating={rating.rating} size={11} /> : <span className="hidden sm:inline">Rate</span>}
              </button>
            )}
            {canEdit && (
              <>
                <button onClick={() => onEdit(promo)} className="p-1.5 rounded-lg text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-colors">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => onDelete(promo.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PromoForm({ promo, month, year, onSave, onClose }) {
  const [form, setForm] = useState({
    title: promo?.title || '',
    description: promo?.description || '',
    promo_type: promo?.promo_type || 'discount',
    discount_value: promo?.discount_value || '',
    discount_unit: promo?.discount_unit || '%',
    start_date: promo?.start_date?.slice(0, 10) || '',
    end_date: promo?.end_date?.slice(0, 10) || '',
    ongoing: promo?.ongoing ?? false,
    active: promo?.active ?? true,
    notes: promo?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required.'); return }
    setSaving(true)
    setError('')
    try {
      const payload = { ...form, month, year }
      const result = promo
        ? await apiPut(`/api/events/promotions/${promo.id}`, payload)
        : await apiPost('/api/events/promotions', payload)
      onSave(result, !!promo)
    } catch (err) {
      setError(err.message || 'Failed to save promotion.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title={promo ? 'Edit Promotion' : 'Add Promotion'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        <FormField label="Title" required>
          <input className={inputCls} value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Summer Membership Special" />
        </FormField>

        <FormField label="Promotion Type">
          <select className={inputCls} value={form.promo_type} onChange={e => set('promo_type', e.target.value)}>
            {PROMO_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </FormField>

        <FormField label="Description">
          <textarea className={inputCls} rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="What the promotion offers" />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Discount Amount">
            <input type="number" min="0" step="0.01" className={inputCls} value={form.discount_value}
              onChange={e => set('discount_value', e.target.value)} placeholder="0" />
          </FormField>
          <FormField label="Unit">
            <select className={inputCls} value={form.discount_unit} onChange={e => set('discount_unit', e.target.value)}>
              {DISCOUNT_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Start Date">
            <input type="date" className={inputCls} value={form.start_date} onChange={e => set('start_date', e.target.value)} />
          </FormField>
          <FormField label="End Date">
            <input type="date" className={inputCls} value={form.end_date} onChange={e => set('end_date', e.target.value)} />
          </FormField>
        </div>

        <FormField label="Notes">
          <textarea className={inputCls} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Internal details or conditions" />
        </FormField>

        <div className="space-y-2 pt-1">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={form.ongoing} onChange={e => set('ongoing', e.target.checked)}
              className="w-4 h-4 rounded accent-orange-500" />
            <div>
              <span className="text-sm font-medium text-gray-800">Auto-carry each month</span>
              <p className="text-xs text-gray-500">This promotion will automatically appear in future months</p>
            </div>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)}
              className="w-4 h-4 rounded accent-orange-500" />
            <span className="text-sm font-medium text-gray-800">Active</span>
          </label>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 font-medium hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {promo ? 'Save Changes' : 'Add Promotion'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function PromosTab({ month, year, canEdit }) {
  const nowMonth = new Date().getMonth() + 1
  const nowYear  = new Date().getFullYear()

  const [promos, setPromos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('future')
  const [filterMonth, setFilterMonth] = useState(String(nowMonth))
  const [filterYear, setFilterYear] = useState(String(nowYear))

  function switchTab(v) {
    setFilter(v)
    setFilterMonth(v === 'future' ? String(nowMonth) : 'all')
    setFilterYear(v === 'future' ? String(nowYear) : 'all')
  }
  const [ratings, setRatings] = useState({})
  const [ratingTarget, setRatingTarget] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch ALL promotions (no month/year filter) so inactive/past promos are visible.
      // month/year from context is only used when creating a new promo.
      const [data, feedbackData] = await Promise.all([
        apiGet('/api/events/promotions'),
        apiGet('/api/feedback?item_type=promo').catch(() => []),
      ])
      setPromos(data)
      const map = {}
      feedbackData.forEach(f => { map[f.item_id] = f })
      setRatings(map)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const promoIds = promos.map(p => String(p.id))
  const promoSignals = useFeedbackSignals('promo', promoIds)

  function handleSave(result, isEdit) {
    setPromos(prev => isEdit
      ? prev.map(p => p.id === result.id ? result : p)
      : [result, ...prev]
    )
    setShowForm(false)
    setEditing(null)
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this promotion?')) return
    await apiDelete(`/api/events/promotions/${id}`)
    setPromos(prev => prev.filter(p => p.id !== id))
  }

  // Sort newest to oldest by start_date (fall back to created_at)
  const sorted = [...promos].sort((a, b) => {
    const da = a.start_date || a.created_at || ''
    const db = b.start_date || b.created_at || ''
    return new Date(db) - new Date(da)
  })
  const sortedAsc  = [...promos].sort((a, b) => new Date(a.start_date || a.created_at) - new Date(b.start_date || b.created_at))
  const sortedDesc = [...promos].sort((a, b) => new Date(b.start_date || b.created_at) - new Date(a.start_date || a.created_at))

  const activePromos   = sortedDesc.filter(p => p.active && !isExpired(p.end_date))
  const inactivePromos = sortedDesc.filter(p => !p.active || isExpired(p.end_date))

  // "This Month" uses the full list — the month filter (pre-set to current month) does the scoping
  const base = filter === 'future' ? sortedAsc
    : filter === 'active' ? activePromos
    : filter === 'inactive' ? inactivePromos
    : sortedDesc

  // Available years from all promos
  const promoYears = [...new Set(sortedDesc.map(p => {
    const d = p.start_date || p.created_at
    return d ? new Date(d).getFullYear() : null
  }).filter(Boolean))].sort((a, b) => b - a)

  const filtered = base.filter(p => {
    const d = p.start_date || p.created_at
    if (!d) return true
    // Use T12:00:00 to avoid UTC-to-local date shift on date-only strings
    const date = new Date(d.length === 10 ? d + 'T12:00:00' : d)
    if (filterMonth !== 'all' && date.getMonth() + 1 !== Number(filterMonth)) return false
    if (filterYear !== 'all' && date.getFullYear() !== Number(filterYear)) return false
    return true
  })

  const ongoingCount = promos.filter(p => p.ongoing && p.active).length

  return (
    <div>
      {ongoingCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm mb-4">
          <Repeat className="w-4 h-4 flex-shrink-0" />
          <span><strong>{ongoingCount} ongoing</strong> promotion{ongoingCount !== 1 ? 's' : ''} auto-carry to every month.</span>
        </div>
      )}

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[['future','This Month'], ['active','Active'], ['inactive','Inactive'], ['all','All']].map(([v, l]) => (
            <button key={v} onClick={() => switchTab(v)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${filter === v ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {l}
            </button>
          ))}
        </div>
        {canEdit && (
          <button onClick={() => { setEditing(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors">
            <Plus className="w-4 h-4" /> Add Promotion
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select
          value={filterMonth}
          onChange={e => setFilterMonth(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white text-gray-700 px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500"
        >
          <option value="all">All Months</option>
          {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
        <select
          value={filterYear}
          onChange={e => setFilterYear(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white text-gray-700 px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500"
        >
          <option value="all">All Years</option>
          {promoYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {(filterMonth !== 'all' || filterYear !== 'all') && (
          <button
            onClick={() => { setFilterMonth('all'); setFilterYear('all') }}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Gift} message={filter === 'future' ? 'No upcoming promotions this month.' : filter === 'inactive' ? 'No inactive promotions.' : 'No promotions here yet.'} />
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <PromoCard key={p.id} promo={p} canEdit={canEdit}
              onEdit={pr => { setEditing(pr); setShowForm(true) }}
              onDelete={handleDelete}
              rating={ratings[p.id] || null}
              onRate={pr => setRatingTarget(pr)}
              signal={promoSignals[String(p.id)] ?? null}
            />
          ))}
        </div>
      )}

      {showForm && (
        <PromoForm
          promo={editing}
          month={month}
          year={year}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}

      {ratingTarget && (
        <RatingModal
          itemType="promo"
          itemId={ratingTarget.id}
          itemTitle={ratingTarget.title}
          month={ratingTarget.start_date ? new Date(ratingTarget.start_date + 'T00:00:00').getMonth() + 1 : month}
          year={ratingTarget.start_date ? new Date(ratingTarget.start_date + 'T00:00:00').getFullYear() : year}
          existing={ratings[ratingTarget.id] || null}
          onSaved={result => setRatings(prev => ({ ...prev, [ratingTarget.id]: result }))}
          onClose={() => setRatingTarget(null)}
        />
      )}
    </div>
  )
}

// ─── B2B Discounts Tab ────────────────────────────────────────────────────────

function B2bDiscountsTab() {
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiGet('/api/events/b2b-discounts')
      .then(setPartners)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 border border-orange-200 text-orange-800 text-sm mb-4">
        <Building2 className="w-4 h-4 flex-shrink-0" />
        <span>These are B2B contacts with active partner discounts. Manage them in the <strong>B2B Outreach</strong> module.</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        </div>
      ) : partners.length === 0 ? (
        <EmptyState icon={Building2} message="No partner discounts set up yet. Add a discount in the B2B Outreach module." />
      ) : (
        <div className="space-y-3">
          {partners.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="h-1 bg-orange-500" />
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{p.business_name}</h3>
                      {p.ongoing && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                          <Repeat className="w-3 h-3" /> Ongoing
                        </span>
                      )}
                    </div>
                    {p.contact_name && (
                      <p className="text-xs text-gray-500 mb-2">{p.contact_name} · {p.industry}</p>
                    )}
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 border border-orange-200">
                      <Tag className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-sm font-semibold text-orange-800">{p.discount_desc}</span>
                    </div>
                  </div>
                  <div className="text-right space-y-1 text-xs text-gray-500 flex-shrink-0">
                    {p.phone && (
                      <div className="flex items-center gap-1 justify-end">
                        <Phone className="w-3 h-3" /> {p.phone}
                      </div>
                    )}
                    {p.email && (
                      <div className="flex items-center gap-1 justify-end">
                        <Mail className="w-3 h-3" /> {p.email}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page Root ────────────────────────────────────────────────────────────────

function ShareCalendarButton() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const studioId = typeof localStorage !== 'undefined' ? localStorage.getItem('selectedStudioId') : null
  const url = studioId ? `${window.location.origin}/calendar/${studioId}` : ''
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(url)}`

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={!studioId}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-brand-red text-white hover:opacity-90 disabled:opacity-50"
      >
        <Share2 className="w-4 h-4" /> Share calendar
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900">Public Calendar</h2>
            <p className="text-sm text-gray-500 mt-1">Anyone with this link or QR code can view the studio’s monthly events. No login required.</p>
            <img src={qr} alt="Calendar QR code" className="mx-auto my-4 rounded-lg border border-gray-200" width={220} height={220} />
            <div className="flex items-center gap-2">
              <input readOnly value={url} className="flex-1 text-xs px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 truncate" />
              <button onClick={copy} className="px-3 py-2 text-sm font-medium rounded-lg bg-gray-900 text-white hover:opacity-90 whitespace-nowrap">
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="flex gap-2 mt-4">
              <a href={url} target="_blank" rel="noreferrer" className="flex-1 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Open</a>
              <a href={qr} download="hotworx-calendar-qr.png" className="flex-1 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Download QR</a>
            </div>
            <button onClick={() => setOpen(false)} className="mt-4 text-sm text-gray-400 hover:text-gray-600">Close</button>
          </div>
        </div>
      )}
    </>
  )
}

export default function EventsPage() {
  const { role, isOwnerOrManager } = useRole()
  const { selectedMonth, isCurrentMonth } = useMonth()
  const month = selectedMonth.month
  const year = selectedMonth.year
  // Owner + manager can edit any month; TSAs are read-only
  const canEdit = isOwnerOrManager
  const [activeTab, setActiveTab] = useState('events')

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Events &amp; Promotions</h1>
          <p className="text-sm text-gray-500 mt-0.5">Studio events, active offers, and partner discounts</p>
        </div>
      </div>

      <PageTabs active={activeTab} onChange={setActiveTab} />

      {activeTab === 'events' && (
        <EventsTab month={month} year={year} canEdit={canEdit} />
      )}
      {activeTab === 'promos' && (
        <PromosTab month={month} year={year} canEdit={canEdit} />
      )}
      {activeTab === 'discounts' && (
        <B2bDiscountsTab />
      )}
      {activeTab === 'calendar' && (
        <PublicCalendarTab />
      )}
    </div>
  )
}

function PublicCalendarTab() {
  const studioId = typeof localStorage !== 'undefined' ? localStorage.getItem('selectedStudioId') : null
  return (
    <div>
      <div className="flex items-start justify-between mb-4 gap-4">
        <p className="text-sm text-gray-500">
          This is the public, no-login calendar your members see from the QR code or shared link.
          It shows the current month’s events and the Business of the Month, and excludes team-only events.
        </p>
        <ShareCalendarButton />
      </div>
      <CalendarView studioId={studioId} embedded />
    </div>
  )
}
