import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Circle, Marker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { useStudio } from '@/contexts/StudioContext'
import { useRole } from '@/hooks/useRole'
import { Loader2, AlertCircle, MapPin, Users, Home, Footprints, Pencil, Plus, Trash2, Check, X } from 'lucide-react'

// HOTWORX Pewaukee — sensible default view; recentres on the data once loaded.
const DEFAULT_CENTER = [43.0868, -88.2415]

const TYPES = [
  { k: 'all',          label: 'Everyone' },
  { k: 'member',       label: 'Members' },
  { k: 'lead',         label: 'Leads' },
  { k: 'missed_guest', label: 'Missed guests' },
]

// Warm ramp: pale amber (few) → deep red (many).
const RAMP = ['#fde68a', '#fcd34d', '#fb923c', '#f97316', '#ef4444', '#b91c1c']
function bucket(count, max) {
  if (max <= 1) return RAMP.length - 1
  const r = count / max
  if (r > 0.66) return 5
  if (r > 0.40) return 4
  if (r > 0.22) return 3
  if (r > 0.10) return 2
  if (r > 0.04) return 1
  return 0
}
// Area ∝ count so circles read as density, with a floor so 1-person zips stay visible.
const radiusFor = (count, max) => 6 + 26 * Math.sqrt(count / Math.max(1, max))

// Dot colours for the street-level view.
const DOT = { member: '#dc2626', lead: '#f59e0b', missed_guest: '#9ca3af', other: '#64748b' }
const DOT_LABEL = { member: 'Members', lead: 'Leads', missed_guest: 'Missed guests' }
const RADII = [{ mi: 0.25, label: '¼ mi' }, { mi: 0.5, label: '½ mi' }, { mi: 1, label: '1 mi' }]

const M_PER_MI = 1609.34
// A zone's own drawn size, falling back to the map's radius control.
const zoneRadiusMi = (z, fallbackMi) => (z.radius_m ? z.radius_m / M_PER_MI : fallbackMi)

// Drag handle for a zone centre (divIcon — no image assets needed).
const HANDLE_ICON = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;border-radius:9999px;background:#fff;border:3px solid #dc2626;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:move"></div>',
  iconSize: [14, 14], iconAnchor: [7, 7],
})

// Click-to-place support while adding/moving a zone.
function MapClickHandler({ active, onMapClick }) {
  const map = useMapEvents({ click(e) { if (active) onMapClick(e.latlng) } })
  useEffect(() => {
    const el = map.getContainer()
    el.style.cursor = active ? 'crosshair' : ''
    return () => { el.style.cursor = '' }
  }, [active, map])
  return null
}

// Great-circle distance in miles.
function milesBetween(aLat, aLng, bLat, bLng) {
  const R = 3958.8, toRad = d => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

function FitToData({ points }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    const lats = points.map(p => p.lat), lngs = points.map(p => p.lng)
    map.fitBounds([[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], { padding: [40, 40], maxZoom: 12 })
  }, [points, map])
  return null
}

// Fly the map to a zone — driven by clicking a neighbourhood in "Flyer targets".
// `target.n` changes on every click so re-picking the same zone still re-centres.
function FlyToZone({ target }) {
  const map = useMap()
  useEffect(() => {
    if (!target || target.lat == null || target.lng == null) return
    const meters = Math.max(0.1, target.radiusMi || 0.25) * M_PER_MI
    map.flyToBounds(L.latLng(target.lat, target.lng).toBounds(meters * 2.4), { duration: 0.7, maxZoom: 16 })
  }, [target, map])
  return null
}

