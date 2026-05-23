import { useState, useEffect, useCallback, useRef } from 'react'
import { useRole } from '@/hooks/useRole'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { supabase } from '@/lib/supabase'
import {
  Plus, X, Phone, Mail, MapPin, Building2, Tag,
  MessageSquare, ChevronDown, ChevronUp, Edit2, Trash2, Clock,
  PhoneCall, AtSign, Users, Handshake, AlertCircle,
  Gift, Globe, ImagePlus, Loader2, Calendar,
} from 'lucide-react'

// ─── Brand-safe status config (no green) ─────────────────────────────────────
const STATUSES = [
  { value: 'new_lead',          label: 'New Lead',          bg: 'bg-blue-100',          text: 'text-blue-800',          border: 'border-blue-300' },
  { value: 'contacted',         label: 'Contacted',         bg: 'bg-yellow-100',        text: 'text-yellow-800',        border: 'border-yellow-300' },
  { value: 'meeting_scheduled', label: 'Meeting Scheduled', bg: 'bg-purple-100',        text: 'text-purple-800',        border: 'border-purple-300' },
  { value: 'active_partner',    label: 'Active Partner',    bg: 'bg-orange-100',        text: 'text-orange-800',        border: 'border-orange-300' },
  { value: 'follow_up',         label: 'Follow Up',         bg: 'bg-red-100',           text: 'text-red-800',           border: 'border-red-300' },
  { value: 'not_interested',    label: 'Not Interested',    bg: 'bg-gray-100',          text: 'text-gray-600',          border: 'border-gray-300' },
]

const INTERACTION_TYPES = [
  { value: 'call',    label: 'Call',    icon: PhoneCall },
  { value: 'email',   label: 'Email',   icon: AtSign },
  { value: 'visit',   label: 'Visit',   icon: MapPin },
  { value: 'meeting', label: 'Meeting', icon: Users },
  { value: 'other',   label: 'Other',   icon: MessageSquare },
]

const INDUSTRIES = [
  'Apartments', 'Chiropractic', 'Corporate / Office', 'Gym / Fitness', 'Healthcare',
  'Massage', 'Neighborhood / HOA', 'Nutrition / Wellness', 'Physical Therapy',
  'Real Estate', 'Restaurant', 'Retail', 'Salon / Spa', 'Sports / Athletics',
  'Yoga / Pilates', 'Other',
]

function statusMeta(val) {
  return STATUSES.find(s => s.value === val) || STATUSES[0]
}

