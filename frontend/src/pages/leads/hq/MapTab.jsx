import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from 'react-leaflet'
import { Plus, MapPin, X, Search, Loader2, Trash2, Building2, Home, ChevronRight } from 'lucide-react'
import { MAP_ACTIVITIES, EMPLOYEES } from '../data/mockData'

// ─── Studio ───────────────────────────────────────────────────────────────────
const STUDIO = { lat: 43.0831, lng: -88.2490, name: 'HOTWORX Pewaukee', address: '1279 Capitol Drive' }
const MAP_CENTER = [43.05, -88.23]
const MAP_ZOOM   = 11

// ─── Activity types & radii ───────────────────────────────────────────────────
const ACTIVITY_TYPES = [
  'Business Visit','Neighborhood Walk','Apartment Outreach',
  'Event','Coffee Shop / QR Campaign','Flyer Drop',
  'Lunch & Learn','Referral Push','Other',
]
const DEFAULT_POINTS = {
  'Business Visit':30,'Neighborhood Walk':25,'Apartment Outreach':30,
  'Event':40,'Coffee Shop / QR Campaign':20,'Flyer Drop':25,
  'Lunch & Learn':50,'Referral Push':15,'Other':10,
}
// Radius in meters for coverage circle
const CIRCLE_RADIUS = {
  'Neighborhood Walk':700,'Flyer Drop':700,'Apartment Outreach':700,
  'Event':400,'Lunch & Learn':300,
  'Business Visit':150,'Coffee Shop / QR Campaign':120,'Referral Push':120,'Other':150,
}

// ─── Intensity ────────────────────────────────────────────────────────────────
const INTENSITY = {
  fresh:  { color:'#E8611A', fillOpacity:0.22, strokeOpacity:0.6, label:'Fresh',  sub:'< 7 days'  },
  fading: { color:'#F59E0B', fillOpacity:0.15, strokeOpacity:0.4, label:'Fading', sub:'7–30 days' },
  stale:  { color:'#9CA3AF', fillOpacity:0.07, strokeOpacity:0.2, label:'Stale',  sub:'30+ days'  },
}
function getIntensity(dateStr) {
  const days = (Date.now() - new Date(dateStr).getTime()) / 86400000
  return days <= 7 ? 'fresh' : days <= 30 ? 'fading' : 'stale'
}

// ─── Pre-populated neighborhoods ──────────────────────────────────────────────
const DEFAULT_NEIGHBORHOODS = [
  { id:'nh-1',  name:'Pewaukee — Capitol Drive Corridor',  lat:43.0831, lng:-88.2490 },
  { id:'nh-2',  name:'Pewaukee Lake North Shore',           lat:43.0960, lng:-88.2640 },
  { id:'nh-3',  name:'Pewaukee Village',                   lat:43.0792, lng:-88.2773 },
  { id:'nh-4',  name:'Hartland',                           lat:43.1041, lng:-88.3399 },
  { id:'nh-5',  name:'Waukesha — Downtown',                lat:43.0117, lng:-88.2315 },
  { id:'nh-6',  name:'Waukesha — Sunset Drive Area',       lat:43.0287, lng:-88.2490 },
  { id:'nh-7',  name:'Brookfield — Bluemound Road',        lat:43.0500, lng:-88.1066 },
  { id:'nh-8',  name:'Elm Grove',                          lat:43.0430, lng:-88.0928 },
  { id:'nh-9',  name:'Menomonee Falls',                    lat:43.1789, lng:-88.1206 },
  { id:'nh-10', name:'Sussex',                             lat:43.1341, lng:-88.2257 },
  { id:'nh-11', name:'Oconomowoc',                         lat:43.1003, lng:-88.4985 },
  { id:'nh-12', name:'Delafield',                          lat:43.0628, lng:-88.3976 },
  { id:'nh-13', name:'Mukwonago',                          lat:42.8664, lng:-88.3379 },
  { id:'nh-14', name:'Muskego',                            lat:42.9066, lng:-88.1334 },
  { id:'nh-15', name:'New Berlin',                         lat:42.9764, lng:-88.1082 },
  { id:'nh-16', name:'Waukesha — North End',               lat:43.0450, lng:-88.2315 },
  { id:'nh-17', name:'Pewaukee — West Side',               lat:43.0831, lng:-88.3100 },
  { id:'nh-18', name:'Wales',                              lat:43.0003, lng:-88.3773 },
]