// Who makes up a zone's member/lead count — opened by clicking the number.
function ZonePeopleModal({ detail, radiusMi, onClose }) {
  const { zone, kind } = detail
  const people = kind === 'member' ? zone.memberList : zone.leadList
  const [copied, setCopied] = useState(false)

  const copyList = async () => {
    const text = people.map(p => `${p.name || 'Unknown'}\t${p.addr || ''}`).join('\n')
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* ignore */ }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="font-bold text-gray-900">{zone.name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {people.length} {kind === 'member' ? 'member' : 'lead'}{people.length === 1 ? '' : 's'} within {radiusMi} mi
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {people.length === 0 ? <p className="text-sm text-gray-400">Nobody in range.</p> : (
            <div className="divide-y divide-gray-100">
              {people.map(p => (
                <div key={p.id} className="py-2">
                  <p className="text-sm font-semibold text-gray-900">{p.name || 'Unknown'}</p>
                  <p className="text-xs text-gray-500">{p.addr || '—'}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <button onClick={copyList} disabled={!people.length}
            className="text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40">
            {copied ? '✓ Copied' : 'Copy list'}
          </button>
          <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-black text-white text-sm font-semibold rounded-lg">Close</button>
        </div>
      </div>
    </div>
  )
}

export default function HeatMapTab() {
  const { currentStudio } = useStudio()
  const { isOwnerOrManager } = useRole()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [type, setType] = useState('all')
  // 'zip' keeps the original clean density view and stays the default.
  const [view, setView] = useState('zip')
  const [addr, setAddr] = useState(null)        // { points, missing }
  const [zones, setZones] = useState([])        // canvassing neighbourhoods/apartments
  const [addrLoading, setAddrLoading] = useState(false)
  const [showTypes, setShowTypes] = useState({ member: true, lead: true, missed_guest: true })
  const [radiusMi, setRadiusMi] = useState(0.5)
  const [detail, setDetail] = useState(null)    // { zone, kind: 'member' | 'lead' }
  const [focusZone, setFocusZone] = useState(null)  // neighbourhood to centre the map on
  const mapBoxRef = useRef(null)
  // Zone editing
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState(null)      // zone being edited/created (unsaved)
  const [placing, setPlacing] = useState(false) // next map click sets the centre
  const [saving, setSaving] = useState(false)

  const reloadZones = useCallback(async () => {
    try {
      const z = await apiGet('/api/territories')
      setZones((z || []).filter(t => t.latitude != null && t.longitude != null))
    } catch { /* keep what we have */ }
  }, [])

  const startNewZone = () => {
    setDraft({ id: null, name: '', type: 'neighborhood', latitude: null, longitude: null, radius_m: Math.round(0.25 * M_PER_MI) })
    setPlacing(true)
    setEditMode(true)
  }

  const saveDraft = async () => {
    if (!draft?.name?.trim()) { setError('Give the zone a name first.'); return }
    if (draft.latitude == null || draft.longitude == null) { setError('Click the map to place the zone.'); return }
    setSaving(true); setError('')
    const body = {
      name: draft.name.trim(), type: draft.type,
      latitude: draft.latitude, longitude: draft.longitude,
      radius_m: draft.radius_m ?? null,
    }
    try {
      if (draft.id) await apiPut(`/api/territories/${draft.id}`, body)
      else await apiPost('/api/territories', body)
      await reloadZones()
      setDraft(null); setPlacing(false)
    } catch (e) { setError(e?.message || 'Could not save the zone.') }
    finally { setSaving(false) }
  }

  const deleteDraft = async () => {
    if (!draft?.id) { setDraft(null); setPlacing(false); return }
    if (!window.confirm(`Delete "${draft.name}"? This removes the canvassing zone everywhere.`)) return
    setSaving(true)
    try {
      await apiDelete(`/api/territories/${draft.id}`)
      await reloadZones()
      setDraft(null); setPlacing(false)
    } catch (e) { setError(e?.message || 'Could not delete the zone.') }
    finally { setSaving(false) }
  }

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setData(await apiGet('/api/member-activation/geo')) }
    catch (e) { setError(e?.message || 'Could not load the map data.') }
    finally { setLoading(false) }
  }, [currentStudio?.id])
  useEffect(() => { load() }, [load])

  // Street-level data is only fetched when the Addresses view is first opened.
  useEffect(() => {
    if (view !== 'address' || addr) return
    let cancelled = false
    setAddrLoading(true)
    Promise.all([
      apiGet('/api/member-activation/geo/addresses').catch(() => ({ points: [], missing: 0 })),
      apiGet('/api/territories').catch(() => []),
    ]).then(([a, z]) => {
      if (cancelled) return
      setAddr(a || { points: [], missing: 0 })
      setZones((z || []).filter(t => t.latitude != null && t.longitude != null))
    }).finally(() => { if (!cancelled) setAddrLoading(false) })
    return () => { cancelled = true }
  }, [view, addr])

  const countOf = useCallback((row) => (type === 'all' ? row.total : (row.byType?.[type] || 0)), [type])

  const points = useMemo(() => {
    if (!data?.zips) return []
    return data.zips.map(z => ({ ...z, count: countOf(z) })).filter(z => z.count > 0)
  }, [data, countOf])

  const max = useMemo(() => points.reduce((m, p) => Math.max(m, p.count), 0), [points])
  const plotted = useMemo(() => points.reduce((s, p) => s + p.count, 0), [points])
  const topCities = useMemo(() => {
    if (!data?.cities) return []
    return data.cities.map(c => ({ ...c, count: countOf(c) })).filter(c => c.count > 0).slice(0, 12)
  }, [data, countOf])

  // ── Address view derivations ──────────────────────────────────────────────
  const dots = useMemo(
    () => (addr?.points || []).filter(p => showTypes[p.t] ?? true),
    [addr, showTypes])

  // Members/leads living within the chosen radius of each canvassing zone —
  // this is the "is it worth flyering" signal.
  const zoneStats = useMemo(() => {
    if (!addr?.points?.length || !zones.length) return []
    return zones.map(z => {
      const memberList = [], leadList = []
      const rMi = zoneRadiusMi(z, radiusMi)
      let total = 0
      for (const p of addr.points) {
        if (milesBetween(z.latitude, z.longitude, p.lat, p.lng) > rMi) continue
        total++
        if (p.t === 'member') memberList.push(p)
        else if (p.t === 'lead') leadList.push(p)
      }
      const byName = (a, b) => (a.name || '').localeCompare(b.name || '')
      memberList.sort(byName); leadList.sort(byName)
      return {
        id: z.id, name: z.name, type: z.type, lat: z.latitude, lng: z.longitude,
        members: memberList.length, leads: leadList.length, total, memberList, leadList,
      }
    }).sort((a, b) => b.members - a.members || b.total - a.total)
  }, [addr, zones, radiusMi])

  const zoneMax = useMemo(() => zoneStats.reduce((m, z) => Math.max(m, z.members), 0), [zoneStats])

  // Clicking a flyer target centres the address map on that neighbourhood.
  const focusOnZone = (z) => {
    setFocusZone(f => ({ id: z.id, lat: z.lat, lng: z.lng, radiusMi: zoneRadiusMi(z, radiusMi), n: (f?.n || 0) + 1 }))
    mapBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 size={26} className="animate-spin text-red-600" /></div>

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2"><AlertCircle size={15} /> {error}</div>}

      {/* View switch */}
      <div className="flex gap-1 border-b border-gray-200">
        {[{ k: 'zip', label: 'ZIP density', Icon: MapPin }, { k: 'address', label: 'Addresses & neighborhoods', Icon: Home }].map(v => (
          <button key={v.k} onClick={() => setView(v.k)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              view === v.k ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            <v.Icon size={15} /> {v.label}
          </button>
        ))}
      </div>

      {/* Controls + coverage (ZIP view) */}
      {view === 'zip' && (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 flex-wrap">
          {TYPES.map(t => (
            <button key={t.k} onClick={() => setType(t.k)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                type === t.k ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          <span className="font-bold text-gray-900">{plotted.toLocaleString()}</span> people mapped across{' '}
          <span className="font-bold text-gray-900">{points.length}</span> ZIPs
        </p>
      </div>
      )}

      {/* ══ ZIP DENSITY VIEW (unchanged) ══ */}
      {view === 'zip' && (<>
      {/* Map */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div style={{ height: 460 }}>
          <MapContainer center={DEFAULT_CENTER} zoom={11} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitToData points={points} />
            {points.map(p => (
              <CircleMarker key={p.zip} center={[p.lat, p.lng]}
                radius={radiusFor(p.count, max)}
                pathOptions={{ color: RAMP[bucket(p.count, max)], fillColor: RAMP[bucket(p.count, max)], fillOpacity: 0.55, weight: 1.5 }}>
                <Popup>
                  <div className="text-sm">
                    <p className="font-bold text-gray-900">{p.city || 'ZIP'} · {p.zip}</p>
                    <p className="text-gray-700">{p.count} {p.count === 1 ? 'person' : 'people'}</p>
                    <div className="mt-1 text-[11px] text-gray-500 space-y-0.5">
                      {Object.entries(p.byType || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                        <div key={k}>{k.replace(/_/g, ' ')}: <b>{v}</b></div>
                      ))}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-100">
          <span className="text-[11px] text-gray-500">Fewer</span>
          {RAMP.map(c => <span key={c} className="w-6 h-3 rounded-sm" style={{ background: c }} />)}
          <span className="text-[11px] text-gray-500">More</span>
          <span className="text-[11px] text-gray-400 ml-auto">Circle size &amp; colour = people per ZIP</span>
        </div>
      </div>

      {/* Ranked lists */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3"><MapPin size={16} className="text-red-600" /> Top ZIP codes</h3>
          {points.length === 0 ? <p className="text-sm text-gray-400">Nothing to show.</p> : (
            <div className="space-y-1.5">
              {points.slice(0, 12).map(p => (
                <div key={p.zip} className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-700 w-14">{p.zip}</span>
                  <span className="text-xs text-gray-500 flex-1 truncate">{p.city || '—'}</span>
                  <div className="w-28 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(p.count / max) * 100}%`, background: RAMP[bucket(p.count, max)] }} />
                  </div>
                  <span className="text-xs font-bold text-gray-900 w-8 text-right">{p.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3"><Users size={16} className="text-orange-500" /> Top cities</h3>
          {topCities.length === 0 ? <p className="text-sm text-gray-400">Nothing to show.</p> : (
            <div className="space-y-1.5">
              {topCities.map(c => {
                const cmax = topCities[0].count || 1
                return (
                  <div key={c.city} className="flex items-center gap-2">
                    <span className="text-xs text-gray-700 flex-1 truncate">{c.city}</span>
                    <div className="w-28 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-orange-400" style={{ width: `${(c.count / cmax) * 100}%` }} />
                    </div>
                    <span className="text-xs font-bold text-gray-900 w-8 text-right">{c.count}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Coverage note — be honest about what isn't on the map */}
      {data?.totals && (data.totals.no_postal_code > 0 || data.totals.unmapped_zip > 0) && (
        <p className="text-xs text-gray-400">
          Not shown: {data.totals.no_postal_code.toLocaleString()} people without a postal code
          {data.totals.unmapped_zip > 0 && <> · {data.totals.unmapped_zip.toLocaleString()} in ZIPs we couldn’t locate</>}.
        </p>
      )}
      </>)}

      {/* ══ ADDRESS / NEIGHBORHOOD VIEW ══ */}
      {view === 'address' && (
        addrLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 size={26} className="animate-spin text-red-600" /></div>
        ) : (<>
          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1.5 flex-wrap">
              {Object.keys(DOT_LABEL).map(k => (
                <button key={k} onClick={() => setShowTypes(s => ({ ...s, [k]: !s[k] }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    showTypes[k] ? 'bg-white text-gray-800 border-gray-400' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: showTypes[k] ? DOT[k] : '#d1d5db' }} />
                  {DOT_LABEL[k]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500">Neighborhood radius</span>
              {RADII.map(r => (
                <button key={r.mi} onClick={() => setRadiusMi(r.mi)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                    radiusMi === r.mi ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                  {r.label}
                </button>
              ))}
              {isOwnerOrManager && (
                <>
                  <span className="w-px h-5 bg-gray-200 mx-1" />
                  <button
                    onClick={() => { setEditMode(m => !m); setDraft(null); setPlacing(false) }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                      editMode ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300'}`}>
                    <Pencil size={12} /> {editMode ? 'Done editing' : 'Edit zones'}
                  </button>
                  <button onClick={startNewZone}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border bg-white text-red-600 border-red-300 hover:bg-red-50">
                    <Plus size={12} /> Add zone
                  </button>
                </>
              )}
            </div>
          </div>

          {editMode && !draft && (
            <p className="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Editing on — click any circle on the map to rename it, move it, or resize it.
            </p>
          )}

          {/* Zone editor */}
          {draft && (
            <div className="bg-white border-2 border-red-200 rounded-xl shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-gray-900">
                  {draft.id ? `Editing “${draft.name || 'zone'}”` : 'New neighborhood / apartment'}
                </h3>
                <button onClick={() => { setDraft(null); setPlacing(false) }} className="text-gray-400 hover:text-gray-700">
                  <X size={16} />
                </button>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Name</label>
                  <input value={draft.name || ''} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                    placeholder="e.g. Redford Estates"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Type</label>
                  <div className="flex gap-1">
                    {[{ k: 'neighborhood', label: 'Neighborhood' }, { k: 'apartment', label: 'Apartments' }].map(t => (
                      <button key={t.k} onClick={() => setDraft(d => ({ ...d, type: t.k }))}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          draft.type === t.k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300'}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={() => setPlacing(true)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                    placing ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
                  <MapPin size={12} /> {placing ? 'Click the map…' : 'Move on map'}
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                  Size — {(( draft.radius_m || 0) / M_PER_MI).toFixed(2)} mi across the radius
                </label>
                <input type="range" min={80} max={3200} step={20}
                  value={draft.radius_m || Math.round(0.25 * M_PER_MI)}
                  onChange={e => setDraft(d => ({ ...d, radius_m: parseInt(e.target.value) }))}
                  className="w-full accent-red-600" />
                <p className="text-[11px] text-gray-400">
                  Drag the white handle to move the centre; the dashed circle is what you're saving.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={saveDraft} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save zone
                </button>
                <button onClick={() => { setDraft(null); setPlacing(false) }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                {draft.id && (
                  <button onClick={deleteDraft} disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 ml-auto">
                    <Trash2 size={13} /> Delete
                  </button>
                )}
              </div>
            </div>
          )}

          <div ref={mapBoxRef} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div style={{ height: 520 }}>
              {/* preferCanvas keeps ~2k dots smooth without a clustering library */}
              <MapContainer center={DEFAULT_CENTER} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom preferCanvas>
                <FlyToZone target={focusZone} />
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitToData points={dots} />

                <MapClickHandler active={placing} onMapClick={(ll) => {
                  setDraft(d => (d ? { ...d, latitude: ll.lat, longitude: ll.lng } : d))
                  setPlacing(false)
                }} />

                {/* Canvassing zones underneath the dots */}
                {zoneStats.filter(z => z.id !== draft?.id).map(z => (
                  <Circle key={z.id} center={[z.lat, z.lng]} radius={zoneRadiusMi(z, radiusMi) * M_PER_MI}
                    pathOptions={focusZone?.id === z.id
                      ? { color: '#dc2626', weight: 3, fillOpacity: 0.15 }
                      : { color: z.type === 'apartment' ? '#7c3aed' : '#0ea5e9', weight: 1.5, fillOpacity: 0.06 }}
                    eventHandlers={{ click: () => { if (editMode) setDraft({ ...z, latitude: z.lat, longitude: z.lng }) } }}>
                    <Tooltip direction="top" opacity={0.95}>
                      <span className="text-xs">
                        <b>{z.name}</b> · {z.members} members, {z.leads} leads within {zoneRadiusMi(z, radiusMi).toFixed(2)} mi
                        {editMode && <> — <i>click to edit</i></>}
                      </span>
                    </Tooltip>
                  </Circle>
                ))}

                {/* The zone being edited: live circle + draggable centre handle */}
                {draft && draft.latitude != null && (
                  <>
                    <Circle center={[draft.latitude, draft.longitude]}
                      radius={(draft.radius_m || 0.25 * M_PER_MI)}
                      pathOptions={{ color: '#dc2626', weight: 2, dashArray: '6 4', fillOpacity: 0.10 }} />
                    <Marker position={[draft.latitude, draft.longitude]} icon={HANDLE_ICON} draggable
                      eventHandlers={{ dragend: (e) => {
                        const ll = e.target.getLatLng()
                        setDraft(d => ({ ...d, latitude: ll.lat, longitude: ll.lng }))
                      } }} />
                  </>
                )}

                {dots.map(p => (
                  <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={4}
                    pathOptions={{ color: DOT[p.t] || DOT.other, fillColor: DOT[p.t] || DOT.other, fillOpacity: 0.85, weight: 1 }}>
                    <Popup>
                      <div className="text-sm">
                        <p className="font-bold text-gray-900">{p.name || 'Member'}</p>
                        <p className="text-gray-600">{p.addr || '—'}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5 capitalize">{(p.t || '').replace(/_/g, ' ')}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
            <div className="flex items-center gap-3 px-4 py-2.5 border-t border-gray-100 flex-wrap">
              {Object.entries(DOT_LABEL).map(([k, label]) => (
                <span key={k} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: DOT[k] }} /> {label}
                </span>
              ))}
              <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <span className="w-3 h-3 rounded-full border-2" style={{ borderColor: '#0ea5e9' }} /> Neighborhood
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <span className="w-3 h-3 rounded-full border-2" style={{ borderColor: '#7c3aed' }} /> Apartments
              </span>
              <span className="text-[11px] text-gray-400 ml-auto">{dots.length.toLocaleString()} addresses shown</span>
            </div>
          </div>

          {/* Flyer targets */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-1">
              <Footprints size={16} className="text-red-600" /> Flyer targets
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Your canvassing zones ranked by how many members already live within {radiusMi} mi — proven demand.
              Lots of leads but few members can mean a conversion gap worth a drop.
              <span className="text-gray-400"> Tap a name to jump to it on the map; tap a count to see who&apos;s in it.</span>
            </p>
            {zoneStats.length === 0 ? (
              <p className="text-sm text-gray-400">No canvassing zones with coordinates yet — add them in Canvassing.</p>
            ) : (
              <div className="space-y-1.5">
                {zoneStats.slice(0, 15).map(z => (
                  <div key={z.id} className={`flex items-center gap-2 rounded-md px-1 -mx-1 ${focusZone?.id === z.id ? 'bg-red-50' : ''}`}>
                    <button onClick={() => focusOnZone(z)} title="Show this neighborhood on the map"
                      className={`text-xs flex-1 truncate text-left hover:text-red-600 hover:underline ${focusZone?.id === z.id ? 'text-red-700 font-semibold' : 'text-gray-700'}`}>
                      {z.name}
                      {z.type === 'apartment' && <span className="ml-1.5 text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">apts</span>}
                    </button>
                    <div className="w-28 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-red-500" style={{ width: `${zoneMax ? (z.members / zoneMax) * 100 : 0}%` }} />
                    </div>
                    <button
                      onClick={() => z.members && setDetail({ zone: z, kind: 'member' })}
                      disabled={!z.members}
                      title={z.members ? 'See who' : 'No members in range'}
                      className={`text-xs font-bold w-8 text-right ${z.members ? 'text-gray-900 hover:text-red-600 hover:underline' : 'text-gray-300 cursor-default'}`}>
                      {z.members}
                    </button>
                    <button
                      onClick={() => z.leads && setDetail({ zone: z, kind: 'lead' })}
                      disabled={!z.leads}
                      title={z.leads ? 'See who' : 'No leads in range'}
                      className={`text-[11px] w-16 text-right ${z.leads ? 'text-amber-600 font-semibold hover:text-amber-700 hover:underline' : 'text-gray-300 cursor-default'}`}>
                      {z.leads} leads
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Who's in this zone — opened from the flyer-target counts */}
          {detail && <ZonePeopleModal detail={detail} radiusMi={radiusMi} onClose={() => setDetail(null)} />}

          {addr?.missing > 0 && (
            <p className="text-xs text-gray-400">
              Not shown: {addr.missing.toLocaleString()} people without a mapped street address
              (missing or unrecognised address).
            </p>
          )}
        </>)
      )}
    </div>
  )
}
