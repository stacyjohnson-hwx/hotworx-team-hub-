import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { MapPin, Home, Building, Plus, X, Loader2, Check, Clock, CalendarClock, Trash2, Pencil, Map as MapIcon, Phone, Link2 } from 'lucide-react'

// Type badge styling so neighborhood vs apartment is unmistakable
const TYPE_META = {
  neighborhood: { label: 'Neighborhood', Icon: Home,     badge: 'bg-green-100 text-green-700 border-green-200', icon: 'text-green-600' },
  apartment:    { label: 'Apartment',    Icon: Building,  badge: 'bg-blue-100 text-blue-700 border-blue-200',   icon: 'text-blue-600' },
}

const CADENCE_OPTIONS = [
  { value: 7,  label: 'Weekly' },
  { value: 14, label: 'Every 2 weeks' },
  { value: 21, label: 'Every 3 weeks' },
  { value: 30, label: 'Monthly' },
  { value: 60, label: 'Every 2 months' },
  { value: 90, label: 'Quarterly' },
]
const ACTIVITY_TYPES = [
  { value: 'flyers',         label: 'Flyers' },
  { value: 'door_hangers',   label: 'Door hangers' },
  { value: 'popup_event',    label: 'Pop-up event' },
  { value: 'leasing_office', label: 'Leasing office visit' },
  { value: 'other',          label: 'Other' },
]
const cadenceLabel = (d) => CADENCE_OPTIONS.find(o => o.value === d)?.label || `Every ${d} days`
const fmt = (s) => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'