// ─── localStorage ─────────────────────────────────────────────────────────────
const ACT_KEY  = 'leadgenhq_map_activities'
const NBH_KEY  = 'leadgenhq_neighborhoods'
const BIZ_KEY  = 'leadgenhq_businesses'

function loadActivities() {
  try {
    const custom = JSON.parse(localStorage.getItem(ACT_KEY) || '[]')
    const customIds = new Set(custom.map(a => a.id))
    return [...MAP_ACTIVITIES.filter(a => !customIds.has(a.id)), ...custom]
  } catch { return MAP_ACTIVITIES }
}
function saveActivities(list) {
  try { localStorage.setItem(ACT_KEY, JSON.stringify(list.filter(a => a.id.startsWith('custom-')))) } catch {}
}
function loadNeighborhoods() {
  try {
    const custom = JSON.parse(localStorage.getItem(NBH_KEY) || '[]')
    const customIds = new Set(custom.map(n => n.id))
    return [...DEFAULT_NEIGHBORHOODS.filter(n => !customIds.has(n.id)), ...custom]
  } catch { return DEFAULT_NEIGHBORHOODS }
}
function saveNeighborhoods(list) {
  try { localStorage.setItem(NBH_KEY, JSON.stringify(list.filter(n => n.id.startsWith('custom-')))) } catch {}
}
function loadBusinesses() {
  try { return JSON.parse(localStorage.getItem(BIZ_KEY) || '[]') } catch { return [] }
}
function saveBusinesses(list) {
  try { localStorage.setItem(BIZ_KEY, JSON.stringify(list)) } catch {}
}

// ─── Geo helpers ──────────────────────────────────────────────────────────────
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}
function nearestActivity(lat, lng, activities, thresholdKm) {
  return activities
    .filter(a => a.latitude && a.longitude)
    .map(a => ({ ...a, dist: distanceKm(lat, lng, a.latitude, a.longitude) }))
    .filter(a => a.dist < thresholdKm)
    .sort((a, b) => new Date(b.dateCompleted) - new Date(a.dateCompleted))[0] || null
}

