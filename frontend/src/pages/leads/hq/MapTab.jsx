import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet'
import { Plus, MapPin, Clock, User, Zap, X, Search, Loader2, Trash2 } from 'lucide-react'
import { MAP_ACTIVITIES, EMPLOYEES } from '../data/mockData'

// ─── Constants ────────────────────────────────────────────────────────────────
const STUDIO_LAT  = 43.0831
const STUDIO_LNG  = -88.2490
const MAP_CENTER  = [43.05, -88.23]
const MAP_ZOOM    = 11

const ACTIVITY_TYPES = [
  'Business Visit', 'Neighborhood Walk', 'Apartment Outreach',
  'Event', 'Coffee Shop / QR Campaign', 'Flyer Drop',
  'Lunch & Learn', 'Referral Push', 'Other',
]
const DEFAULT_POINTS = {
  'Business Visit': 30, 'Neighborhood Walk': 25, 'Apartment Outreach': 30,
  'Event': 40, 'Coffee Shop / QR Campaign': 20, 'Flyer Drop': 25,
  'Lunch & Learn': 50, 'Referral Push': 15, 'Other': 10,
}

const INTENSITY = {
  fresh:  { color: '#E8611A', label: 'Fresh',  sub: '< 7 days' },
  fading: { color: '#F59E0B', label: 'Fading', sub: '7–30 days' },
  stale:  { color: '#9CA3AF', label: 'Stale',  sub: '30+ days' },
}

// ─── localStorage ─────────────────────────────────────────────────────────────
const MAP_KEY = 'leadgenhq_map_activities'
function loadActivities() {
  try {
    const stored = JSON.parse(localStorage.getItem(MAP_KEY) || '[]')
    // Merge with mock data (mock data won't have custom- prefix)
    const storedIds = new Set(stored.map(a => a.id))
    const mockOnly  = MAP_ACTIVITIES.filter(a => !storedIds.has(a.id))
    return [...mockOnly, ...stored]
  } catch { return MAP_ACTIVITIES }
}
function saveActivities(activities) {
  try {
    // Only persist custom activities (not mock data)
    const custom = activities.filter(a => a.id.startsWith('custom-'))
    localStorage.setItem(MAP_KEY, JSON.stringify(custom))
  } catch {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getIntensity(dateStr) {
  const days = (Date.now() - new Date(dateStr).getTime()) / 86400000
  if (days <= 7)  return 'fresh'
  if (days <= 30) return 'fading'
  return 'stale'
}

function formatDate(isoStr) {
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function newId() { return 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) }

// ─── Leaflet icons (no broken default images) ─────────────────────────────────
function makeIcon(color, size = 22, pulse = false) {
  const html = `
    <div style="position:relative;width:${size}px;height:${size}px;">
      ${pulse ? `<div style="position:absolute;inset:-4px;border-radius:50%;background:${color};opacity:0.25;animation:ping 1.5s cubic-bezier(0,0,.2,1) infinite;"></div>` : ''}
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,.35);"></div>
    </div>`
  return L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [size/2, size/2], popupAnchor: [0, -(size/2 + 4)] })
}

const STUDIO_ICON = L.divIcon({
  className: '',
  html: `<div style="width:30px;height:30px;border-radius:50%;background:#1A1A1A;border:3px solid #E8611A;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.4);">🔥</div>`,
  iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -18],
})

