import { useState, useEffect, useCallback, useRef } from 'react'
import { useRole } from '@/hooks/useRole'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { supabase } from '@/lib/supabase'
import ThumbsWidget, { useFeedbackSignals } from '@/components/ThumbsWidget'
import MapTab from '@/pages/leads/hq/MapTab'
import TerritoryTab from './TerritoryTab'
import {
  Plus, X, Phone, Mail, MapPin, Building2, Tag,
  MessageSquare, ChevronDown, ChevronUp, Edit2, Trash2, Clock,
  PhoneCall, AtSign, Users, Handshake, AlertCircle,
  Gift, Globe, ImagePlus, Loader2, Calendar, Package, Send,
} from 'lucide-react'

// ─── Brand-safe status config (no green) ─────────────────────────────────────
const STATUSES = [
  { value: 'new_lead',          label: 'New Lead',          bg: 'bg-blue-100',          text: 'text-blue-800',          border: 'border-blue-300' },
  { value: 'contacted',         label: 'Contacted',         bg: 'bg-yellow-100',        text: 'text-yellow-800',        border: 'border-yellow-300' },
  { value: 'meeting_scheduled', label: 'Meeting Scheduled', bg: 'bg-purple-100',        text: 'text-purple-800',        border: 'border-purple-300' },
  { value: 'follow_up',         label: 'Follow Up',         bg: 'bg-red-100',           text: 'text-red-800',           border: 'border-red-300' },
  { value: 'not_interested',    label: 'Not Interested',    bg: 'bg-gray-100',          text: 'text-gray-600',          border: 'border-gray-300' },
]

const INTERACTION_TYPES = [
  { value: 'call',    label: 'Call',    icon: PhoneCall     },
  { value: 'email',   label: 'Email',   icon: AtSign        },
  { value: 'visit',   label: 'Visit',   icon: MapPin        },
  { value: 'meeting', label: 'Meeting', icon: Users         },
  { value: 'collab',  label: 'Collab',  icon: Handshake     },
  { value: 'drop',    label: 'Drop',    icon: Package       },
  { value: 'dm',      label: 'DM',      icon: Send          },
  { value: 'other',   label: 'Other',   icon: MessageSquare },
]

// Interaction history is always shown newest-first.
const byNewest = (a, b) => new Date(b.logged_at) - new Date(a.logged_at)

