import { useState, useEffect, useCallback } from 'react'
import { useRole } from '@/hooks/useRole'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { useMonth } from '@/contexts/MonthContext'
import {
  Plus, X, Edit2, Trash2, Calendar, Tag, Repeat,
  Gift, MapPin, Clock, ChevronDown, ChevronUp,
  AlertCircle, Loader2, Building2, Phone, Mail, Search,
} from 'lucide-react'

// ─── Constants ───────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  { value: 'in-store',    label: 'In-Store',    color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'community',   label: 'Community',   color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'corporate',   label: 'Corporate',   color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { value: 'partnership', label: 'Partnership', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { value: 'online',      label: 'Online',      color: 'bg-sky-100 text-sky-800 border-sky-300' },
  { value: 'other',       label: 'Other',       color: 'bg-gray-100 text-gray-700 border-gray-300' },
]

const PROMO_TYPES = [
  { value: 'discount',     label: 'Discount' },
  { value: 'free_session', label: 'Free Session' },
  { value: 'referral',     label: 'Referral' },
  { value: 'flash_sale',   label: 'Flash Sale' },
  { value: 'bundle',       label: 'Bundle' },
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

function EventCard({ event, canEdit, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const meta = eventTypeMeta(event.event_type)
  const past = isExpired(event.end_date || event.start_date)

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

        {expanded && (event.description || event.notes) && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
            {event.description && <p className="text-sm text-gray-700">{event.description}</p>}
            {event.notes && (
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
                <span className="font-semibold text-gray-700">Notes: </span>{event.notes}
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
  })
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
      const payload = { ...form, month, year, b2b_contact_ids: selectedIds }
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
          <textarea className={inputCls} rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief description for the team" />
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
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('upcoming')
  const [filterMonth, setFilterMonth] = useState('all')
  const [filterYear, setFilterYear] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet(`/api/events?month=${month}&year=${year}`)
      setEvents(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [month, year])

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

  // Sort newest to oldest by start_date
  const sorted = [...events].sort((a, b) => new Date(b.start_date) - new Date(a.start_date))
  const upcoming = sorted.filter(e => !isExpired(e.end_date || e.start_date))
  const past = sorted.filter(e => isExpired(e.end_date || e.start_date))

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

  const showDateFilters = filter === 'past' || filter === 'all'
  const base = filter === 'upcoming' ? upcoming : filter === 'past' ? past : sorted
  const filtered = showDateFilters ? applyDateFilters(base) : base

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[['upcoming','Upcoming'], ['past','Past'], ['all','All']].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
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

      {showDateFilters && (
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
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Calendar} message={filter === 'past' ? 'No past events found.' : 'No events yet — add the first one!'} />
      ) : (
        <div className="space-y-3">
          {filtered.map(e => (
            <EventCard key={e.id} event={e} canEdit={canEdit}
              onEdit={ev => { setEditing(ev); setShowForm(true) }}
              onDelete={handleDelete} />
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
    </div>
  )
}

// ─── Promotions Tab ───────────────────────────────────────────────────────────

function PromoCard({ promo, canEdit, onEdit, onDelete }) {
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

          {canEdit && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => onEdit(promo)} className="p-1.5 rounded-lg text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-colors">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={() => onDelete(promo.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
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
  const [promos, setPromos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('active')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet(`/api/events/promotions?month=${month}&year=${year}`)
      setPromos(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { load() }, [load])

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
  const activePromos = sorted.filter(p => p.active && !isExpired(p.end_date))
  const inactivePromos = sorted.filter(p => !p.active || isExpired(p.end_date))

  const filtered = filter === 'active' ? activePromos
    : filter === 'inactive' ? inactivePromos
    : sorted

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
          {[['active','Active'], ['inactive','Inactive'], ['all','All']].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
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

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Gift} message="No promotions here yet." />
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <PromoCard key={p.id} promo={p} canEdit={canEdit}
              onEdit={pr => { setEditing(pr); setShowForm(true) }}
              onDelete={handleDelete} />
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
    </div>
  )
}