// ─── Geocode via Nominatim ────────────────────────────────────────────────────
async function geocodeAddress(query) {
  const params = new URLSearchParams({
    q: query + ', Wisconsin, USA',
    format: 'json', limit: '1', countrycodes: 'us',
  })
  try {
    const res  = await fetch(`https://nominatim.openstreetmap.org/search?${params}`)
    const data = await res.json()
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch {}
  return null
}

// ─── Map click handler ────────────────────────────────────────────────────────
function MapClickHandler({ active, onMapClick }) {
  const map = useMapEvents({
    click(e) { if (active) onMapClick(e.latlng) },
  })
  useEffect(() => {
    const el = map.getContainer()
    el.style.cursor = active ? 'crosshair' : ''
    return () => { el.style.cursor = '' }
  }, [active, map])
  return null
}

// ─── Log Activity Modal ───────────────────────────────────────────────────────
function LogActivityModal({ coords, onClose, onSave }) {
  const today = new Date().toLocaleDateString('en-CA')
  const [form, setForm] = useState({
    locationName: '',
    addressSearch: '',
    activityType: 'Business Visit',
    employeeId: EMPLOYEES[0].id,
    employeeName: EMPLOYEES[0].name,
    date: today,
    notes: '',
    points: DEFAULT_POINTS['Business Visit'],
    latitude: coords?.lat ?? null,
    longitude: coords?.lng ?? null,
  })
  const [geocoding, setGeocoding]   = useState(false)
  const [geocodeErr, setGeocodeErr] = useState('')
  const [pinSet, setPinSet]         = useState(!!coords)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function handleTypeChange(type) {
    set('activityType', type)
    set('points', DEFAULT_POINTS[type] ?? 10)
  }

  function handleEmployeeChange(id) {
    const emp = EMPLOYEES.find(e => e.id === id)
    set('employeeId', id)
    set('employeeName', emp?.name ?? id)
  }

  async function handleGeocode() {
    if (!form.addressSearch.trim()) return
    setGeocoding(true); setGeocodeErr('')
    const result = await geocodeAddress(form.addressSearch)
    setGeocoding(false)
    if (result) {
      set('latitude', result.lat)
      set('longitude', result.lng)
      if (!form.locationName) set('locationName', form.addressSearch)
      setPinSet(true)
    } else {
      setGeocodeErr('Address not found — try a more specific search.')
    }
  }

  function handleSave() {
    if (!form.locationName.trim() || !form.latitude || !form.longitude) return
    onSave({
      id: newId(),
      locationName: form.locationName,
      latitude:     form.latitude,
      longitude:    form.longitude,
      activityType: form.activityType,
      dateCompleted: new Date(form.date + 'T12:00:00').toISOString(),
      employee:     form.employeeId,
      employeeName: form.employeeName,
      missionId:    null,
      playId:       null,
      points:       Number(form.points),
      notes:        form.notes,
    })
    onClose()
  }

  const canSave = form.locationName.trim() && form.latitude && form.longitude

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-[#1A1A1A] px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-[#E8611A] text-xs font-bold uppercase tracking-wider mb-0.5">Paint the Town Orange</p>
            <p className="text-white font-bold text-base">Log Outreach Activity</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/70"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-3">

          {/* Pin status */}
          <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${pinSet ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-orange-50 border border-orange-200 text-orange-700'}`}>
            <MapPin size={13} />
            {pinSet
              ? `Pin placed — ${form.latitude?.toFixed(4)}, ${form.longitude?.toFixed(4)}`
              : 'No pin yet — search an address or drop a pin on the map'}
          </div>

          {/* Address search */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Search address or business</label>
            <div className="flex gap-1.5">
              <input
                value={form.addressSearch}
                onChange={e => set('addressSearch', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGeocode()}
                placeholder="e.g. 1279 Capitol Drive, Pewaukee"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]"
              />
              <button onClick={handleGeocode} disabled={geocoding || !form.addressSearch.trim()}
                className="px-3 py-2 bg-gray-900 text-white rounded-lg text-xs font-semibold hover:bg-gray-700 transition-colors disabled:opacity-40 flex items-center gap-1">
                {geocoding ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
              </button>
            </div>
            {geocodeErr && <p className="text-xs text-red-500 mt-1">{geocodeErr}</p>}
          </div>

          {/* Location name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Location name *</label>
            <input value={form.locationName} onChange={e => set('locationName', e.target.value)}
              placeholder="e.g. Pewaukee Square Apartments"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
          </div>

          {/* Activity type */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Activity type</label>
            <select value={form.activityType} onChange={e => handleTypeChange(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]">
              {ACTIVITY_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          {/* Employee + Date */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Who did this?</label>
              <select value={form.employeeId} onChange={e => handleEmployeeChange(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]">
                {EMPLOYEES.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
            </div>
          </div>

          {/* Points */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Points</label>
            <input type="number" min={1} value={form.points} onChange={e => set('points', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="What happened? Any follow-up needed?"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex gap-2 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={!canSave}
            className="flex-1 py-2.5 rounded-xl bg-[#E8611A] text-white text-sm font-bold hover:bg-orange-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            Log Activity
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Activity List Item ───────────────────────────────────────────────────────
function ActivityRow({ activity, onDelete }) {
  const intensity = getIntensity(activity.dateCompleted)
  const { color, label } = INTENSITY[intensity]
  const isCustom = activity.id.startsWith('custom-')

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: color }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 leading-tight truncate">{activity.locationName}</p>
        <div className="flex flex-wrap items-center gap-2 mt-0.5">
          <span className="text-[11px] text-gray-500">{activity.activityType}</span>
          <span className="text-gray-200">·</span>
          <span className="text-[11px] text-gray-500 flex items-center gap-0.5"><User size={9} />{activity.employeeName}</span>
          <span className="text-gray-200">·</span>
          <span className="text-[11px] text-gray-500"><Clock size={9} className="inline mr-0.5" />{formatDate(activity.dateCompleted)}</span>
        </div>
        {activity.notes && <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed line-clamp-2">{activity.notes}</p>}
      </div>
      <div className="flex-shrink-0 flex flex-col items-end gap-1">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: color + '20', color }}>
          {label}
        </span>
        <span className="text-[10px] font-bold text-[#E8611A]">+{activity.points} pts</span>
        {isCustom && (
          <button onClick={() => onDelete(activity.id)} className="text-gray-300 hover:text-red-400 transition-colors mt-0.5">
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main MapTab ──────────────────────────────────────────────────────────────
export default function MapTab({ employees: employeesProp }) {
  const [activities,  setActivities]  = useState(() => loadActivities())
  const [showModal,   setShowModal]   = useState(false)
  const [placingPin,  setPlacingPin]  = useState(false)
  const [pendingCoords, setPendingCoords] = useState(null)

  useEffect(() => { saveActivities(activities) }, [activities])

  function handleMapClick(latlng) {
    setPendingCoords(latlng)
    setPlacingPin(false)
    setShowModal(true)
  }

  function handleDropPin() {
    setPendingCoords(null)
    setPlacingPin(true)
  }

  function handleLogNew() {
    setPendingCoords(null)
    setPlacingPin(false)
    setShowModal(true)
  }

  function handleSave(activity) {
    setActivities(prev => [activity, ...prev])
  }

  function handleDelete(id) {
    setActivities(prev => prev.filter(a => a.id !== id))
  }

  function handleCloseModal() {
    setShowModal(false)
    setPendingCoords(null)
    setPlacingPin(false)
  }

  const sorted     = [...activities].sort((a, b) => new Date(b.dateCompleted) - new Date(a.dateCompleted))
  const freshCount  = activities.filter(a => getIntensity(a.dateCompleted) === 'fresh').length
  const fadingCount = activities.filter(a => getIntensity(a.dateCompleted) === 'fading').length
  const staleCount  = activities.filter(a => getIntensity(a.dateCompleted) === 'stale').length

  return (
    <div className="flex flex-col">
      {showModal && (
        <LogActivityModal
          coords={pendingCoords}
          onClose={handleCloseModal}
          onSave={handleSave}
        />
      )}

      {/* ── Stats + Controls bar ────────────────────────────────────────── */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/60 flex-shrink-0">
        {/* Stats */}
        <div className="flex items-center gap-3">
          {[
            { label: 'Fresh',  count: freshCount,  color: INTENSITY.fresh.color },
            { label: 'Fading', count: fadingCount, color: INTENSITY.fading.color },
            { label: 'Stale',  count: staleCount,  color: INTENSITY.stale.color },
          ].map(({ label, count, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
              <span className="text-xs text-gray-500">{label}</span>
              <span className="text-xs font-bold text-gray-700">{count}</span>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5">
          {placingPin && (
            <span className="text-[11px] font-semibold text-[#E8611A] animate-pulse mr-1">Click map to place pin…</span>
          )}
          <button onClick={handleDropPin}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              placingPin ? 'bg-[#E8611A] text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}>
            <MapPin size={12} /> Drop Pin
          </button>
          <button onClick={handleLogNew}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#E8611A] text-white hover:bg-orange-600 transition-colors">
            <Plus size={12} /> Log Activity
          </button>
        </div>
      </div>

      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <div style={{ height: '380px', zIndex: 0 }}>
        <MapContainer
          center={MAP_CENTER}
          zoom={MAP_ZOOM}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapClickHandler active={placingPin} onMapClick={handleMapClick} />

          {/* Studio pin */}
          <Marker position={[STUDIO_LAT, STUDIO_LNG]} icon={STUDIO_ICON}>
            <Popup>
              <div className="text-sm font-bold text-gray-900">🔥 HOTWORX Pewaukee</div>
              <div className="text-xs text-gray-500 mt-0.5">1279 Capitol Drive, Pewaukee</div>
            </Popup>
          </Marker>

          {/* Activity pins */}
          {activities.map(activity => {
            if (!activity.latitude || !activity.longitude) return null
            const intensity = getIntensity(activity.dateCompleted)
            const { color }  = INTENSITY[intensity]
            const isCustom   = activity.id.startsWith('custom-')
            return (
              <Marker
                key={activity.id}
                position={[activity.latitude, activity.longitude]}
                icon={makeIcon(color, 18, isCustom)}
              >
                <Popup maxWidth={220}>
                  <div style={{ fontFamily: 'sans-serif', padding: '2px 0' }}>
                    <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{activity.locationName}</p>
                    <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>
                      {activity.activityType} · {activity.employeeName}
                    </p>
                    <p style={{ fontSize: 11, color: '#6b7280', marginBottom: activity.notes ? 6 : 0 }}>
                      {formatDate(activity.dateCompleted)} · <span style={{ color, fontWeight: 600 }}>{INTENSITY[intensity].label}</span>
                    </p>
                    {activity.notes && (
                      <p style={{ fontSize: 11, color: '#374151', fontStyle: 'italic', borderTop: '1px solid #f3f4f6', paddingTop: 4, marginTop: 2 }}>
                        {activity.notes}
                      </p>
                    )}
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#E8611A', marginTop: 4 }}>+{activity.points} pts</p>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>
      </div>

      {/* ── Activity log ─────────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
          Activity Log — {activities.length} entries
        </p>
        {sorted.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No activities logged yet. Drop a pin to get started!</p>
        ) : (
          <div>
            {sorted.map(a => (
              <ActivityRow key={a.id} activity={a} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
