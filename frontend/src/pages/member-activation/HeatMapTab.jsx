import 'leaflet/dist/leaflet.css'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import { apiGet } from '@/hooks/useApi'
import { useStudio } from '@/contexts/StudioContext'
import { Loader2, AlertCircle, MapPin, Users } from 'lucide-react'

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

function FitToData({ points }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    const lats = points.map(p => p.lat), lngs = points.map(p => p.lng)
    map.fitBounds([[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], { padding: [40, 40], maxZoom: 12 })
  }, [points, map])
  return null
}

export default function HeatMapTab() {
  const { currentStudio } = useStudio()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [type, setType] = useState('all')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setData(await apiGet('/api/member-activation/geo')) }
    catch (e) { setError(e?.message || 'Could not load the map data.') }
    finally { setLoading(false) }
  }, [currentStudio?.id])
  useEffect(() => { load() }, [load])

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

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 size={26} className="animate-spin text-red-600" /></div>

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2"><AlertCircle size={15} /> {error}</div>}

      {/* Controls + coverage */}
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
    </div>
  )
}