function StatusBadge({ status }) {
  const m = statusMeta(status)
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${m.bg} ${m.text} ${m.border}`}>
      {m.label}
    </span>
  )
}

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const inputCls = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500'
const labelCls = 'block text-xs font-semibold text-gray-700 mb-1'

const blankForm = {
  business_name: '', contact_name: '', phone: '', email: '', address: '',
  industry: '', website: '', social_handle: '', logo_url: '',
  status: 'new_lead', discount_desc: '', discount_ongoing: false,
  next_action: '', next_action_date: '', notes: '', assigned_to: '',
}

// ─── Contact Modal ────────────────────────────────────────────────────────────
function ContactModal({ contact, users, onSave, onClose }) {
  const [form, setForm] = useState(contact ? {
    business_name:    contact.business_name || '',
    contact_name:     contact.contact_name || '',
    phone:            contact.phone || '',
    email:            contact.email || '',
    address:          contact.address || '',
    industry:         contact.industry || '',
    website:          contact.website || '',
    social_handle:    contact.social_handle || '',
    logo_url:         contact.logo_url || '',
    status:           contact.status || 'new_lead',
    discount_desc:    contact.discount_desc || '',
    discount_ongoing: contact.discount_ongoing || false,
    next_action:      contact.next_action || '',
    next_action_date: contact.next_action_date || '',
    notes:            contact.notes || '',
    assigned_to:      contact.assigned_to || '',
  } : { ...blankForm })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const logoInputRef = useRef(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['jpg', 'jpeg', 'png', 'webp', 'svg'].includes(ext)) { setError('Logo must be JPG, PNG, WebP, or SVG'); return }
    setUploading(true); setError('')
    try {
      const path = `logos/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage.from('b2b-logos').upload(path, file, { upsert: false, contentType: file.type })
      if (upErr) { setError(upErr.message); return }
      const { data: { publicUrl } } = supabase.storage.from('b2b-logos').getPublicUrl(path)
      set('logo_url', publicUrl)
    } finally { setUploading(false); e.target.value = '' }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.business_name.trim()) { setError('Business name is required'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form, assigned_to: form.assigned_to || null, next_action_date: form.next_action_date || null, website: form.website || null, social_handle: form.social_handle || null, logo_url: form.logo_url || null }
      const saved = contact?.id ? await apiPut(`/api/b2b/contacts/${contact.id}`, payload) : await apiPost('/api/b2b/contacts', payload)
      onSave(saved)
    } catch (err) { setError(err.message || 'Save failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200"
        onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-800 rounded-t-xl">
          <h2 className="text-white font-bold text-lg">{contact ? 'Edit Contact' : 'Add B2B Contact'}</h2>
          <button type="button" onClick={onClose} className="text-gray-300 hover:text-white"><X size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {error && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

          {/* Logo */}
          <div>
            <label className={labelCls}>Logo</label>
            <div className="flex items-center gap-4">
              {form.logo_url
                ? <img src={form.logo_url} alt="Logo" className="w-16 h-16 rounded-xl object-contain bg-gray-50 p-1 border border-gray-200 flex-shrink-0" />
                : <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 flex-shrink-0"><Building2 size={22} className="text-gray-400" /></div>
              }
              <div className="space-y-1">
                <button type="button" onClick={() => logoInputRef.current?.click()} disabled={uploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white rounded-lg transition-colors disabled:opacity-50">
                  {uploading ? <><Loader2 size={12} className="animate-spin" /> Uploading…</> : <><ImagePlus size={12} /> {form.logo_url ? 'Change Logo' : 'Upload Logo'}</>}
                </button>
                {form.logo_url && <button type="button" onClick={() => set('logo_url', '')} className="block text-xs text-gray-400 hover:text-red-500 transition-colors">Remove</button>}
                <p className="text-xs text-gray-400">PNG, JPG, WebP, SVG</p>
              </div>
              <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleLogoChange} />
            </div>
          </div>

          {/* Business info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Business Name *</label>
              <input className={inputCls} value={form.business_name} onChange={e => set('business_name', e.target.value)} placeholder="Acme Chiropractic" />
            </div>
            <div><label className={labelCls}>Contact Name</label><input className={inputCls} value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="Jane Smith" /></div>
            <div>
              <label className={labelCls}>Industry</label>
              <select className={inputCls} value={form.industry} onChange={e => set('industry', e.target.value)}>
                <option value="">Select industry…</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>Phone</label><input className={inputCls} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(262) 555-0100" /></div>
            <div><label className={labelCls}>Email</label><input type="email" className={inputCls} value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@acme.com" /></div>
            <div className="col-span-2"><label className={labelCls}>Address</label><input className={inputCls} value={form.address} onChange={e => set('address', e.target.value)} placeholder="123 Main St, Pewaukee, WI" /></div>
            <div><label className={labelCls}>Website</label><input className={inputCls} value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://acmechiro.com" /></div>
            <div><label className={labelCls}>Social Media Handle</label><input className={inputCls} value={form.social_handle} onChange={e => set('social_handle', e.target.value)} placeholder="@acmechiro" /></div>
          </div>

          {/* Status + Assignment */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Status</label>
              <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Assigned To</label>
              <select className={inputCls} value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>

          {/* Discount partner */}
          <div className="border border-orange-500/40 bg-orange-50 rounded-lg p-4 space-y-3">
            <p className="text-sm font-bold text-orange-500 flex items-center gap-1.5"><Gift size={14} /> Discount Partner</p>
            <div><label className={labelCls}>Discount Description</label><input className={inputCls} value={form.discount_desc} onChange={e => set('discount_desc', e.target.value)} placeholder="e.g. 20% off memberships for employees" /></div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.discount_ongoing} onChange={e => set('discount_ongoing', e.target.checked)} className="accent-orange-500 w-4 h-4" />
              <span className="text-sm text-gray-700 font-medium">Auto-carry this discount each month</span>
            </label>
          </div>

          {/* Next action */}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Next Action</label><input className={inputCls} value={form.next_action} onChange={e => set('next_action', e.target.value)} placeholder="Follow up by phone" /></div>
            <div><label className={labelCls}>Due Date</label><input type="date" className={inputCls} value={form.next_action_date} onChange={e => set('next_action_date', e.target.value)} /></div>
          </div>

          <div><label className={labelCls}>Notes</label><textarea rows={3} className={`${inputCls} resize-none`} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Additional context…" /></div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors">Cancel</button>
          <button type="submit" disabled={saving} className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : contact ? 'Save Changes' : 'Add Contact'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Log Interaction Modal ────────────────────────────────────────────────────
function LogInteractionModal({ contact, onSave, onClose }) {
  const [type, setType] = useState('call')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true)
    try { const saved = await apiPost(`/api/b2b/contacts/${contact.id}/interactions`, { type, notes }); onSave(saved) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form className="bg-white rounded-xl w-full max-w-md shadow-2xl border border-gray-200" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-800 rounded-t-xl">
          <h2 className="text-white font-bold">Log Interaction</h2>
          <button type="button" onClick={onClose} className="text-gray-300 hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Contact</p>
            <p className="text-gray-900 font-bold">{contact.business_name}</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">Type</label>
            <div className="flex gap-2 flex-wrap">
              {INTERACTION_TYPES.map(({ value, label, icon: Icon }) => (
                <button key={value} type="button" onClick={() => setType(value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    type === value ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-300 text-gray-600 hover:border-orange-500 hover:text-orange-500'
                  }`}>
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
            <textarea rows={3} className={`${inputCls} resize-none`} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What happened? Any next steps?" />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium">Cancel</button>
          <button type="submit" disabled={saving} className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg disabled:opacity-50">
            {saving ? 'Logging…' : 'Log Interaction'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Contact Card ─────────────────────────────────────────────────────────────
function ContactCard({ contact, users, isOwnerOrManager, onEdit, onDelete, onLogInteraction }) {
  const [expanded, setExpanded] = useState(false)
  const [interactions, setInteractions] = useState(null)
  const [linkedEvents, setLinkedEvents] = useState(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const assignedUser = users.find(u => u.id === contact.assigned_to)
  const isDue = contact.next_action_date && new Date(contact.next_action_date + 'T00:00:00') <= new Date()

  const loadInteractions = useCallback(async () => {
    if (interactions !== null) return
    setLoadingHistory(true)
    try {
      const [iData, eData] = await Promise.all([
        apiGet(`/api/b2b/contacts/${contact.id}/interactions`),
        apiGet(`/api/b2b/contacts/${contact.id}/events`),
      ])
      setInteractions(iData)
      setLinkedEvents(eData)
    } finally { setLoadingHistory(false) }
  }, [contact.id, interactions])

  const handleExpand = () => { const next = !expanded; setExpanded(next); if (next) loadInteractions() }

  const handleInteractionLogged = (i) => {
    setInteractions(prev => prev ? [i, ...prev] : [i])
    onLogInteraction()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Orange top bar */}
      <div className="h-1 bg-orange-500" />

      <div className="p-4">
        {/* Logo + name */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {contact.logo_url
              ? <img src={contact.logo_url} alt={contact.business_name} className="w-11 h-11 rounded-lg object-contain bg-gray-50 p-0.5 border border-gray-200 flex-shrink-0" />
              : <div className="w-11 h-11 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center flex-shrink-0"><Building2 size={18} className="text-orange-500" /></div>
            }
            <div className="min-w-0">
              <h3 className="text-gray-900 font-bold text-sm leading-tight">{contact.business_name}</h3>
              {contact.contact_name && <p className="text-gray-600 text-xs mt-0.5">{contact.contact_name}</p>}
              {contact.industry && <p className="text-gray-400 text-xs">{contact.industry}</p>}
            </div>
          </div>

          {isOwnerOrManager && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => onLogInteraction(contact, handleInteractionLogged)} title="Log interaction"
                className="p-1.5 text-gray-400 hover:text-orange-500 rounded-lg transition-colors">
                <MessageSquare size={14} />
              </button>
              <button onClick={() => onEdit(contact)} title="Edit"
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg transition-colors">
                <Edit2 size={14} />
              </button>
              {confirmDelete ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => onDelete(contact.id)} className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded font-semibold">Delete</button>
                  <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs">No</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} title="Delete"
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition-colors">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Status + partner badge */}
        <div className="flex items-center gap-2 flex-wrap mt-3">
          <StatusBadge status={contact.status} />
          {contact.discount_ongoing && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 border border-orange-300 rounded-full text-xs font-semibold text-orange-800">
              <Gift size={10} /> Partner
            </span>
          )}
        </div>

        {/* Contact details */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="flex items-center gap-1 text-xs text-gray-600 hover:text-orange-500 transition-colors font-medium">
              <Phone size={11} /> {contact.phone}
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-1 text-xs text-gray-600 hover:text-orange-500 transition-colors truncate max-w-[200px]">
              <Mail size={11} /> {contact.email}
            </a>
          )}
          {contact.website && (
            <a href={contact.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-gray-600 hover:text-orange-500 transition-colors truncate max-w-[180px]">
              <Globe size={11} /> {contact.website.replace(/^https?:\/\//, '')}
            </a>
          )}
          {contact.social_handle && (
            <span className="flex items-center gap-1 text-xs text-gray-500"><AtSign size={11} /> {contact.social_handle}</span>
          )}
          {assignedUser && (
            <span className="flex items-center gap-1 text-xs text-gray-400"><Tag size={11} /> {assignedUser.name}</span>
          )}
        </div>

        {/* Next action */}
        {contact.next_action && (
          <div className={`mt-3 flex items-start gap-1.5 text-xs rounded-lg px-2.5 py-2 border ${
            isDue ? 'bg-red-50 border-red-200 text-red-700' : 'bg-orange-50 border-orange-200 text-gray-700'
          }`}>
            {isDue ? <AlertCircle size={12} className="mt-0.5 flex-shrink-0 text-red-500" /> : <Clock size={12} className="mt-0.5 flex-shrink-0 text-orange-500" />}
            <span><span className="font-semibold">{contact.next_action}</span>{contact.next_action_date && <span className="ml-1.5 text-gray-500">— {fmtDate(contact.next_action_date)}</span>}</span>
          </div>
        )}

        {/* Discount */}
        {contact.discount_desc && (
          <div className="mt-2.5 flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1.5">
            <Gift size={11} className="text-orange-500 flex-shrink-0" />
            <p className="text-orange-800 text-xs font-medium">{contact.discount_desc}</p>
          </div>
        )}
      </div>

      {/* History toggle */}
      <button onClick={handleExpand}
        className="w-full flex items-center justify-between px-4 py-2.5 border-t border-gray-100 text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors">
        <span>{expanded ? 'Hide' : 'Show'} interaction history</span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-1 border-t border-gray-100 bg-gray-50">
          {loadingHistory ? (
            <p className="text-xs text-gray-400 py-3">Loading…</p>
          ) : interactions?.length ? (
            interactions.map(i => {
              const meta = INTERACTION_TYPES.find(t => t.value === i.type) || INTERACTION_TYPES[4]
              const Icon = meta.icon
              return (
                <div key={i.id} className="flex items-start gap-2.5 pt-3">
                  <div className="w-7 h-7 rounded-full bg-orange-100 border border-orange-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon size={12} className="text-orange-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-800 font-semibold">
                      <span className="capitalize">{i.type}</span>
                      <span className="text-gray-500 font-normal ml-1">by {i.logged_by_name}</span>
                      <span className="text-gray-400 ml-1.5">{fmtDateTime(i.logged_at)}</span>
                    </p>
                    {i.notes && <p className="text-xs text-gray-600 mt-0.5">{i.notes}</p>}
                  </div>
                </div>
              )
            })
          ) : (
            <p className="text-xs text-gray-400 pt-3 italic">No interactions logged yet.</p>
          )}

          {/* Linked events */}
          {linkedEvents?.length > 0 && (
            <div className="pt-3 mt-1 border-t border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Linked Events</p>
              {linkedEvents.map(ev => (
                <div key={ev.id} className="flex items-start gap-2.5 pt-2">
                  <div className="w-7 h-7 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Calendar size={12} className="text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800">{ev.title}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(ev.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {ev.location && ` · ${ev.location}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Pipeline Tab ─────────────────────────────────────────────────────────────
function PipelineTab({ contacts, users, isOwnerOrManager, onEdit, onDelete }) {
  const [logTarget, setLogTarget] = useState(null)
  const handleLogOpen = (contact, callback) => setLogTarget({ contact, callback })
  const handleInteractionSaved = (i) => { if (logTarget?.callback) logTarget.callback(i); setLogTarget(null) }

  const groups = STATUSES.map(s => ({ ...s, items: contacts.filter(c => c.status === s.value) })).filter(g => g.items.length > 0)

  return (
    <>
      <div className="space-y-8">
        {groups.length === 0 ? (
          <div className="text-center py-24">
            <Building2 size={48} className="mx-auto mb-4 text-gray-300" />
            <p className="text-gray-700 font-semibold">No contacts yet.</p>
            <p className="text-gray-400 text-sm mt-1">Add your first B2B lead to get started.</p>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.value}>
              <div className="flex items-center gap-2.5 mb-3">
                <StatusBadge status={group.value} />
                <span className="text-gray-500 text-sm">{group.items.length} contact{group.items.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {group.items.map(c => (
                  <ContactCard key={c.id} contact={c} users={users} isOwnerOrManager={isOwnerOrManager}
                    onEdit={onEdit} onDelete={onDelete} onLogInteraction={handleLogOpen} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      {logTarget && <LogInteractionModal contact={logTarget.contact} onSave={handleInteractionSaved} onClose={() => setLogTarget(null)} />}
    </>
  )
}

// ─── Discounts Tab ────────────────────────────────────────────────────────────
function DiscountsTab({ contacts, isOwnerOrManager, onEdit }) {
  const partners = contacts.filter(c => c.discount_desc || c.discount_ongoing)

  return (
    <div>
      <p className="text-gray-600 text-sm mb-5">
        Partners who offer discounts to HOTWORX members — check "Auto-carry" on a contact to include it here each month.
      </p>
      {partners.length === 0 ? (
        <div className="text-center py-20">
          <Gift size={44} className="mx-auto mb-4 text-gray-300" />
          <p className="text-gray-700 font-semibold">No discount partners yet.</p>
          <p className="text-gray-400 text-sm mt-1">Mark contacts as Active Partners and add a discount description.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {partners.map(c => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="h-1 bg-orange-500" />
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {c.logo_url
                      ? <img src={c.logo_url} alt={c.business_name} className="w-10 h-10 rounded-lg object-contain bg-gray-50 p-0.5 border border-gray-200 flex-shrink-0" />
                      : <div className="w-10 h-10 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center flex-shrink-0"><Building2 size={16} className="text-orange-500" /></div>
                    }
                    <div>
                      <p className="text-gray-900 font-bold text-sm">{c.business_name}</p>
                      {c.contact_name && <p className="text-gray-600 text-xs">{c.contact_name}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {c.discount_ongoing && (
                      <span className="text-xs font-bold text-orange-500 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">Auto</span>
                    )}
                    {isOwnerOrManager && (
                      <button onClick={() => onEdit(c)} className="p-1 text-gray-400 hover:text-gray-700 rounded transition-colors"><Edit2 size={13} /></button>
                    )}
                  </div>
                </div>
                {c.discount_desc && (
                  <div className="mt-3 flex items-start gap-1.5 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                    <Gift size={12} className="text-orange-500 mt-0.5 flex-shrink-0" />
                    <p className="text-orange-900 text-xs font-medium">{c.discount_desc}</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-3 mt-3">
                  {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-xs text-gray-600 hover:text-orange-500 transition-colors font-medium"><Phone size={11} /> {c.phone}</a>}
                  {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-xs text-gray-600 hover:text-orange-500 transition-colors"><Mail size={11} /> {c.email}</a>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function B2bPage() {
  const { role } = useRole()
  const isOwnerOrManager = role === 'owner' || role === 'manager'

  const [tab, setTab] = useState('pipeline')
  const [contacts, setContacts] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalContact, setModalContact] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [industryFilter, setIndustryFilter] = useState('')

  const load = useCallback(async () => {
    try {
      const [cd, ud] = await Promise.all([apiGet('/api/b2b/contacts'), apiGet('/api/users')])
      setContacts(cd)
      setUsers(ud.map(u => ({ id: u.id, name: u.full_name || u.email })))
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = (saved) => {
    setContacts(prev => {
      const idx = prev.findIndex(c => c.id === saved.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next }
      return [saved, ...prev]
    })
    setModalContact(null)
  }

  const handleDelete = async (id) => {
    await apiDelete(`/api/b2b/contacts/${id}`)
    setContacts(prev => prev.filter(c => c.id !== id))
  }

  const filtered = contacts.filter(c => {
    const q = searchQuery.toLowerCase()
    const matchSearch = !q || [c.business_name, c.contact_name, c.email, c.industry].some(f => f?.toLowerCase().includes(q))
    const matchStatus = !statusFilter || c.status === statusFilter
    const matchIndustry = !industryFilter || c.industry === industryFilter
    return matchSearch && matchStatus && matchIndustry
  })

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <Handshake size={24} className="text-orange-500" /> B2B Outreach
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            <span className="text-gray-900 font-semibold">{contacts.length}</span> contact{contacts.length !== 1 ? 's' : ''}
            <span className="mx-1.5 text-gray-300">·</span>
            <span className="text-orange-500 font-semibold">{contacts.filter(c => c.status === 'active_partner').length}</span> active partners
          </p>
        </div>
        {isOwnerOrManager && (
          <button onClick={() => setModalContact(false)}
            className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg transition-colors shadow-sm">
            <Plus size={16} /> Add Contact
          </button>
        )}
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-300 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {[{ key: 'pipeline', label: 'Pipeline' }, { key: 'discounts', label: 'Discount Partners' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-orange-500 text-orange-500' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Search + filter */}
      {tab === 'pipeline' && (
        <div className="flex gap-3 mb-6 flex-wrap">
          <input
            className="flex-1 min-w-48 bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            placeholder="Search by name, industry, email…"
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          />
          <select
            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-orange-500"
            value={industryFilter} onChange={e => setIndustryFilter(e.target.value)}>
            <option value="">All types</option>
            {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
          <select
            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-orange-500"
            value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      )}

      {tab === 'pipeline'
        ? <PipelineTab contacts={filtered} users={users} isOwnerOrManager={isOwnerOrManager} onEdit={setModalContact} onDelete={handleDelete} />
        : <DiscountsTab contacts={contacts} isOwnerOrManager={isOwnerOrManager} onEdit={setModalContact} />
      }

      {modalContact !== null && (
        <ContactModal contact={modalContact || null} users={users} onSave={handleSave} onClose={() => setModalContact(null)} />
      )}
    </div>
  )
}