const statusMeta = {
  overdue:  { label: 'Overdue',  pill: 'bg-red-100 text-red-700',      dot: 'bg-red-500' },
  due_soon: { label: 'Due soon', pill: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400' },
  ok:       { label: 'Covered',  pill: 'bg-green-100 text-green-700',   dot: 'bg-green-500' },
}

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500'

// ─── Log a hit modal ──────────────────────────────────────────────────────────
function LogHitModal({ zone, onSaved, onClose }) {
  const [form, setForm] = useState({ activity_type: 'flyers', visit_date: new Date().toISOString().slice(0, 10), notes: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      await apiPost(`/api/territories/${zone.id}/visits`, form)
      onSaved()
    } catch { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Log a hit — {zone.name}</h2>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">What did you do?</label>
            <select className={inp} value={form.activity_type} onChange={e => set('activity_type', e.target.value)}>
              {ACTIVITY_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input type="date" className={inp} value={form.visit_date} onChange={e => set('visit_date', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea rows={2} className={`${inp} resize-none`} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="e.g. Left 50 flyers, talked to leasing manager" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 font-medium">Cancel</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />} Log hit
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Add / edit zone modal ────────────────────────────────────────────────────
function ZoneModal({ zone, users, onSaved, onClose }) {
  const [form, setForm] = useState({
    name: zone?.name || '', type: zone?.type || 'neighborhood',
    cadence_days: zone?.cadence_days || 21, assigned_to: zone?.assigned_to || '',
    address: zone?.address || '', notes: zone?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (zone?.id) await apiPut(`/api/territories/${zone.id}`, form)
      else await apiPost('/api/territories', form)
      onSaved()
    } catch { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{zone ? 'Edit zone' : 'Add zone'}</h2>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
            <input className={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Saddlebrook Apartments" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select className={inp} value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="neighborhood">Neighborhood</option>
                <option value="apartment">Apartment complex</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Hit cadence</label>
              <select className={inp} value={form.cadence_days} onChange={e => set('cadence_days', parseInt(e.target.value))}>
                {CADENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Assigned to <span className="text-gray-400 font-normal">(optional)</span></label>
            <select className={inp} value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea rows={2} className={`${inp} resize-none`} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 font-medium">Cancel</button>
          <button onClick={save} disabled={saving || !form.name.trim()} className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />} {zone ? 'Save' : 'Add zone'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Territory tab ────────────────────────────────────────────────────────────
export default function TerritoryTab({ users = [], onViewOnMap, onViewContact }) {
  const [zones, setZones]     = useState([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [logTarget, setLogTarget] = useState(null)
  const [editZone, setEditZone]   = useState(null)   // zone obj = edit, false = add, null = closed

  const load = useCallback(async () => {
    setLoading(true)
    try { setZones(await apiGet('/api/territories')) }
    catch {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const handleDelete = async (id) => {
    if (!confirm('Remove this zone from the canvassing list?')) return
    await apiDelete(`/api/territories/${id}`)
    setZones(prev => prev.filter(z => z.id !== id))
  }

  const rank = { overdue: 0, due_soon: 1, ok: 2 }
  const filtered = zones
    .filter(z => !typeFilter || z.type === typeFilter)
    .filter(z => !statusFilter || z.status === statusFilter)
    .sort((a, b) => rank[a.status] - rank[b.status] || (a.next_due || '').localeCompare(b.next_due || ''))

  const overdueCount = zones.filter(z => z.status === 'overdue').length
  const dueSoonCount = zones.filter(z => z.status === 'due_soon').length

  if (loading) return <div className="flex items-center justify-center h-48"><div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div>
      {/* Summary + add */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="flex items-center gap-1.5 font-semibold text-red-600"><span className="w-2 h-2 rounded-full bg-red-500" /> {overdueCount} overdue</span>
          <span className="text-gray-300">·</span>
          <span className="flex items-center gap-1.5 font-semibold text-orange-600"><span className="w-2 h-2 rounded-full bg-orange-400" /> {dueSoonCount} due soon</span>
          <span className="text-gray-300">·</span>
          <span className="text-gray-500">{zones.length} zones</span>
        </div>
        <button onClick={() => setEditZone(false)} className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg">
          <Plus size={15} /> Add zone
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <select className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          <option value="neighborhood">Neighborhoods</option>
          <option value="apartment">Apartments</option>
        </select>
        <select className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="overdue">Overdue</option>
          <option value="due_soon">Due soon</option>
          <option value="ok">Covered</option>
        </select>
      </div>

      {/* Zone list */}
      <div className="space-y-2">
        {filtered.map(z => {
          const sm = statusMeta[z.status] || statusMeta.ok
          const tmeta = TYPE_META[z.type] || TYPE_META.neighborhood
          const TIcon = tmeta.Icon
          const hasCoords = z.latitude && z.longitude
          return (
            <div key={z.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sm.dot}`} />
                <TIcon size={18} className={`flex-shrink-0 ${tmeta.icon}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900 truncate">{z.name}</p>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${tmeta.badge}`}>{tmeta.label}</span>
                  </div>
                  {z.address && (
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5 truncate"><MapPin size={11} className="flex-shrink-0" /> {z.address}</p>
                  )}
                  <p className="text-[11px] text-gray-400 flex items-center gap-2 flex-wrap mt-0.5">
                    <span className="flex items-center gap-1"><CalendarClock size={11} /> {cadenceLabel(z.cadence_days)}</span>
                    <span>· Last: {fmt(z.last_visit)}</span>
                    <span>· Next: {fmt(z.next_due)}</span>
                    {z.assigned_to_name && <span>· {z.assigned_to_name}</span>}
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${sm.pill}`}>
                  {z.status === 'overdue' ? `${z.days_overdue}d overdue` : sm.label}
                </span>
                <button onClick={() => setLogTarget(z)} title="Log a hit"
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg text-xs font-semibold hover:bg-orange-100 flex-shrink-0">
                  <Check size={12} /> Log hit
                </button>
                <button onClick={() => setEditZone(z)} className="p-1.5 text-gray-400 hover:text-gray-700 flex-shrink-0"><Pencil size={13} /></button>
                <button onClick={() => handleDelete(z.id)} className="p-1.5 text-gray-400 hover:text-red-500 flex-shrink-0"><Trash2 size={13} /></button>
              </div>
              {/* Map + B2B links */}
              {(hasCoords || z.b2b_contact) && (
                <div className="flex items-center gap-2 mt-2 pl-6 flex-wrap">
                  {hasCoords && onViewOnMap && (
                    <button onClick={() => onViewOnMap(z)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 hover:bg-gray-100">
                      <MapIcon size={11} /> View on map
                    </button>
                  )}
                  {z.b2b_contact && (
                    <button onClick={() => onViewContact && onViewContact(z.b2b_contact)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1 hover:bg-blue-100">
                      <Link2 size={11} /> B2B contact
                    </button>
                  )}
                  {z.b2b_contact?.phone && (
                    <a href={`tel:${z.b2b_contact.phone}`}
                      className="flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-2 py-1 hover:bg-green-100">
                      <Phone size={11} /> {z.b2b_contact.phone}
                    </a>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <MapPin size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No zones match. Add a neighborhood or apartment complex to start tracking coverage.</p>
          </div>
        )}
      </div>

      {logTarget && <LogHitModal zone={logTarget} onSaved={() => { setLogTarget(null); load() }} onClose={() => setLogTarget(null)} />}
      {editZone !== null && <ZoneModal zone={editZone || null} users={users} onSaved={() => { setEditZone(null); load() }} onClose={() => setEditZone(null)} />}
    </div>
  )
}