// ─── Geocode ──────────────────────────────────────────────────────────────────
async function geocode(query) {
  const p = new URLSearchParams({ q: query + ', Wisconsin, USA', format:'json', limit:'1', countrycodes:'us' })
  try {
    const data = await fetch(`https://nominatim.openstreetmap.org/search?${p}`).then(r => r.json())
    if (data.length) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch {}
  return null
}

// ─── Leaflet icons ────────────────────────────────────────────────────────────
const STUDIO_ICON = L.divIcon({
  className:'',
  html:`<div style="width:32px;height:32px;border-radius:50%;background:#1A1A1A;border:3px solid #E8611A;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 3px 10px rgba(0,0,0,.45);">🔥</div>`,
  iconSize:[32,32], iconAnchor:[16,16], popupAnchor:[0,-18],
})
function activityIcon(color) {
  return L.divIcon({
    className:'',
    html:`<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4);"></div>`,
    iconSize:[14,14], iconAnchor:[7,7], popupAnchor:[0,-9],
  })
}
function targetIcon(color='#9CA3AF') {
  return L.divIcon({
    className:'',
    html:`<div style="width:12px;height:12px;border-radius:50%;background:white;border:2.5px dashed ${color};"></div>`,
    iconSize:[12,12], iconAnchor:[6,6], popupAnchor:[0,-8],
  })
}

function newId(prefix) { return `custom-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,6)}` }
function fmt(isoStr) {
  return new Date(isoStr).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
}

// ─── Fly-to handler ───────────────────────────────────────────────────────────
function FlyToHandler({ target }) {
  const map = useMap()
  useEffect(() => { if (target) map.flyTo([target.lat, target.lng], 15, { duration: 1 }) }, [target, map])
  return null
}

// ─── Map click handler ────────────────────────────────────────────────────────
function MapClickHandler({ active, onMapClick }) {
  const map = useMapEvents({ click(e) { if (active) onMapClick(e.latlng) } })
  useEffect(() => {
    const el = map.getContainer()
    el.style.cursor = active ? 'crosshair' : ''
    return () => { el.style.cursor = '' }
  }, [active, map])
  return null
}

// ─── Add Location Modal (neighborhood or business) ────────────────────────────
function AddLocationModal({ type, coords, onClose, onSave }) {
  const [name, setName]           = useState('')
  const [address, setAddress]     = useState('')
  const [notes, setNotes]         = useState('')
  const [category, setCategory]   = useState('Coffee Shop')
  const [lat, setLat]             = useState(coords?.lat ?? null)
  const [lng, setLng]             = useState(coords?.lng ?? null)
  const [searching, setSearching] = useState(false)
  const [err, setErr]             = useState('')

  const BIZ_CATEGORIES = ['Coffee Shop','Restaurant','Gym / Fitness','Medical / PT','Salon / Spa','Retail','Office / Corporate','Other']

  async function handleSearch() {
    if (!address.trim()) return
    setSearching(true); setErr('')
    const res = await geocode(address)
    setSearching(false)
    if (res) { setLat(res.lat); setLng(res.lng); if (!name) setName(address) }
    else setErr('Address not found — try being more specific.')
  }

  function handleSave() {
    if (!name.trim() || !lat || !lng) return
    const entry = { id: newId(type === 'neighborhood' ? 'nh' : 'biz'), name: name.trim(), lat, lng, notes }
    if (type === 'business') entry.category = category
    onSave(entry)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-[#1A1A1A] px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-[#E8611A] text-xs font-bold uppercase tracking-wider mb-0.5">
              {type === 'neighborhood' ? 'Neighborhoods' : 'Businesses'}
            </p>
            <p className="text-white font-bold text-base">Add {type === 'neighborhood' ? 'Neighborhood' : 'Business'}</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/70"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-3">
          {/* Address search */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Search address</label>
            <div className="flex gap-1.5">
              <input value={address} onChange={e => setAddress(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder={type === 'neighborhood' ? 'e.g. Hartland, WI' : 'e.g. 123 Main St, Pewaukee'}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
              <button onClick={handleSearch} disabled={searching || !address.trim()}
                className="px-3 py-2 bg-gray-900 text-white rounded-lg text-xs font-semibold disabled:opacity-40 flex items-center gap-1">
                {searching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
              </button>
            </div>
            {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
            {lat && <p className="text-xs text-green-600 mt-1 font-semibold">📍 Location found</p>}
          </div>
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {type === 'neighborhood' ? 'Neighborhood name *' : 'Business name *'}
            </label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder={type === 'neighborhood' ? 'e.g. Pewaukee Heights' : 'e.g. The Coffee Cottage'}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
          </div>
          {/* Category (business only) */}
          {type === 'business' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]">
                {BIZ_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}
          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes (optional)</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Any details worth noting…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={!name.trim() || !lat}
              className="flex-1 py-2.5 rounded-xl bg-[#E8611A] text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-600">
              Add {type === 'neighborhood' ? 'Neighborhood' : 'Business'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Log Activity Modal ───────────────────────────────────────────────────────
function LogActivityModal({ coords, onClose, onSave }) {
  const today = new Date().toLocaleDateString('en-CA')
  const [form, setForm] = useState({
    locationName:'', addressSearch:'', activityType:'Business Visit',
    employeeId:EMPLOYEES[0].id, employeeName:EMPLOYEES[0].name,
    date:today, notes:'', points:DEFAULT_POINTS['Business Visit'],
    lat: coords?.lat ?? null, lng: coords?.lng ?? null,
  })
  const [searching, setSearching] = useState(false)
  const [err, setErr]             = useState('')
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  function handleTypeChange(type) { set('activityType',type); set('points', DEFAULT_POINTS[type]??10) }
  function handleEmp(id) {
    const e = EMPLOYEES.find(e => e.id===id)
    set('employeeId',id); set('employeeName',e?.name??id)
  }
  async function handleSearch() {
    if (!form.addressSearch.trim()) return
    setSearching(true); setErr('')
    const res = await geocode(form.addressSearch)
    setSearching(false)
    if (res) { set('lat',res.lat); set('lng',res.lng); if (!form.locationName) set('locationName',form.addressSearch) }
    else setErr('Address not found — try a more specific search.')
  }
  function handleSave() {
    if (!form.locationName.trim() || !form.lat || !form.lng) return
    onSave({
      id: newId('act'),
      locationName: form.locationName, latitude: form.lat, longitude: form.lng,
      activityType: form.activityType,
      dateCompleted: new Date(form.date+'T12:00:00').toISOString(),
      employee: form.employeeId, employeeName: form.employeeName,
      missionId: null, playId: null, points: Number(form.points), notes: form.notes,
    })
    onClose()
  }
  const canSave = form.locationName.trim() && form.lat && form.lng

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-[#1A1A1A] px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-[#E8611A] text-xs font-bold uppercase tracking-wider mb-0.5">Paint the Town Orange</p>
            <p className="text-white font-bold text-base">Log Outreach Activity</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/70"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${form.lat ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-orange-50 border border-orange-200 text-orange-700'}`}>
            <MapPin size={12} />
            {form.lat ? `📍 ${Number(form.lat).toFixed(4)}, ${Number(form.lng).toFixed(4)}` : 'Search an address or drop a pin on the map'}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Search address / business</label>
            <div className="flex gap-1.5">
              <input value={form.addressSearch} onChange={e => set('addressSearch',e.target.value)}
                onKeyDown={e => e.key==='Enter' && handleSearch()}
                placeholder="e.g. 1279 Capitol Drive, Pewaukee"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
              <button onClick={handleSearch} disabled={searching || !form.addressSearch.trim()}
                className="px-3 py-2 bg-gray-900 text-white rounded-lg text-xs font-semibold disabled:opacity-40 flex items-center gap-1">
                {searching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
              </button>
            </div>
            {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Location name *</label>
            <input value={form.locationName} onChange={e => set('locationName',e.target.value)}
              placeholder="e.g. Pewaukee Square Apartments"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Activity type</label>
            <select value={form.activityType} onChange={e => handleTypeChange(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]">
              {ACTIVITY_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Who did this?</label>
              <select value={form.employeeId} onChange={e => handleEmp(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]">
                {EMPLOYEES.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
              <input type="date" value={form.date} onChange={e => set('date',e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Points</label>
            <input type="number" min={1} value={form.points} onChange={e => set('points',e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => set('notes',e.target.value)}
              placeholder="What happened? Any follow-up?"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex gap-2 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={!canSave}
            className="flex-1 py-2.5 rounded-xl bg-[#E8611A] text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-600">
            Log Activity
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Location list row ────────────────────────────────────────────────────────
function LocationRow({ item, type, activities, onFly, onDelete }) {
  const threshold = type === 'neighborhood' ? 0.8 : 0.25
  const nearest   = nearestActivity(item.lat, item.lng, activities, threshold)
  const covered   = nearest && getIntensity(nearest.dateCompleted) !== 'stale'
  const intensity = nearest ? getIntensity(nearest.dateCompleted) : null
  const dotColor  = covered ? INTENSITY[intensity].color : '#D1D5DB'
  const isCustom  = item.id.startsWith('custom-')

  return (
    <button onClick={() => onFly(item)}
      className="w-full flex items-center gap-3 py-2.5 px-1 border-b border-gray-50 last:border-0 hover:bg-orange-50/40 transition-colors text-left group rounded">
      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dotColor }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 leading-tight truncate">{item.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {type === 'business' && item.category && (
            <span className="text-[11px] text-gray-400">{item.category}</span>
          )}
          {covered && nearest && (
            <span className="text-[11px] font-medium" style={{ color: dotColor }}>
              {INTENSITY[intensity].label} · {nearest.employeeName} · {fmt(nearest.dateCompleted)}
            </span>
          )}
          {!covered && <span className="text-[11px] text-gray-400">Not yet covered</span>}
        </div>
        {item.notes && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{item.notes}</p>}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {isCustom && (
          <button onClick={e => { e.stopPropagation(); onDelete(item.id) }}
            className="p-1 text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
            <Trash2 size={12} />
          </button>
        )}
        <ChevronRight size={14} className="text-gray-300 group-hover:text-[#E8611A] transition-colors" />
      </div>
    </button>
  )
}

// ─── Main MapTab ──────────────────────────────────────────────────────────────
export default function MapTab() {
  const [activities,     setActivities]     = useState(() => loadActivities())
  const [neighborhoods,  setNeighborhoods]  = useState(() => loadNeighborhoods())
  const [businesses,     setBusinesses]     = useState(() => loadBusinesses())
  const [flyTarget,      setFlyTarget]      = useState(null)
  const [listTab,        setListTab]        = useState('neighborhoods')
  const [search,         setSearch]         = useState('')
  const [placingPin,     setPlacingPin]     = useState(false)
  const [modal,          setModal]          = useState(null) // null | 'activity' | 'neighborhood' | 'business'
  const [pendingCoords,  setPendingCoords]  = useState(null)

  useEffect(() => { saveActivities(activities) },    [activities])
  useEffect(() => { saveNeighborhoods(neighborhoods) }, [neighborhoods])
  useEffect(() => { saveBusinesses(businesses) },    [businesses])

  function handleMapClick(latlng) { setPendingCoords(latlng); setPlacingPin(false); setModal('activity') }
  function closeModal()           { setModal(null); setPendingCoords(null); setPlacingPin(false) }

  function saveActivity(a)    { setActivities(prev => [a, ...prev]) }
  function saveNeighborhood(n){ setNeighborhoods(prev => [...prev, n]) }
  function saveBusiness(b)    { setBusinesses(prev => [...prev, b]) }
  function deleteActivity(id) { setActivities(prev => prev.filter(a => a.id !== id)) }
  function delNeighborhood(id){ setNeighborhoods(prev => prev.filter(n => n.id !== id)) }
  function deleteBusiness(id) { setBusinesses(prev => prev.filter(b => b.id !== id)) }

  // Stats
  const fresh  = activities.filter(a => getIntensity(a.dateCompleted) === 'fresh').length
  const fading = activities.filter(a => getIntensity(a.dateCompleted) === 'fading').length
  const stale  = activities.filter(a => getIntensity(a.dateCompleted) === 'stale').length

  // Covered counts
  const coveredNbh = neighborhoods.filter(n => {
    const hit = nearestActivity(n.lat, n.lng, activities, 0.8)
    return hit && getIntensity(hit.dateCompleted) !== 'stale'
  }).length
  const coveredBiz = businesses.filter(b => {
    const hit = nearestActivity(b.lat, b.lng, activities, 0.25)
    return hit && getIntensity(hit.dateCompleted) !== 'stale'
  }).length

  // Filtered list
  const searchLc = search.toLowerCase()
  const listItems = listTab === 'neighborhoods'
    ? neighborhoods.filter(n => n.name.toLowerCase().includes(searchLc))
    : businesses.filter(b => b.name.toLowerCase().includes(searchLc) || (b.category||'').toLowerCase().includes(searchLc))

  return (
    <div className="flex flex-col">
      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {modal === 'activity' && (
        <LogActivityModal coords={pendingCoords} onClose={closeModal} onSave={saveActivity} />
      )}
      {modal === 'neighborhood' && (
        <AddLocationModal type="neighborhood" coords={null} onClose={closeModal} onSave={saveNeighborhood} />
      )}
      {modal === 'business' && (
        <AddLocationModal type="business" coords={null} onClose={closeModal} onSave={saveBusiness} />
      )}

      {/* ── Top controls ───────────────────────────────────────────────────── */}
      <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between flex-shrink-0 gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          {[['Fresh',fresh,INTENSITY.fresh.color],['Fading',fading,INTENSITY.fading.color],['Stale',stale,INTENSITY.stale.color]].map(([label,count,color]) => (
            <div key={label} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full" style={{background:color}} />
              <span className="text-xs text-gray-500">{label}</span>
              <span className="text-xs font-bold text-gray-700">{count}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {placingPin && <span className="text-[11px] font-semibold text-[#E8611A] animate-pulse">Click map…</span>}
          <button onClick={() => { setPlacingPin(p => !p) }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${placingPin ? 'bg-[#E8611A] text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
            <MapPin size={11} /> Pin
          </button>
          <button onClick={() => setModal('activity')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#E8611A] text-white hover:bg-orange-600">
            <Plus size={11} /> Log
          </button>
        </div>
      </div>

      {/* ── Map ────────────────────────────────────────────────────────────── */}
      <div style={{ height: 360, zIndex: 0 }}>
        <MapContainer center={MAP_CENTER} zoom={MAP_ZOOM} style={{ height:'100%', width:'100%' }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FlyToHandler target={flyTarget} />
          <MapClickHandler active={placingPin} onMapClick={handleMapClick} />

          {/* Studio */}
          <Marker position={[STUDIO.lat, STUDIO.lng]} icon={STUDIO_ICON}>
            <Popup><b>🔥 {STUDIO.name}</b><br /><span style={{fontSize:11,color:'#6b7280'}}>{STUDIO.address}</span></Popup>
          </Marker>

          {/* Neighborhood target circles (uncovered = dashed outline) */}
          {neighborhoods.map(n => {
            const hit      = nearestActivity(n.lat, n.lng, activities, 0.8)
            const covered  = hit && getIntensity(hit.dateCompleted) !== 'stale'
            const intensity = hit ? getIntensity(hit.dateCompleted) : null
            if (covered) return null // covered neighborhoods shown via activity circles
            return (
              <Circle key={n.id} center={[n.lat, n.lng]} radius={600}
                pathOptions={{ color:'#E8611A', fillColor:'#E8611A', fillOpacity:0.03, weight:1, dashArray:'6 4', opacity:0.3 }} />
            )
          })}

          {/* Activity circles — the orange paint */}
          {activities.map(a => {
            if (!a.latitude || !a.longitude) return null
            const intensity = getIntensity(a.dateCompleted)
            const { color, fillOpacity, strokeOpacity } = INTENSITY[intensity]
            const radius = CIRCLE_RADIUS[a.activityType] ?? 200
            return (
              <Circle key={a.id + '-circle'} center={[a.latitude, a.longitude]} radius={radius}
                pathOptions={{ color, fillColor: color, fillOpacity, weight: 1, opacity: strokeOpacity }} />
            )
          })}

          {/* Activity pins */}
          {activities.map(a => {
            if (!a.latitude || !a.longitude) return null
            const intensity = getIntensity(a.dateCompleted)
            const { color }  = INTENSITY[intensity]
            return (
              <Marker key={a.id} position={[a.latitude, a.longitude]} icon={activityIcon(color)}>
                <Popup maxWidth={220}>
                  <div style={{fontFamily:'sans-serif',padding:'2px 0'}}>
                    <p style={{fontWeight:700,fontSize:13,marginBottom:4}}>{a.locationName}</p>
                    <p style={{fontSize:11,color:'#6b7280',marginBottom:2}}>{a.activityType} · {a.employeeName}</p>
                    <p style={{fontSize:11,color:'#6b7280'}}>{fmt(a.dateCompleted)} · <span style={{color,fontWeight:600}}>{INTENSITY[intensity].label}</span></p>
                    {a.notes && <p style={{fontSize:11,color:'#374151',fontStyle:'italic',borderTop:'1px solid #f3f4f6',paddingTop:4,marginTop:4}}>{a.notes}</p>}
                    <p style={{fontSize:11,fontWeight:700,color:'#E8611A',marginTop:4}}>+{a.points} pts</p>
                  </div>
                </Popup>
              </Marker>
            )
          })}

          {/* Business target pins */}
          {businesses.map(b => {
            const hit     = nearestActivity(b.lat, b.lng, activities, 0.25)
            const visited = hit && getIntensity(hit.dateCompleted) !== 'stale'
            return (
              <Marker key={b.id} position={[b.lat, b.lng]} icon={visited ? activityIcon(INTENSITY[getIntensity(hit.dateCompleted)].color) : targetIcon()}>
                <Popup>
                  <div style={{fontFamily:'sans-serif',padding:'2px 0'}}>
                    <p style={{fontWeight:700,fontSize:13,marginBottom:4}}>{b.name}</p>
                    {b.category && <p style={{fontSize:11,color:'#6b7280',marginBottom:2}}>{b.category}</p>}
                    {visited ? <p style={{fontSize:11,fontWeight:600,color:INTENSITY[getIntensity(hit.dateCompleted)].color}}>Visited · {fmt(hit.dateCompleted)}</p>
                              : <p style={{fontSize:11,color:'#9ca3af'}}>Not yet visited</p>}
                    {b.notes && <p style={{fontSize:11,color:'#374151',marginTop:4,fontStyle:'italic'}}>{b.notes}</p>}
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>
      </div>

      {/* ── List section ───────────────────────────────────────────────────── */}
      <div className="flex flex-col">
        {/* List header */}
        <div className="px-4 pt-3 pb-2 border-b border-gray-100">
          {/* Tab row */}
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
              <button onClick={() => { setListTab('neighborhoods'); setSearch('') }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${listTab==='neighborhoods' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <Home size={11} /> Neighborhoods
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${listTab==='neighborhoods' ? 'bg-orange-100 text-orange-600' : 'bg-gray-200 text-gray-500'}`}>
                  {coveredNbh}/{neighborhoods.length}
                </span>
              </button>
              <button onClick={() => { setListTab('businesses'); setSearch('') }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${listTab==='businesses' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <Building2 size={11} /> Businesses
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${listTab==='businesses' ? 'bg-orange-100 text-orange-600' : 'bg-gray-200 text-gray-500'}`}>
                  {coveredBiz}/{businesses.length}
                </span>
              </button>
            </div>
            <button
              onClick={() => setModal(listTab === 'neighborhoods' ? 'neighborhood' : 'business')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#E8611A] text-white hover:bg-orange-600 transition-colors">
              <Plus size={11} /> Add
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${listTab}…`}
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
          </div>
        </div>

        {/* List items */}
        <div className="px-4 py-1">
          {listItems.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              {search ? 'No results.' : listTab === 'businesses' ? 'No businesses yet. Add one!' : 'No neighborhoods match.'}
            </p>
          ) : (
            listItems.map(item => (
              <LocationRow
                key={item.id}
                item={item}
                type={listTab === 'neighborhoods' ? 'neighborhood' : 'business'}
                activities={activities}
                onFly={item => setFlyTarget({ lat: item.lat, lng: item.lng, _t: Date.now() })}
                onDelete={listTab === 'neighborhoods' ? delNeighborhood : deleteBusiness}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