const INDUSTRIES = [
  'Accounting', 'Apartments', 'Chiropractic', 'Club / Group', 'Coffee / Café', 'Community Org',
  'Corporate / Office', 'Corporate Wellness', 'Education', 'Entertainment', 'Events',
  'Fitness Equipment', 'Government', 'Gym / Fitness', 'Health Tech', 'Healthcare',
  'Hospitality', 'Influencer', 'Insurance', 'Legal', 'Manufacturing', 'Massage',
  'MedSpa', 'Municipal', 'Neighborhood / HOA', 'Networking Group', 'Nutrition / Wellness',
  'Physical Therapy', 'Private Club', 'Property Management', 'Real Estate', 'Recreation',
  'Restaurant / Bar', 'Restaurant Group', 'Retail', 'Salon / Spa', 'School',
  'Sports / Athletics', 'Wellness', 'Yoga / Pilates', 'Other',
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

function fmtLastContact(iso) {
  if (!iso) return null
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

const fmtMoney = (n) => `$${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

function fmtDateTime(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const inputCls = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500'
const labelCls = 'block text-xs font-semibold text-gray-700 mb-1'

const blankForm = {
  business_name: '', contact_name: '', phone: '', email: '', address: '',
  industry: '', website: '', social_handle: '', logo_url: '',
  partner_type: 'referral_collab',
  status: 'new_lead', discount_desc: '', discount_ongoing: false,
  next_action: '', next_action_date: '', notes: '', assigned_to: '',
  latitude: null, longitude: null,
  guests_referred: 0, members_referred: 0, revenue_generated: 0,
  is_partner: false, has_lead_box: false,
}

async function geocodeAddress(address) {
  if (!address?.trim()) return null
  const params = new URLSearchParams({
    q: address + ', Wisconsin, USA',
    format: 'json', limit: '1', countrycodes: 'us', addressdetails: '1',
  })
  try {
    const data = await fetch(`https://nominatim.openstreetmap.org/search?${params}`).then(r => r.json())
    if (!data.length) return null
    const result = data[0]
    // Require either a road (real street address) or a recognised place type.
    // Rejects low-confidence guesses that land contacts in lakes / wrong cities.
    const hasRoad = !!result.address?.road
    const goodType = ['neighbourhood', 'suburb', 'village', 'town', 'city', 'hamlet', 'quarter'].includes(result.type)
    if (!hasRoad && !goodType) return null
    return { latitude: parseFloat(result.lat), longitude: parseFloat(result.lon) }
  } catch {}
  return null
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
    partner_type:     contact.partner_type || 'referral_collab',
    status:           contact.status || 'new_lead',
    discount_desc:    contact.discount_desc || '',
    discount_ongoing: contact.discount_ongoing || false,
    next_action:      contact.next_action || '',
    next_action_date: contact.next_action_date || '',
    notes:            contact.notes || '',
    assigned_to:      contact.assigned_to || '',
    latitude:         contact.latitude || null,
    longitude:        contact.longitude || null,
    guests_referred:   contact.guests_referred ?? 0,
    members_referred:  contact.members_referred ?? 0,
    revenue_generated: contact.revenue_generated ?? 0,
    is_partner:        contact.is_partner ?? false,
    has_lead_box:      contact.has_lead_box ?? false,
  } : { ...blankForm })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState(null)   // interaction history (edit mode)
  const logoInputRef = useRef(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!contact?.id) return
    apiGet(`/api/b2b/contacts/${contact.id}/interactions`)
      .then(d => setHistory([...(d || [])].sort(byNewest)))
      .catch(() => setHistory([]))
  }, [contact?.id])

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
      // Auto-geocode address if it changed or lat/lng not yet set
      let { latitude, longitude } = form
      const addressChanged = contact ? form.address !== contact.address : true
      if (form.address && (addressChanged || !latitude)) {
        const coords = await geocodeAddress(form.address)
        if (coords) { latitude = coords.latitude; longitude = coords.longitude }
      }
      const payload = {
        ...form, latitude, longitude,
        assigned_to: form.assigned_to || null,
        next_action_date: form.next_action_date || null,
        website: form.website || null,
        social_handle: form.social_handle || null,
        logo_url: form.logo_url || null,
      }
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

          {/* Type */}
          <div>
            <label className={labelCls}>Type</label>
            <div className="flex gap-2">
              {[{ v: 'referral_collab', l: 'Referral / Collab' }, { v: 'corporate', l: 'Corporate Membership' }].map(o => (
                <button key={o.v} type="button" onClick={() => set('partner_type', o.v)}
                  className={`flex-1 py-2 px-3 rounded-lg border text-sm font-semibold transition-all ${
                    form.partner_type === o.v
                      ? 'bg-orange-50 text-orange-700 border-orange-300 ring-2 ring-offset-1 ring-orange-400'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          {/* Partner flag */}
          <label className="flex items-center gap-2.5 cursor-pointer bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5">
            <input type="checkbox" checked={!!form.is_partner} onChange={e => set('is_partner', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
            <span className="text-sm font-semibold text-gray-800">Partner</span>
            <span className="text-xs text-gray-500">— check to list this business / apartment on the Partners tab</span>
          </label>

          {/* Digital Lead Box flag */}
          <label className="flex items-center gap-2.5 cursor-pointer bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
            <input type="checkbox" checked={!!form.has_lead_box} onChange={e => set('has_lead_box', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm font-semibold text-gray-800">Digital Lead Box</span>
            <span className="text-xs text-gray-500">— this location has a HOTWORX digital lead box in their store</span>
          </label>

          {/* Status + Assignment */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Status</label>
              <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Assigned To <span className="text-gray-400 font-normal">(manager who'll reach out)</span></label>
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

          {/* Partnership value — what this relationship is worth */}
          <div>
            <label className={labelCls}>Partnership Value <span className="text-gray-400 font-normal normal-case">— track the ROI of this relationship</span></label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <span className="text-[11px] text-gray-500">Guests referred</span>
                <input type="number" min="0" className={inputCls} value={form.guests_referred} onChange={e => set('guests_referred', e.target.value)} />
              </div>
              <div>
                <span className="text-[11px] text-gray-500">Members referred</span>
                <input type="number" min="0" className={inputCls} value={form.members_referred} onChange={e => set('members_referred', e.target.value)} />
              </div>
              <div>
                <span className="text-[11px] text-gray-500">Revenue ($)</span>
                <input type="number" min="0" step="0.01" className={inputCls} value={form.revenue_generated} onChange={e => set('revenue_generated', e.target.value)} />
              </div>
            </div>
          </div>

          <div><label className={labelCls}>Notes</label><textarea rows={3} className={`${inputCls} resize-none`} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Additional context…" /></div>

          {/* Interaction history (read-only) — edit mode only */}
          {contact && (
            <div className="pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Interaction History{Array.isArray(history) && history.length > 0 ? ` (${history.length})` : ''}
              </p>
              {history === null ? (
                <p className="text-xs text-gray-400 py-2">Loading…</p>
              ) : history.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">No interactions logged yet.</p>
              ) : (
                <div className="rounded-lg border border-gray-100 px-3 max-h-64 overflow-y-auto">
                  {history.map(i => {
                    const meta = INTERACTION_TYPES.find(t => t.value === i.type) || INTERACTION_TYPES[INTERACTION_TYPES.length - 1]
                    const Icon = meta.icon
                    return (
                      <div key={i.id} className="flex items-start gap-2.5 py-2.5 border-b border-gray-100 last:border-0">
                        <div className="w-6 h-6 rounded-full bg-orange-100 border border-orange-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Icon size={11} className="text-orange-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-gray-800">
                            <span className="capitalize">{meta.label}</span>
                            <span className="text-gray-500 font-normal ml-1">by {i.logged_by_name}</span>
                            <span className="text-gray-400 ml-1.5">{fmtDateTime(i.logged_at)}</span>
                          </p>
                          {i.notes && <p className="text-xs text-gray-600 mt-0.5">{i.notes}</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
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
function LogInteractionModal({ contact, existingInteraction, onSave, onClose }) {
  const isEdit = !!existingInteraction
  const [type,   setType]   = useState(existingInteraction?.type  || 'call')
  const [notes,  setNotes]  = useState(existingInteraction?.notes || '')
  const [date,   setDate]   = useState(
    existingInteraction
      ? new Date(existingInteraction.logged_at).toLocaleDateString('en-CA')
      : new Date().toLocaleDateString('en-CA')
  )
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setSaveErr('')
    try {
      const logged_at = new Date(date + 'T12:00:00').toISOString()
      const saved = isEdit
        ? await apiPut(`/api/b2b/interactions/${existingInteraction.id}`, { type, notes, logged_at })
        : await apiPost(`/api/b2b/contacts/${contact.id}/interactions`, { type, notes, logged_at })
      onSave(saved, isEdit)
    } catch (err) {
      setSaveErr(err.message || 'Save failed — please try again')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form className="bg-white rounded-xl w-full max-w-md shadow-2xl border border-gray-200" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-800 rounded-t-xl">
          <h2 className="text-white font-bold">{isEdit ? 'Edit Interaction' : 'Log Interaction'}</h2>
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
            <label className="block text-xs font-semibold text-gray-700 mb-1">Date</label>
            <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
            <textarea rows={3} className={`${inputCls} resize-none`} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What happened? Any next steps?" />
          </div>
        </div>
        {saveErr && (
          <div className="mx-5 mb-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
            ⚠️ {saveErr}
          </div>
        )}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium">Cancel</button>
          <button type="submit" disabled={saving} className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Log Interaction'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Shared interaction row with edit / delete ────────────────────────────────
function InteractionRow({ interaction, contact, isOwnerOrManager, onUpdated, onDeleted, compact = false }) {
  const [confirmDel,  setConfirmDel]  = useState(false)
  const [deleting,    setDeleting]    = useState(false)
  const [editing,     setEditing]     = useState(false)
  const meta = INTERACTION_TYPES.find(t => t.value === interaction.type) || INTERACTION_TYPES[INTERACTION_TYPES.length - 1]
  const Icon = meta.icon

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await apiDelete(`/api/b2b/interactions/${interaction.id}`)
      onDeleted(interaction.id)
    } catch { setDeleting(false); setConfirmDel(false) }
  }

  const handleSaved = (saved) => {
    onUpdated(saved)
    setEditing(false)
  }

  return (
    <>
      <div className={`flex items-start gap-2.5 ${compact ? 'py-2.5 border-b border-gray-100 last:border-0' : 'pt-3'}`}>
        <div className={`${compact ? 'w-6 h-6' : 'w-7 h-7'} rounded-full bg-orange-100 border border-orange-200 flex items-center justify-center flex-shrink-0 mt-0.5`}>
          <Icon size={compact ? 11 : 12} className="text-orange-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-800">
            <span className="capitalize">{meta.label}</span>
            <span className="text-gray-500 font-normal ml-1">by {interaction.logged_by_name}</span>
            <span className="text-gray-400 ml-1.5">{fmtDateTime(interaction.logged_at)}</span>
          </p>
          {interaction.notes && <p className={`text-xs text-gray-600 mt-0.5 ${compact ? '' : ''}`}>{interaction.notes}</p>}
        </div>
        {isOwnerOrManager && (
          <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
            {!confirmDel ? (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="p-1 text-gray-300 hover:text-blue-500 rounded transition-colors"
                  title="Edit"
                >
                  <Edit2 size={11} />
                </button>
                <button
                  onClick={() => setConfirmDel(true)}
                  className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
                  title="Delete"
                >
                  <Trash2 size={11} />
                </button>
              </>
            ) : (
              <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2 py-0.5">
                <span className="text-[10px] text-red-600 font-semibold">Delete?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-[10px] text-red-600 font-bold hover:text-red-800 disabled:opacity-50"
                >Yes</button>
                <button
                  onClick={() => setConfirmDel(false)}
                  className="text-[10px] text-gray-400 hover:text-gray-600"
                >No</button>
              </div>
            )}
          </div>
        )}
      </div>

      {editing && (
        <LogInteractionModal
          contact={contact}
          existingInteraction={interaction}
          onSave={handleSaved}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  )
}

// ─── Contact Card ─────────────────────────────────────────────────────────────
function ContactCard({ contact, users, isOwnerOrManager, onEdit, onDelete, onLogInteraction, signal }) {
  const [expanded, setExpanded] = useState(false)
  const [interactions, setInteractions] = useState(null)
  const [linkedEvents, setLinkedEvents] = useState(null)
  const [linkedEventsError, setLinkedEventsError] = useState(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const assignedUser = users.find(u => u.id === contact.assigned_to)
  const isDue = contact.next_action_date && new Date(contact.next_action_date + 'T00:00:00') <= new Date()

  const loadInteractions = useCallback(async () => {
    if (interactions !== null) return
    setLoadingHistory(true)
    setLinkedEventsError(null)
    try {
      // Fetch interactions via backend (service role key)
      const iData = await apiGet(`/api/b2b/contacts/${contact.id}/interactions`)
      setInteractions(iData)

      // Fetch linked events via backend (service role key bypasses RLS)
      try {
        const evts = await apiGet(`/api/b2b/contacts/${contact.id}/events`)
        setLinkedEvents(Array.isArray(evts) ? evts : [])
      } catch (evtErr) {
        console.error('linked events fetch error:', evtErr)
        setLinkedEventsError(evtErr?.message || 'Failed to load linked events')
        setLinkedEvents([])
      }
    } catch (err) {
      console.error('loadInteractions', err)
      setInteractions(prev => prev ?? [])
      setLinkedEvents([])
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

        {/* Status + partner badge + thumbs */}
        <div className="flex items-center gap-2 flex-wrap mt-3">
          <StatusBadge status={contact.status} />
          {contact.is_partner && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-500 text-white rounded-full text-xs font-bold">
              <Handshake size={11} /> Partner
            </span>
          )}
          {contact.has_lead_box && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-600 text-white rounded-full text-xs font-bold">
              <Package size={11} /> Lead Box
            </span>
          )}
          {contact.discount_ongoing && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 border border-orange-300 rounded-full text-xs font-semibold text-orange-800">
              <Gift size={10} /> Partner
            </span>
          )}
          <ThumbsWidget
            entityType="b2b"
            entityId={contact.id}
            entityLabel={contact.business_name}
            initialUp={signal?.up ?? 0}
            initialNeutral={signal?.neutral ?? 0}
            initialDown={signal?.down ?? 0}
            initialMine={signal?.mine ?? null}
            className="ml-auto"
          />
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

        {/* Partnership value */}
        {(contact.guests_referred > 0 || contact.members_referred > 0 || contact.revenue_generated > 0) && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {contact.guests_referred > 0 && <span className="text-[11px] font-semibold bg-slate-100 text-slate-700 rounded-full px-2 py-0.5">{contact.guests_referred} guests</span>}
            {contact.members_referred > 0 && <span className="text-[11px] font-semibold bg-slate-100 text-slate-700 rounded-full px-2 py-0.5">{contact.members_referred} members</span>}
            {contact.revenue_generated > 0 && <span className="text-[11px] font-semibold bg-green-100 text-green-700 rounded-full px-2 py-0.5">{fmtMoney(contact.revenue_generated)}</span>}
          </div>
        )}
      </div>

      {/* Action row: Log Outreach + History toggle */}
      <div className="flex items-stretch border-t border-gray-100">
        {isOwnerOrManager && (
          <button onClick={() => onLogInteraction(contact, handleInteractionLogged)}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-orange-600 hover:bg-orange-50 transition-colors border-r border-gray-100">
            <MessageSquare size={14} /> Log Outreach
          </button>
        )}
        <button onClick={handleExpand}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors">
          <span>{expanded ? 'Hide' : 'Show'} interaction history</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-1 border-t border-gray-100 bg-gray-50">
          {loadingHistory ? (
            <p className="text-xs text-gray-400 py-3">Loading…</p>
          ) : interactions?.length ? (
            [...interactions].sort(byNewest).map(i => (
              <InteractionRow
                key={i.id}
                interaction={i}
                contact={contact}
                isOwnerOrManager={isOwnerOrManager}
                compact={false}
                onUpdated={updated => setInteractions(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x))}
                onDeleted={id => setInteractions(prev => prev.filter(x => x.id !== id))}
              />
            ))
          ) : (
            <p className="text-xs text-gray-400 pt-3 italic">No interactions logged yet.</p>
          )}

          {/* Linked events */}
          {linkedEventsError && (
            <div className="pt-3 mt-1 border-t border-gray-200">
              <p className="text-xs text-red-500">Events error: {linkedEventsError}</p>
            </div>
          )}
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

// ─── Pipeline constants ───────────────────────────────────────────────────────
const PIPELINE_STATUSES = ['new_lead', 'contacted', 'meeting_scheduled', 'follow_up', 'not_interested']

const NEXT_STAGE = {
  new_lead:          { value: 'contacted',         label: 'Mark Contacted' },
  contacted:         { value: 'meeting_scheduled', label: 'Book Meeting' },
  meeting_scheduled: { value: 'follow_up',         label: 'Mark Follow-Up' },
  follow_up:         { value: 'contacted',         label: 'Re-Contacted' },
}

// ─── Pipeline row (compact, action-focused) ────────────────────────────────────
function PipelineRow({ contact, users, isOwnerOrManager, onEdit, onDelete, onLog, onStatusChange, signal }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [interactions,  setInteractions]  = useState(null)
  const [linkedEvents,  setLinkedEvents]  = useState(null)
  const [loadingHist,   setLoadingHist]   = useState(false)
  const [expanded,      setExpanded]      = useState(false)

  const m     = statusMeta(contact.status)
  const today = new Date(); today.setHours(0,0,0,0)
  const due   = contact.next_action_date ? new Date(contact.next_action_date + 'T00:00:00') : null
  const overdue  = due && due < today
  const next  = NEXT_STAGE[contact.status]

  async function handleExpand() {
    const show = !expanded; setExpanded(show)
    if (show && interactions === null) {
      setLoadingHist(true)
      try {
        const [iData, evts] = await Promise.all([
          apiGet(`/api/b2b/contacts/${contact.id}/interactions`),
          apiGet(`/api/b2b/contacts/${contact.id}/events`),
        ])
        setInteractions(iData)
        setLinkedEvents(Array.isArray(evts) ? evts : [])
      } finally { setLoadingHist(false) }
    }
  }

  return (
    <div className={overdue ? 'bg-red-50/40' : ''}>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Logo / initial */}
        <div className="flex-shrink-0">
          {contact.logo_url
            ? <img src={contact.logo_url} alt="" className="w-9 h-9 rounded-lg object-contain bg-gray-50 border border-gray-200" />
            : <div className={`w-9 h-9 rounded-lg ${m.bg} border ${m.border} flex items-center justify-center flex-shrink-0`}>
                <span className={`text-sm font-bold ${m.text}`}>{(contact.business_name[0] || '?').toUpperCase()}</span>
              </div>
          }
        </div>

        {/* Name + sub-info + next action */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{contact.business_name}</p>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            {contact.contact_name && <span className="text-xs text-gray-500">{contact.contact_name}</span>}
            {contact.industry && <span className="text-xs text-gray-400">· {contact.industry}</span>}
          </div>
          {contact.next_action && (
            <p className={`text-xs mt-1 flex items-center gap-1 ${overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
              {overdue
                ? <AlertCircle size={11} className="flex-shrink-0 text-red-500" />
                : <Clock size={11} className="flex-shrink-0 text-orange-400" />}
              {contact.next_action}
              {contact.next_action_date && (
                <span className={`ml-1 ${overdue ? 'text-red-400' : 'text-gray-400'}`}>· {fmtDate(contact.next_action_date)}</span>
              )}
            </p>
          )}
          {fmtLastContact(contact.last_interacted_at) && (
            <p className="text-xs mt-0.5 text-gray-400 flex items-center gap-1">
              <MessageSquare size={10} className="flex-shrink-0" />
              Last contacted: {fmtLastContact(contact.last_interacted_at)}
            </p>
          )}
        </div>

        {/* Thumbs signal */}
        <ThumbsWidget
          entityType="b2b"
          entityId={contact.id}
          entityLabel={contact.business_name}
          initialUp={signal?.up ?? 0}
          initialNeutral={signal?.neutral ?? 0}
          initialDown={signal?.down ?? 0}
          initialMine={signal?.mine ?? null}
          className="flex-shrink-0"
        />

        {/* Quick action buttons */}
        {isOwnerOrManager && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {contact.phone && (
              <a href={`tel:${contact.phone}`} title={`Call ${contact.phone}`}
                className="p-1.5 text-gray-300 hover:text-orange-500 rounded transition-colors">
                <Phone size={14} />
              </a>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`} title={contact.email}
                className="p-1.5 text-gray-300 hover:text-orange-500 rounded transition-colors">
                <Mail size={14} />
              </a>
            )}
            <button onClick={() => onLog(i => setInteractions(prev => prev ? [i, ...prev] : [i]))}
              title="Log interaction"
              className="p-1.5 text-gray-300 hover:text-orange-500 rounded transition-colors">
              <MessageSquare size={14} />
            </button>
            {next && (
              <button onClick={() => onStatusChange(contact.id, next.value)}
                title={next.label}
                className="hidden sm:inline-flex items-center gap-1 px-2 py-1 ml-0.5 text-xs font-semibold bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 rounded-lg transition-colors whitespace-nowrap">
                {next.label} →
              </button>
            )}
            <button onClick={() => onEdit(contact)} title="Edit"
              className="p-1.5 text-gray-300 hover:text-gray-700 rounded transition-colors">
              <Edit2 size={14} />
            </button>
            {confirmDelete ? (
              <span className="flex items-center gap-1">
                <button onClick={() => onDelete(contact.id)} className="px-1.5 py-1 bg-red-600 text-white text-xs rounded font-semibold">Del</button>
                <button onClick={() => setConfirmDelete(false)} className="text-gray-400 text-xs px-1">✕</button>
              </span>
            ) : (
              <button onClick={() => setConfirmDelete(true)} title="Delete"
                className="p-1.5 text-gray-300 hover:text-red-500 rounded transition-colors">
                <Trash2 size={14} />
              </button>
            )}
            <button onClick={handleExpand} title="History"
              className="p-1.5 text-gray-200 hover:text-gray-500 rounded transition-colors">
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        )}
      </div>

      {/* Inline interaction history + linked events */}
      {expanded && (
        <div className="px-4 pb-3 bg-gray-50 border-t border-gray-100">
          {loadingHist ? (
            <p className="text-xs text-gray-400 py-2">Loading…</p>
          ) : (
            <>
              {interactions?.length ? (
                <div className="space-y-0">
                  {[...interactions].sort(byNewest).map(i => (
                    <InteractionRow
                      key={i.id}
                      interaction={i}
                      contact={contact}
                      isOwnerOrManager={isOwnerOrManager}
                      compact={true}
                      onUpdated={updated => setInteractions(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x))}
                      onDeleted={id => setInteractions(prev => prev.filter(x => x.id !== id))}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 py-2 italic">No interactions logged yet.</p>
              )}
              {linkedEvents?.length > 0 && (
                <div className="pt-2 mt-1 border-t border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Linked Events</p>
                  {linkedEvents.map(ev => (
                    <div key={ev.id} className="flex items-center gap-2 py-1.5">
                      <div className="w-6 h-6 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
                        <Calendar size={11} className="text-blue-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">{ev.title}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(ev.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {ev.location && ` · ${ev.location}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Kanban Board (Connections pipeline) ──────────────────────────────────────
// Dependency-free drag-and-drop via native HTML5 DnD. Drag a card to another
// column to change its status.
function KanbanBoard({ contacts, users, onEdit, onStatusChange, onLogged }) {
  const [dragId, setDragId] = useState(null)
  const [overCol, setOverCol] = useState(null)
  const [sortBy, setSortBy] = useState('none')  // 'none' | 'recent' | 'stale'
  const [logFor, setLogFor] = useState(null)    // contact to log an interaction for
  const todayStr = new Date().toISOString().split('T')[0]
  const userName = id => users.find(u => u.id === id)?.name

  const handleDrop = (status) => {
    const id = dragId
    setOverCol(null); setDragId(null)
    if (!id) return
    const c = contacts.find(x => x.id === id)
    if (c && c.status !== status) onStatusChange(id, status)
  }

  const sortItems = (arr) => {
    if (sortBy === 'none') return arr
    const ts = c => (c.last_interacted_at ? new Date(c.last_interacted_at).getTime() : null)
    return [...arr].sort((a, b) => {
      const ta = ts(a), tb = ts(b)
      if (ta === null && tb === null) return 0
      if (sortBy === 'recent') return ta === null ? 1 : tb === null ? -1 : tb - ta   // newest first, never-contacted last
      return ta === null ? -1 : tb === null ? 1 : ta - tb                              // 'stale': oldest/never first
    })
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 text-xs">
        <span className="text-gray-500 font-medium">Sort by last contacted:</span>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1 text-gray-700 bg-white">
          <option value="none">Default</option>
          <option value="recent">Most recent first</option>
          <option value="stale">Oldest / never first</option>
        </select>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4">
      {PIPELINE_STATUSES.map(statusVal => {
        const meta = statusMeta(statusVal)
        const items = sortItems(contacts.filter(c => c.status === statusVal))
        const active = overCol === statusVal
        return (
          <div key={statusVal}
            onDragOver={e => { e.preventDefault(); if (!active) setOverCol(statusVal) }}
            onDragLeave={e => { if (e.currentTarget === e.target) setOverCol(c => c === statusVal ? null : c) }}
            onDrop={() => handleDrop(statusVal)}
            className={`flex-shrink-0 w-64 rounded-xl border flex flex-col max-h-[72vh] ${active ? 'border-orange-400 bg-orange-50/60' : 'border-gray-200 bg-gray-50'}`}>
            <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl border-b ${meta.bg} ${meta.border}`}>
              <span className={`text-xs font-bold ${meta.text}`}>{meta.label}</span>
              <span className="text-xs font-semibold text-gray-500 bg-white/70 rounded-full px-1.5">{items.length}</span>
            </div>
            <div className="p-2 space-y-2 overflow-y-auto">
              {items.map(c => {
                const overdue = c.next_action_date && c.next_action_date < todayStr
                return (
                  <div key={c.id} draggable
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => { setDragId(null); setOverCol(null) }}
                    onClick={() => onEdit(c)}
                    className={`bg-white rounded-lg border border-gray-200 p-2.5 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${dragId === c.id ? 'opacity-40' : ''}`}>
                    <div className="flex items-center gap-2">
                      {c.logo_url
                        ? <img src={c.logo_url} alt="" className="w-7 h-7 rounded object-contain bg-gray-50 border border-gray-200 flex-shrink-0" />
                        : <div className="w-7 h-7 rounded bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0"><span className="text-xs font-bold text-gray-500">{(c.business_name[0] || '?').toUpperCase()}</span></div>}
                      <p className="text-sm font-semibold text-gray-900 truncate flex-1">{c.business_name}</p>
                      <button onClick={e => { e.stopPropagation(); setLogFor(c) }} title="Log interaction"
                        className="flex-shrink-0 p-1 text-gray-300 hover:text-orange-500 rounded">
                        <MessageSquare size={14} />
                      </button>
                    </div>
                    {(c.is_partner || c.has_lead_box || c.industry) && (
                      <div className="flex items-center gap-1 flex-wrap mt-1.5">
                        {c.is_partner && <span className="text-[10px] font-bold bg-orange-500 text-white rounded-full px-1.5 py-0.5">Partner</span>}
                        {c.has_lead_box && <span className="text-[10px] font-bold bg-blue-600 text-white rounded-full px-1.5 py-0.5">Lead Box</span>}
                        {c.industry && <span className="text-[10px] text-gray-400 truncate">{c.industry}</span>}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-1.5 text-[11px]">
                      <span className="text-gray-400">
                        {fmtLastContact(c.last_interacted_at) ? `Contacted ${fmtLastContact(c.last_interacted_at)}` : 'Never contacted'}
                      </span>
                      {c.assigned_to && <span className="text-gray-400 truncate ml-2">{userName(c.assigned_to)}</span>}
                    </div>
                    {c.next_action_date && (
                      <div className="mt-1 text-[11px]">
                        <span className={overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}>Next: {fmtDate(c.next_action_date)}</span>
                      </div>
                    )}
                  </div>
                )
              })}
              {items.length === 0 && <p className="text-xs text-gray-300 text-center py-6 select-none">Drop here</p>}
            </div>
          </div>
        )
      })}
      </div>

      {logFor && (
        <LogInteractionModal
          contact={logFor}
          onSave={saved => { onLogged?.(logFor.id, saved); setLogFor(null) }}
          onClose={() => setLogFor(null)}
        />
      )}
    </div>
  )
}

// ─── Pipeline Tab ─────────────────────────────────────────────────────────────
function PipelineTab({ contacts, users, isOwnerOrManager, onEdit, onDelete, onStatusChange, onInteractionLogged, b2bSignals = {} }) {
  const [logTarget, setLogTarget] = useState(null)
  const handleInteractionSaved = i => {
    logTarget?.callback?.(i)
    if (logTarget?.contact?.id) onInteractionLogged?.(logTarget.contact.id, i)
    setLogTarget(null)
  }

  const pipelineContacts = contacts // Connections shows all businesses/apartments, partners included
  const today  = new Date(); today.setHours(0,0,0,0)
  const overdue = pipelineContacts.filter(c => c.next_action_date && new Date(c.next_action_date + 'T00:00:00') < today)

  const groups = PIPELINE_STATUSES
    .map(s => ({
      ...statusMeta(s),
      items: pipelineContacts
        .filter(c => c.status === s)
        .sort((a, b) => {
          const aD = a.next_action_date ? new Date(a.next_action_date) : null
          const bD = b.next_action_date ? new Date(b.next_action_date) : null
          if (aD && bD) return aD - bD
          return aD ? -1 : bD ? 1 : 0
        })
    }))
    .filter(g => g.items.length > 0)

  return (
    <>

      {pipelineContacts.length === 0 ? (
        <div className="text-center py-24">
          <Building2 size={48} className="mx-auto mb-4 text-gray-300" />
          <p className="text-gray-700 font-semibold">No contacts in the pipeline yet.</p>
          <p className="text-gray-400 text-sm mt-1">Add your first B2B lead to get started.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.value}>
              <div className="flex items-center gap-2.5 mb-2">
                <StatusBadge status={group.value} />
                <span className="text-gray-400 text-sm font-medium">{group.items.length}</span>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm divide-y divide-gray-100">
                {group.items.map(c => (
                  <PipelineRow
                    key={c.id}
                    contact={c}
                    users={users}
                    isOwnerOrManager={isOwnerOrManager}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onLog={cb => setLogTarget({ contact: c, callback: cb })}
                    onStatusChange={onStatusChange}
                    signal={b2bSignals[String(c.id)] ?? null}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {logTarget && (
        <LogInteractionModal
          contact={logTarget.contact}
          onSave={handleInteractionSaved}
          onClose={() => setLogTarget(null)}
        />
      )}
    </>
  )
}

// ─── Active Partner card ───────────────────────────────────────────────────────
function ActivePartnerCard({ contact, users, isOwnerOrManager, onEdit, onLog, signal }) {
  const [interactions,  setInteractions]  = useState(null)
  const [linkedEvents,  setLinkedEvents]  = useState(null)
  const [loadingHist,   setLoadingHist]   = useState(false)
  const [expanded,      setExpanded]      = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleExpand() {
    const show = !expanded; setExpanded(show)
    if (show && interactions === null) {
      setLoadingHist(true)
      try {
        const [iData, evts] = await Promise.all([
          apiGet(`/api/b2b/contacts/${contact.id}/interactions`),
          apiGet(`/api/b2b/contacts/${contact.id}/events`),
        ])
        setInteractions(iData)
        setLinkedEvents(Array.isArray(evts) ? evts : [])
      } finally { setLoadingHist(false) }
    }
  }

  const lastInteraction  = interactions?.[0] || null
  const daysSince        = lastInteraction ? Math.floor((Date.now() - new Date(lastInteraction.logged_at)) / 86400000) : null
  const needsCheckin     = daysSince !== null && daysSince > 30

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
      <div className="h-1 bg-orange-500" />
      <div className="p-4 flex-1">
        {/* Header */}
        <div className="flex items-start gap-3">
          {contact.logo_url
            ? <img src={contact.logo_url} alt="" className="w-11 h-11 rounded-lg object-contain bg-gray-50 border border-gray-200 flex-shrink-0" />
            : <div className="w-11 h-11 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center flex-shrink-0">
                <Building2 size={18} className="text-orange-500" />
              </div>
          }
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm leading-tight truncate">{contact.business_name}</p>
            {contact.contact_name && <p className="text-xs text-gray-600 mt-0.5">{contact.contact_name}</p>}
            {contact.industry && <p className="text-xs text-gray-400">{contact.industry}</p>}
          </div>
          {isOwnerOrManager && (
            <button onClick={() => onEdit(contact)} title="Edit"
              className="p-1.5 text-gray-300 hover:text-gray-600 rounded transition-colors flex-shrink-0">
              <Edit2 size={13} />
            </button>
          )}
        </div>

        {/* Discount */}
        {contact.discount_desc && (
          <div className="mt-3 flex items-start gap-1.5 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
            <Gift size={12} className="text-orange-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-orange-800 text-xs font-semibold">{contact.discount_desc}</p>
              {contact.discount_ongoing && <p className="text-orange-400 text-[10px] mt-0.5">↻ Auto-renews monthly</p>}
            </div>
          </div>
        )}

        {/* Check-in warning */}
        {needsCheckin && (
          <div className="mt-2 flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            <Clock size={11} className="text-amber-500 flex-shrink-0" />
            <p className="text-amber-700 text-xs font-medium">
              Check-in overdue — last contact {daysSince}d ago
            </p>
          </div>
        )}

        {/* Action row */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {contact.phone && (
            <a href={`tel:${contact.phone}`}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 border border-gray-200 hover:border-orange-300 hover:bg-orange-50 text-gray-600 hover:text-orange-600 text-xs font-medium rounded-lg transition-colors">
              <Phone size={11} /> Call
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 border border-gray-200 hover:border-orange-300 hover:bg-orange-50 text-gray-600 hover:text-orange-600 text-xs font-medium rounded-lg transition-colors">
              <Mail size={11} /> Email
            </a>
          )}
          {isOwnerOrManager && (
            <button
              onClick={() => onLog(i => setInteractions(prev => prev ? [i, ...prev] : [i]))}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-orange-50 border border-orange-200 hover:bg-orange-100 text-orange-700 text-xs font-medium rounded-lg transition-colors">
              <MessageSquare size={11} /> Log
            </button>
          )}
          <ThumbsWidget
            entityType="b2b"
            entityId={contact.id}
            entityLabel={contact.business_name}
            initialUp={signal?.up ?? 0}
            initialNeutral={signal?.neutral ?? 0}
            initialDown={signal?.down ?? 0}
            initialMine={signal?.mine ?? null}
            className="ml-auto"
          />
        </div>
      </div>

      {/* History toggle */}
      <button onClick={handleExpand}
        className="w-full flex items-center justify-between px-4 py-2.5 border-t border-gray-100 text-xs font-medium text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors">
        <span>
          {expanded ? 'Hide history' : 'Show history'}
          {lastInteraction && !expanded && (
            <span className="ml-1.5 text-gray-300">· Last: {fmtDateTime(lastInteraction.logged_at)}</span>
          )}
        </span>
        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50">
          {loadingHist ? (
            <p className="text-xs text-gray-400 py-3">Loading…</p>
          ) : (
            <>
              {interactions?.length ? (
                [...interactions].sort(byNewest).map(i => (
                  <InteractionRow
                    key={i.id}
                    interaction={i}
                    contact={contact}
                    isOwnerOrManager={isOwnerOrManager}
                    compact={false}
                    onUpdated={updated => setInteractions(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x))}
                    onDeleted={id => setInteractions(prev => prev.filter(x => x.id !== id))}
                  />
                ))
              ) : (
                <p className="text-xs text-gray-400 pt-3 italic">No interactions logged yet.</p>
              )}
              {linkedEvents?.length > 0 && (
                <div className="pt-3 mt-1 border-t border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Linked Events</p>
                  {linkedEvents.map(ev => (
                    <div key={ev.id} className="flex items-center gap-2.5 pt-2">
                      <div className="w-7 h-7 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
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
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Active Partners Tab ──────────────────────────────────────────────────────
function ActivePartnerRow({ contact, isOwnerOrManager, onEdit, onLog, onDelete, signal }) {
  const [expanded,      setExpanded]      = useState(false)
  const [interactions,  setInteractions]  = useState(null)
  const [linkedEvents,  setLinkedEvents]  = useState(null)
  const [loadingHist,   setLoadingHist]   = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const lastContact = fmtLastContact(contact.last_interacted_at)
  const daysSince = contact.last_interacted_at
    ? Math.floor((Date.now() - new Date(contact.last_interacted_at)) / 86400000)
    : null
  const needsCheckin = daysSince !== null && daysSince > 30

  async function handleExpand() {
    const show = !expanded; setExpanded(show)
    if (show && interactions === null) {
      setLoadingHist(true)
      try {
        const [iData, evts] = await Promise.all([
          apiGet(`/api/b2b/contacts/${contact.id}/interactions`),
          apiGet(`/api/b2b/contacts/${contact.id}/events`),
        ])
        setInteractions(iData)
        setLinkedEvents(Array.isArray(evts) ? evts : [])
      } finally { setLoadingHist(false) }
    }
  }

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
        {contact.logo_url
          ? <img src={contact.logo_url} alt="" className="w-9 h-9 rounded-lg object-contain bg-gray-50 border border-gray-200 flex-shrink-0" />
          : <div className="w-9 h-9 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center flex-shrink-0">
              <Building2 size={16} className="text-orange-500" />
            </div>
        }
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{contact.business_name}</p>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            {contact.contact_name && <span className="text-xs text-gray-500">{contact.contact_name}</span>}
            {contact.industry && <span className="text-xs text-gray-400">· {contact.industry}</span>}
            {contact.discount_desc && (
              <span className="text-xs text-orange-600 font-medium flex items-center gap-0.5">
                <Tag size={10} /> {contact.discount_desc}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {lastContact && (
            <span className={`text-xs font-medium flex items-center gap-1 ${needsCheckin ? 'text-red-500' : 'text-gray-400'}`}>
              <MessageSquare size={11} /> {lastContact}
            </span>
          )}
          {!lastContact && <span className="text-xs text-gray-300 italic">No contact yet</span>}
          <ThumbsWidget
            entityType="b2b"
            entityId={contact.id}
            entityLabel={contact.business_name}
            initialUp={signal?.up ?? 0}
            initialNeutral={signal?.neutral ?? 0}
            initialDown={signal?.down ?? 0}
            initialMine={signal?.mine ?? null}
          />
          {isOwnerOrManager && (
            <div className="flex items-center gap-0.5">
              {contact.phone && <a href={`tel:${contact.phone}`} className="p-1.5 text-gray-300 hover:text-orange-500 rounded"><Phone size={13} /></a>}
              {contact.email && <a href={`mailto:${contact.email}`} className="p-1.5 text-gray-300 hover:text-orange-500 rounded"><Mail size={13} /></a>}
              <button onClick={() => onLog(i => setInteractions(prev => prev ? [i, ...prev] : [i]))} className="p-1.5 text-gray-300 hover:text-orange-500 rounded"><MessageSquare size={13} /></button>
              <button onClick={() => onEdit(contact)} className="p-1.5 text-gray-300 hover:text-gray-600 rounded"><Edit2 size={13} /></button>
              {confirmDelete ? (
                <>
                  <button onClick={() => onDelete(contact.id)} className="px-1.5 py-1 bg-red-600 text-white text-xs rounded font-semibold">Del</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-gray-400 text-xs px-1">✕</button>
                </>
              ) : (
                <button onClick={() => setConfirmDelete(true)} title="Delete" className="p-1.5 text-gray-300 hover:text-red-500 rounded"><Trash2 size={13} /></button>
              )}
            </div>
          )}
          <button onClick={handleExpand} className="p-1.5 text-gray-200 hover:text-gray-500 rounded transition-colors">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Inline history + linked events */}
      {expanded && (
        <div className="px-4 pb-3 bg-gray-50 border-t border-gray-100">
          {loadingHist ? (
            <p className="text-xs text-gray-400 py-2">Loading…</p>
          ) : (
            <>
              {interactions?.length ? (
                <div className="space-y-0">
                  {[...interactions].sort(byNewest).map(i => (
                    <InteractionRow
                      key={i.id}
                      interaction={i}
                      contact={contact}
                      isOwnerOrManager={isOwnerOrManager}
                      compact={true}
                      onUpdated={updated => setInteractions(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x))}
                      onDeleted={id => setInteractions(prev => prev.filter(x => x.id !== id))}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 py-2 italic">No interactions logged yet.</p>
              )}
              {linkedEvents?.length > 0 && (
                <div className="pt-2 mt-1 border-t border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Linked Events</p>
                  {linkedEvents.map(ev => (
                    <div key={ev.id} className="flex items-center gap-2 py-1.5">
                      <div className="w-6 h-6 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
                        <Calendar size={11} className="text-blue-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">{ev.title}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(ev.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {ev.location && ` · ${ev.location}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ActivePartnersTab({ contacts, users, isOwnerOrManager, onEdit, onDelete, onInteractionLogged, b2bSignals = {} }) {
  const [logTarget, setLogTarget] = useState(null)
  const [viewMode, setViewMode]   = useState('list') // 'card' | 'list'

  const handleInteractionSaved = i => {
    logTarget?.callback?.(i)
    if (logTarget?.contact?.id) onInteractionLogged?.(logTarget.contact.id, i)
    setLogTarget(null)
  }

  // Input is already the partner-flagged list (the Partner checkbox).
  const partners = contacts

  return (
    <>
      {partners.length === 0 ? (
        <div className="text-center py-24">
          <Handshake size={48} className="mx-auto mb-4 text-gray-300" />
          <p className="text-gray-700 font-semibold">No partners yet.</p>
          <p className="text-gray-400 text-sm mt-1">
            Check the <span className="font-semibold">Partner</span> box on any business or apartment to list it here.
          </p>
        </div>
      ) : (
        <>
          {/* View toggle */}
          <div className="flex justify-end mb-4">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button onClick={() => setViewMode('card')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${viewMode === 'card' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                Cards
              </button>
              <button onClick={() => setViewMode('list')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${viewMode === 'list' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                List
              </button>
            </div>
          </div>

          {viewMode === 'card' ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {partners.map(c => (
                <ActivePartnerCard
                  key={c.id}
                  contact={c}
                  users={users}
                  isOwnerOrManager={isOwnerOrManager}
                  onEdit={onEdit}
                  onLog={cb => setLogTarget({ contact: c, callback: cb })}
                  signal={b2bSignals[String(c.id)] ?? null}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              {partners.map(c => (
                <ActivePartnerRow
                  key={c.id}
                  contact={c}
                  isOwnerOrManager={isOwnerOrManager}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onLog={cb => setLogTarget({ contact: c, callback: cb })}
                  signal={b2bSignals[String(c.id)] ?? null}
                />
              ))}
            </div>
          )}
        </>
      )}

      {logTarget && (
        <LogInteractionModal
          contact={logTarget.contact}
          onSave={handleInteractionSaved}
          onClose={() => setLogTarget(null)}
        />
      )}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
// ─── Report Tab ───────────────────────────────────────────────────────────────
function StatCard({ label, value, valueClass = 'text-gray-900', onClick }) {
  return (
    <div onClick={onClick}
      className={`bg-white border border-gray-200 rounded-xl px-4 py-3 text-center shadow-sm ${onClick ? 'cursor-pointer hover:border-orange-300 hover:shadow-md transition-all' : ''}`}>
      <p className={`text-2xl font-black leading-none ${valueClass}`}>{value}</p>
      <p className="text-[11px] text-gray-500 font-medium mt-1 uppercase tracking-wide">{label}</p>
    </div>
  )
}

function Bar({ label, value, max, barClass = 'bg-orange-400', onClick }) {
  return (
    <div onClick={onClick} className={`flex items-center gap-3 ${onClick ? 'cursor-pointer group' : ''}`}>
      <span className={`w-32 flex-shrink-0 text-xs font-semibold text-gray-600 truncate ${onClick ? 'group-hover:text-orange-600' : ''}`}>{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
        <div className={`${barClass} h-full rounded-full ${onClick ? 'group-hover:brightness-95' : ''}`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="w-8 text-right text-sm font-bold text-gray-800">{value}</span>
    </div>
  )
}

function ReportTab({ contacts, onOpenContact }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [drill, setDrill] = useState(null)   // { title, items: contact[] }
  useEffect(() => {
    apiGet('/api/b2b/report').then(setData).catch(e => setError(e.message))
  }, [])

  if (error) return <div className="text-sm text-red-600 py-8">{error}</div>
  if (!data) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const byId = Object.fromEntries((contacts || []).map(c => [c.id, c]))
  const idsToContacts = ids => (ids || []).map(id => byId[id]).filter(Boolean)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const open = (title, items) => setDrill({ title, items })

  const stats = [
    { label: 'Total Connections', value: data.total, drill: () => open('All connections', contacts || []) },
    { label: 'Added This Month', value: data.addedThisMonth, drill: () => open('Added this month', (contacts || []).filter(c => c.created_at >= monthStart)) },
    { label: 'Partners', value: data.partners, drill: () => open('Partners', (contacts || []).filter(c => c.is_partner)) },
    { label: 'Lead Boxes', value: data.leadBoxes, drill: () => open('Digital Lead Box locations', (contacts || []).filter(c => c.has_lead_box)) },
    { label: 'Interactions (30d)', value: data.interactions30, drill: () => open('Businesses contacted (last 30 days)', idsToContacts(data.activityContactIds)) },
  ]
  const stageMax = Math.max(1, ...PIPELINE_STATUSES.map(s => data.byStage[s] || 0))
  const repMax = Math.max(1, ...(data.activityByRep || []).map(r => r.interactions))

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stats.map(s => <StatCard key={s.label} label={s.label} value={s.value} onClick={s.drill} />)}
      </div>

      {/* Pipeline funnel by stage */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-4">Connections by Stage <span className="text-gray-400 font-normal">— tap a bar to see the businesses</span></h3>
        <div className="space-y-2.5">
          {PIPELINE_STATUSES.map(s => {
            const meta = statusMeta(s)
            return <Bar key={s} label={meta.label} value={data.byStage[s] || 0} max={stageMax} barClass={meta.bg}
              onClick={() => open(`${meta.label}`, (contacts || []).filter(c => c.status === s))} />
          })}
        </div>
      </div>

      {/* Activity by rep */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-1">Activity by Rep <span className="text-gray-400 font-normal">— interactions logged (last 30 days)</span></h3>
        {(data.activityByRep || []).length === 0 ? (
          <p className="text-sm text-gray-400 py-4">No interactions logged in the last 30 days.</p>
        ) : (
          <div className="space-y-2.5 mt-3">
            {data.activityByRep.map(r => <Bar key={r.id} label={r.name} value={r.interactions} max={repMax}
              onClick={() => open(`${r.name} — businesses contacted (30d)`, idsToContacts(r.contactIds))} />)}
          </div>
        )}
      </div>

      {drill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDrill(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-200 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-gray-800 rounded-t-2xl">
              <h3 className="text-white font-bold text-sm">{drill.title} <span className="text-gray-400 font-normal">({drill.items.length})</span></h3>
              <button onClick={() => setDrill(null)} className="text-gray-300 hover:text-white"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto divide-y divide-gray-100">
              {drill.items.length === 0 ? (
                <p className="text-sm text-gray-400 px-5 py-6 text-center">No businesses.</p>
              ) : drill.items.map(c => (
                <button key={c.id} onClick={() => { onOpenContact(c); setDrill(null) }}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center gap-3 transition-colors">
                  {c.logo_url
                    ? <img src={c.logo_url} alt="" className="w-8 h-8 rounded-lg object-contain bg-gray-50 border border-gray-200 flex-shrink-0" />
                    : <div className="w-8 h-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0"><span className="text-xs font-bold text-gray-500">{(c.business_name[0] || '?').toUpperCase()}</span></div>}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.business_name}</p>
                    <p className="text-xs text-gray-400">{statusMeta(c.status).label}{fmtLastContact(c.last_interacted_at) ? ` · ${fmtLastContact(c.last_interacted_at)}` : ''}</p>
                  </div>
                  {c.is_partner && <span className="text-[10px] font-bold bg-orange-500 text-white rounded-full px-1.5 py-0.5 flex-shrink-0">Partner</span>}
                  {c.has_lead_box && <span className="text-[10px] font-bold bg-blue-600 text-white rounded-full px-1.5 py-0.5 flex-shrink-0">Box</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function B2bPage() {
  const { role } = useRole()
  const isOwnerOrManager = true // all roles can view, add, and log interactions in B2B

  const [tab, setTab] = useState('pipeline')
  const [contacts, setContacts] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalContact, setModalContact] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [mapFocus, setMapFocus] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [industryFilter, setIndustryFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [leadBoxOnly, setLeadBoxOnly] = useState(false)
  const [pipelineView, setPipelineView] = useState('board')  // 'board' | 'list'
  const [queueAssignee, setQueueAssignee] = useState('')

  const load = useCallback(async () => {
    try {
      const [cd, ud] = await Promise.all([apiGet('/api/b2b/contacts'), apiGet('/api/users')])
      setContacts(cd)
      setUsers(ud.filter(u => u.is_active !== false).map(u => ({ id: u.id, name: u.full_name || u.email })))
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const contactIds = contacts.map(c => String(c.id))
  const b2bSignals = useFeedbackSignals('b2b', contactIds)

  const handleSave = (saved) => {
    setContacts(prev => {
      const idx = prev.findIndex(c => c.id === saved.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next }
      return [saved, ...prev]
    })
    setModalContact(null)
  }

  // Called after any interaction is logged — keeps last_interacted_at in sync
  // so "No contact yet" disappears immediately without a page reload
  const handleInteractionLogged = (contactId, interaction) => {
    setContacts(prev => prev.map(c =>
      c.id === contactId
        ? {
            ...c,
            last_interacted_at: interaction.logged_at || new Date().toISOString(),
            // mirror the backend automation: reaching out moves a fresh/cooled lead to Contacted
            status: (c.status === 'new_lead' || c.status === 'follow_up') ? 'contacted' : c.status,
          }
        : c
    ))
  }

  const handleDelete = async (id) => {
    await apiDelete(`/api/b2b/contacts/${id}`)
    setContacts(prev => prev.filter(c => c.id !== id))
  }

  const handleStatusChange = async (id, newStatus) => {
    const contact = contacts.find(c => c.id === id)
    if (!contact) return
    try {
      const updated = await apiPut(`/api/b2b/contacts/${id}`, { ...contact, status: newStatus })
      setContacts(prev => prev.map(c => c.id === id ? updated : c))
    } catch (err) { setError(err.message) }
  }

  const filtered = contacts.filter(c => {
    const q = searchQuery.toLowerCase()
    const matchSearch = !q || [c.business_name, c.contact_name, c.email, c.industry].some(f => f?.toLowerCase().includes(q))
    const matchStatus = !statusFilter || c.status === statusFilter
    const matchIndustry = !industryFilter || c.industry === industryFilter
    const matchType = !typeFilter || (c.partner_type || 'referral_collab') === typeFilter
    const matchLeadBox = !leadBoxOnly || c.has_lead_box
    return matchSearch && matchStatus && matchIndustry && matchType && matchLeadBox
  })

  const filteredPartners = contacts.filter(c => {
    const q = searchQuery.toLowerCase()
    const matchSearch = !q || [c.business_name, c.contact_name, c.email, c.industry].some(f => f?.toLowerCase().includes(q))
    const matchIndustry = !industryFilter || c.industry === industryFilter
    const matchType = !typeFilter || (c.partner_type || 'referral_collab') === typeFilter
    const matchLeadBox = !leadBoxOnly || c.has_lead_box
    return c.is_partner && matchSearch && matchIndustry && matchType && matchLeadBox
  })

  // ── "B2B Today" action queue — follow-ups due or overdue ──
  const todayStr = new Date().toISOString().split('T')[0]
  const dueItems = contacts
    .filter(c => c.next_action_date && c.next_action_date <= todayStr
      && c.status !== 'not_interested')
    .filter(c => !queueAssignee || c.assigned_to === queueAssignee)
    .sort((a, b) => a.next_action_date.localeCompare(b.next_action_date))
  const userName = (id) => users.find(u => u.id === id)?.name

  // ── "Going Cold" — active partners with no scheduled follow-up that haven't
  // been touched in COLD_DAYS+. Catches partnerships the follow-up queue misses. ──
  const COLD_DAYS = 30
  const dueIds = new Set(dueItems.map(c => c.id))
  const staleDays = (c) => {
    const ref = c.last_interacted_at || c.created_at
    return ref ? Math.floor((Date.now() - new Date(ref).getTime()) / 86400000) : 9999
  }
  const coldItems = contacts
    .filter(c => c.is_partner)
    .filter(c => !dueIds.has(c.id))
    .filter(c => !(c.next_action_date && c.next_action_date > todayStr)) // not already scheduled ahead
    .filter(c => staleDays(c) >= COLD_DAYS)
    .filter(c => !queueAssignee || c.assigned_to === queueAssignee)
    .sort((a, b) => staleDays(b) - staleDays(a))

  // ── Partnership ROI totals across all contacts ──
  const roi = contacts.reduce((a, c) => ({
    guests:  a.guests  + (Number(c.guests_referred)  || 0),
    members: a.members + (Number(c.members_referred) || 0),
    revenue: a.revenue + (Number(c.revenue_generated) || 0),
  }), { guests: 0, members: 0, revenue: 0 })
  const hasRoi = roi.guests > 0 || roi.members > 0 || roi.revenue > 0

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
            <span className="text-orange-500 font-semibold">{contacts.filter(c => c.is_partner).length}</span> partners
          </p>
        </div>
        {isOwnerOrManager && (
          <button onClick={() => setModalContact(false)}
            className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg transition-colors shadow-sm">
            <Plus size={16} /> Add Outreach
          </button>
        )}
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-300 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      {/* Partnership ROI summary */}
      {tab !== 'map' && tab !== 'territory' && tab !== 'report' && hasRoi && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          {[
            { label: 'Guests Referred', value: roi.guests.toLocaleString() },
            { label: 'Members Referred', value: roi.members.toLocaleString() },
            { label: 'Partner Revenue', value: fmtMoney(roi.revenue) },
          ].map(s => <StatCard key={s.label} label={s.label} value={s.value} valueClass="text-orange-500" />)}
        </div>
      )}

      {/* B2B Today — follow-ups due / overdue (business pipeline only) */}
      {tab !== 'map' && tab !== 'territory' && tab !== 'report' && (
      <div className="mb-6 bg-white border border-orange-200 rounded-xl overflow-hidden shadow-sm">
        <div className="bg-orange-50 px-4 py-3 flex items-center justify-between border-b border-orange-100 gap-3">
          <h2 className="text-sm font-bold text-orange-800 flex items-center gap-2">
            <Clock size={15} /> B2B Today
            {dueItems.length > 0 && <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{dueItems.length} due</span>}
          </h2>
          <select value={queueAssignee} onChange={e => setQueueAssignee(e.target.value)}
            className="text-xs border border-orange-200 rounded-lg px-2 py-1 bg-white text-gray-700">
            <option value="">Everyone</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        {dueItems.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gray-400">No follow-ups due. Add a due date + next action on a business to schedule one.</p>
        ) : (
          <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
            {dueItems.map(c => {
              const overdue = c.next_action_date < todayStr
              const who = userName(c.assigned_to)
              const daysOver = Math.round((new Date(todayStr) - new Date(c.next_action_date + 'T00:00:00')) / 86400000)
              return (
                <button key={c.id} onClick={() => setModalContact(c)}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center gap-3 transition-colors">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${overdue ? 'bg-red-500' : 'bg-orange-400'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {c.business_name}
                      {c.partner_type === 'corporate' && <span className="ml-1.5 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">Corporate</span>}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{c.next_action || 'Follow up'}</p>
                  </div>
                  {who && <span className="text-xs text-gray-400 flex-shrink-0">{who}</span>}
                  <span className={`text-xs font-semibold flex-shrink-0 ${overdue ? 'text-red-600' : 'text-orange-600'}`}>
                    {overdue ? `${daysOver}d overdue` : 'Today'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
      )}

      {/* Going Cold — active partners drifting without a scheduled touch */}
      {tab !== 'map' && tab !== 'territory' && tab !== 'report' && coldItems.length > 0 && (
      <div className="mb-6 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="bg-slate-50 px-4 py-3 flex items-center justify-between border-b border-slate-100 gap-3">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Clock size={15} /> Going Cold
            <span className="bg-slate-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{coldItems.length}</span>
          </h2>
          <span className="text-xs text-slate-400">Active partners, no contact in {COLD_DAYS}+ days &amp; no follow-up set</span>
        </div>
        <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
          {coldItems.map(c => {
            const who = userName(c.assigned_to)
            const days = staleDays(c)
            return (
              <button key={c.id} onClick={() => setModalContact(c)}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center gap-3 transition-colors">
                <span className="w-2 h-2 rounded-full flex-shrink-0 bg-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {c.business_name}
                    {c.partner_type === 'corporate' && <span className="ml-1.5 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">Corporate</span>}
                  </p>
                  <p className="text-xs text-gray-500 truncate">Tap to log a touch or schedule a follow-up</p>
                </div>
                {who && <span className="text-xs text-gray-400 flex-shrink-0">{who}</span>}
                <span className="text-xs font-semibold flex-shrink-0 text-slate-500">
                  {days >= 9999 ? 'never contacted' : `${days}d cold`}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {[{ key: 'pipeline', label: 'Connections' }, { key: 'partners', label: 'Partners' }, { key: 'territory', label: 'Canvassing' }, { key: 'map', label: 'Map' }, { key: 'report', label: 'Report' }].map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); if (t.key === 'partners') setStatusFilter('') }}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-orange-500 text-orange-500' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Search + filter (hidden on Map & Territory tabs, which have their own) */}
      {tab !== 'map' && tab !== 'territory' && tab !== 'report' && (
      <div className="flex gap-3 mb-6 flex-wrap">
        <input
          className="flex-1 min-w-48 bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
          placeholder="Search by name, industry, email…"
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
        />
        <select
          className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-orange-500"
          value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          <option value="referral_collab">Referral / Collab</option>
          <option value="corporate">Corporate</option>
        </select>
        <select
          className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-orange-500"
          value={industryFilter} onChange={e => setIndustryFilter(e.target.value)}>
          <option value="">All industries</option>
          {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
        {tab === 'pipeline' && (
          <select
            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-orange-500"
            value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        )}
        <button
          type="button"
          onClick={() => setLeadBoxOnly(v => !v)}
          title="Show only locations with a Digital Lead Box"
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
            leadBoxOnly ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
          }`}>
          <Package size={14} /> Lead Box
        </button>
      </div>
      )}

      {tab === 'pipeline' && (
        <>
          <div className="flex justify-end mb-3">
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
              {['board', 'list'].map(v => (
                <button key={v} onClick={() => setPipelineView(v)}
                  className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${pipelineView === v ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {v === 'board' ? 'Board' : 'List'}
                </button>
              ))}
            </div>
          </div>
          {pipelineView === 'board'
            ? <KanbanBoard contacts={filtered} users={users} onEdit={setModalContact} onStatusChange={handleStatusChange} onLogged={handleInteractionLogged} />
            : <PipelineTab contacts={filtered} users={users} isOwnerOrManager={isOwnerOrManager} onEdit={setModalContact} onDelete={handleDelete} onStatusChange={handleStatusChange} onInteractionLogged={handleInteractionLogged} b2bSignals={b2bSignals} />}
        </>
      )}
      {tab === 'partners' && (
        <ActivePartnersTab contacts={filteredPartners} users={users} isOwnerOrManager={isOwnerOrManager} onEdit={setModalContact} onDelete={handleDelete} onInteractionLogged={handleInteractionLogged} b2bSignals={b2bSignals} />
      )}
      {tab === 'territory' && (
        <TerritoryTab
          users={users}
          onViewOnMap={(z) => { setMapFocus({ lat: z.latitude, lng: z.longitude, name: z.name, nonce: Date.now() }); setTab('map') }}
          onViewContact={(c) => { setSearchQuery(c.business_name || ''); setStatusFilter(''); setTypeFilter(''); setIndustryFilter(''); setTab('pipeline') }}
        />
      )}
      {tab === 'map' && <MapTab focus={mapFocus} />}
      {tab === 'report' && <ReportTab contacts={contacts} onOpenContact={setModalContact} />}

      {modalContact !== null && (
        <ContactModal contact={modalContact || null} users={users} onSave={handleSave} onClose={() => setModalContact(null)} />
      )}
    </div>
  )
}
