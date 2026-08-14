import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'

// Colour a route by how overdue a visit is, relative to its cadence.
function routeStatus(r) {
  if (!r.last_visit) return { color: '#9ca3af', label: 'Never visited' }        // gray
  const cadence = r.cadence_days || 14
  const days = Math.floor((Date.now() - new Date(r.last_visit + 'T00:00:00').getTime()) / 86400000)
  if (days > cadence) return { color: '#C8102E', label: `Due — ${days}d since last` } // red
  return { color: '#10b981', label: `Fresh — ${days}d ago` }                          // green
}

export default function CanvassMap({ routes }) {
  const pts = (routes || []).filter(r => r.latitude != null && r.longitude != null)
  if (!pts.length) return <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 text-center text-sm text-gray-400">No routes have map coordinates yet.</div>
  const center = [
    pts.reduce((s, r) => s + Number(r.latitude), 0) / pts.length,
    pts.reduce((s, r) => s + Number(r.longitude), 0) / pts.length,
  ]
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2 text-[11px] text-gray-500 border-b border-gray-100">
        <span><span className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1" style={{ background: '#10b981' }} />Fresh</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1" style={{ background: '#C8102E' }} />Due</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1" style={{ background: '#9ca3af' }} />Never visited</span>
        <span className="ml-auto">{pts.length} mapped</span>
      </div>
      <MapContainer center={center} zoom={12} style={{ height: '420px', width: '100%' }} scrollWheelZoom>
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {pts.map(r => {
          const st = routeStatus(r)
          return (
            <CircleMarker key={r.id} center={[Number(r.latitude), Number(r.longitude)]} radius={7}
              pathOptions={{ color: st.color, fillColor: st.color, fillOpacity: 0.8, weight: 1 }}>
              <Popup>
                <div className="text-xs">
                  <div className="font-bold text-gray-900">{r.name}</div>
                  <div className="text-gray-500">{r.type || 'route'}{r.assignee_name ? ` · ${r.assignee_name}` : ''}</div>
                  <div className="text-gray-500">{st.label}</div>
                  {r.leads ? <div className="text-gray-500">{r.leads} leads to date</div> : null}
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>
    </div>
  )
}
