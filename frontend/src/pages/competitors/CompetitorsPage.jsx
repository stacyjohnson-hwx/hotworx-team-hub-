import { useState, useEffect, useCallback, useRef } from 'react'
import { useRole } from '@/hooks/useRole'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { supabase } from '@/lib/supabase'
import {
  Swords, MapPin, RefreshCw, Plus, X, Star, ChevronDown, ChevronUp,
  ExternalLink, Phone, DollarSign, Trophy, AlertTriangle,
  ClipboardList, Check, Edit2, Trash2, Sparkles, Clock, User,
  ImagePlus, Loader2,
} from 'lucide-react'

// ─── HOTWORX own profile for comparison ──────────────────────────────────────
const HOTWORX = {
  name: 'HOTWORX Pewaukee',
  price_monthly: 59,
  price_drop_in: null,
  price_trial: 'First 3 sessions free',
  hours: '24/7 — always open',
  contract: false,
  infrared: true,
  private_pods: true,
  guided_workouts: true,
  formats: ['Hot Yoga','Hot Pilates','Hot Barre','Hot Cycle','Hot Warrior','HIIT'],
  location_count: '1 (local, not a chain)',
  crowded_classes: false,
  equipment_required: false,
}

const TYPE_META = {
  hot_yoga:  { label: 'Hot Yoga',   color: 'bg-orange-100 text-orange-700 border-orange-300' },
  yoga:      { label: 'Yoga',       color: 'bg-purple-100 text-purple-700 border-purple-300' },
  gym:       { label: 'Gym',        color: 'bg-blue-100 text-blue-700 border-blue-300' },
  boutique:  { label: 'Boutique',   color: 'bg-pink-100 text-pink-700 border-pink-300' },
  crossfit:  { label: 'CrossFit',   color: 'bg-red-100 text-red-700 border-red-300' },
  pilates:   { label: 'Pilates',    color: 'bg-teal-100 text-teal-700 border-teal-300' },
  other:     { label: 'Other',      color: 'bg-gray-100 text-gray-700 border-gray-300' },
}

function typeMeta(t) { return TYPE_META[t] || TYPE_META.other }

function Stars({ value, max = 5, size = 14 }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star key={i} size={size}
          className={i < value ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 fill-gray-200'} />
      ))}
    </div>
  )
}

function Logo({ competitor, size = 10 }) {
  const [failed, setFailed] = useState(false)
  const s = `w-${size} h-${size}`
  const initials = competitor.name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()
  const colors = ['bg-blue-600','bg-purple-600','bg-pink-600','bg-orange-600','bg-teal-600','bg-red-700']
  const color  = colors[competitor.name.charCodeAt(0) % colors.length]

  if (competitor.logo_url && !failed) {
    return (
      <img src={competitor.logo_url} alt={competitor.name}
        onError={() => setFailed(true)}
        className={`${s} object-contain rounded-lg bg-white border border-gray-100 p-1 flex-shrink-0`} />
    )
  }
  return (
    <div className={`${s} ${color} rounded-lg flex items-center justify-center flex-shrink-0`}>
      <span className="text-white font-bold text-sm">{initials}</span>
    </div>
  )
}

// ─── Competitor Card ──────────────────────────────────────────────────────────
function CompetitorCard({ comp, isOwnerOrManager, onEdit, onDelete, onCompare, onLogVisit }) {
  const [expanded, setExpanded] = useState(false)
  const tm = typeMeta(comp.type)

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* Color bar by type */}
      <div className={`h-1 ${comp.type === 'hot_yoga' ? 'bg-orange-500' : comp.type === 'gym' ? 'bg-blue-500' : comp.type === 'boutique' ? 'bg-pink-500' : comp.type === 'yoga' ? 'bg-purple-500' : 'bg-gray-400'}`} />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Logo competitor={comp} size={12} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-gray-900 text-sm">{comp.name}</h3>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tm.color}`}>{tm.label}</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{comp.city}</p>
          </div>
          {isOwnerOrManager && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button onClick={() => onEdit(comp)} className="p-1.5 text-gray-300 hover:text-gray-600 rounded transition-colors"><Edit2 size={12} /></button>
              <button onClick={() => onDelete(comp.id)} className="p-1.5 text-gray-300 hover:text-red-500 rounded transition-colors"><Trash2 size={12} /></button>
            </div>
          )}
        </div>

        {/* Pricing */}
        <div className="flex items-center gap-3 mt-3">
          {comp.price_monthly && (
            <div className="flex items-center gap-1 text-xs font-semibold text-gray-700">
              <DollarSign size={12} className="text-gray-400" />
              ${comp.price_monthly}/mo
            </div>
          )}
          {comp.price_drop_in && (
            <div className="text-xs text-gray-500">${comp.price_drop_in} drop-in</div>
          )}
          {comp.price_trial && (
            <div className="text-xs text-green-600 font-medium">{comp.price_trial}</div>
          )}
        </div>

        {/* Description */}
        {comp.description && (
          <p className="text-xs text-gray-500 mt-2 leading-relaxed line-clamp-2">{comp.description}</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button onClick={() => onCompare(comp)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors">
            <Swords size={11} /> Compare
          </button>
          <button onClick={() => onLogVisit(comp)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 hover:border-gray-400 text-gray-700 text-xs font-medium rounded-lg transition-colors">
            <ClipboardList size={11} /> Log Visit
          </button>
          {comp.website && (
            <a href={`https://${comp.website.replace(/^https?:\/\//,'')}`} target="_blank" rel="noopener noreferrer"
              className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors rounded"><ExternalLink size={13} /></a>
          )}
          {comp.instagram && (
            <a href={`https://instagram.com/${comp.instagram.replace('@','')}`} target="_blank" rel="noopener noreferrer"
              className="p-1.5 text-gray-400 hover:text-pink-500 transition-colors rounded text-xs font-bold">IG</a>
          )}
          {comp.phone && (
            <a href={`tel:${comp.phone}`} className="p-1.5 text-gray-400 hover:text-green-500 transition-colors rounded"><Phone size={13} /></a>
          )}
          <button onClick={() => setExpanded(e => !e)} className="ml-auto p-1.5 text-gray-300 hover:text-gray-600 rounded transition-colors">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* Expanded — strengths vs advantages */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Their Strengths</p>
              <ul className="space-y-1">
                {(comp.their_strengths || []).map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                    <AlertTriangle size={10} className="text-amber-400 flex-shrink-0 mt-0.5" />{s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Why We Win</p>
              <ul className="space-y-1">
                {(comp.our_advantages || []).map((a, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                    <Check size={10} className="text-green-500 flex-shrink-0 mt-0.5" />{a}
                  </li>
                ))}
              </ul>
            </div>
            {comp.ai_summary && (
              <div className="col-span-2 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
                <p className="text-[10px] font-bold text-purple-500 uppercase tracking-wide mb-1 flex items-center gap-1"><Sparkles size={9} />AI Intel</p>
                <p className="text-xs text-gray-700 leading-relaxed">{comp.ai_summary}</p>
                {comp.ai_last_updated && (
                  <p className="text-[10px] text-gray-400 mt-1">Updated {new Date(comp.ai_last_updated).toLocaleDateString()}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Compare Modal ────────────────────────────────────────────────────────────
function CompareModal({ competitor, onClose }) {
  const rows = [
    { label: 'Monthly Price',    hw: `$${HOTWORX.price_monthly}/mo`,          them: competitor.price_monthly ? `$${competitor.price_monthly}/mo` : '—', hwWins: !competitor.price_monthly || HOTWORX.price_monthly <= competitor.price_monthly },
    { label: 'Drop-In',         hw: 'Members only',                           them: competitor.price_drop_in ? `$${competitor.price_drop_in}` : '—', hwWins: true },
    { label: 'Free Trial',      hw: HOTWORX.price_trial,                      them: competitor.price_trial || 'None', hwWins: true },
    { label: 'Hours',           hw: '24 / 7',                                 them: 'Class schedule only', hwWins: true },
    { label: 'Infrared Heat',   hw: '✅ Yes — metabolic boost',               them: '❌ No', hwWins: true },
    { label: 'Private Pods',    hw: '✅ Your own space',                      them: '❌ Shared studio/floor', hwWins: true },
    { label: 'Guided Workouts', hw: '✅ Every session',                       them: competitor.type === 'gym' ? '❌ Solo, no guidance' : '✅ Live instructor', hwWins: competitor.type === 'gym' },
    { label: 'Class Formats',   hw: HOTWORX.formats.join(', '),              them: competitor.type === 'gym' ? 'General fitness only' : competitor.type === 'hot_yoga' ? 'Yoga / Pilates' : 'Varies', hwWins: true },
    { label: 'No Contract',     hw: '✅ Month-to-month',                      them: competitor.type === 'gym' ? 'Often annual' : '✅ Month-to-month', hwWins: true },
    { label: 'Crowd Factor',    hw: '✅ Zero wait — private pod',             them: competitor.type === 'gym' ? '❌ Peak hour waits' : '❌ Class capacity limits', hwWins: true },
  ]

  const hotworxWins = rows.filter(r => r.hwWins).length
  const themWins    = rows.filter(r => !r.hwWins).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gray-900 px-6 py-5 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center mx-auto mb-1">
                <span className="text-white font-bold text-sm">H</span>
              </div>
              <p className="text-white text-xs font-bold">HOTWORX</p>
            </div>
            <div className="text-white text-lg font-bold">vs</div>
            <div className="text-center">
              <div className="mx-auto mb-1"><Logo competitor={competitor} size={10} /></div>
              <p className="text-white text-xs font-bold">{competitor.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>

        {/* Score banner */}
        <div className="flex bg-gray-50 border-b border-gray-200">
          <div className="flex-1 text-center py-3">
            <p className="text-2xl font-black text-red-600">{hotworxWins}</p>
            <p className="text-xs text-gray-500 font-medium">HOTWORX Wins</p>
          </div>
          <div className="flex-1 text-center py-3 border-x border-gray-200">
            <p className="text-2xl font-black text-gray-500">{themWins}</p>
            <p className="text-xs text-gray-500 font-medium">{competitor.name} Wins</p>
          </div>
          <div className="flex-1 text-center py-3">
            <p className="text-sm font-bold text-green-600">HOTWORX Favored</p>
            <p className="text-xs text-gray-400">{Math.round(hotworxWins / rows.length * 100)}% of categories</p>
          </div>
        </div>

        {/* Comparison rows */}
        <div className="px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide">
                <th className="text-left pb-3 w-1/4">Category</th>
                <th className="text-left pb-3 w-5/12 text-red-600">HOTWORX</th>
                <th className="text-left pb-3 w-5/12">{competitor.name}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, i) => (
                <tr key={i} className={row.hwWins ? 'bg-green-50/30' : ''}>
                  <td className="py-2.5 text-xs font-semibold text-gray-500">{row.label}</td>
                  <td className="py-2.5">
                    <span className={`text-xs font-medium ${row.hwWins ? 'text-green-700' : 'text-gray-700'}`}>
                      {row.hwWins && <Trophy size={10} className="inline mr-1 text-green-500" />}
                      {row.hw}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <span className={`text-xs ${!row.hwWins ? 'font-medium text-gray-800' : 'text-gray-400'}`}>
                      {!row.hwWins && <Trophy size={10} className="inline mr-1 text-amber-400" />}
                      {row.them}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Objection handlers */}
          {(competitor.objection_handlers || []).length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">Objection Handlers</p>
              <div className="space-y-2">
                {competitor.objection_handlers.map((oh, i) => (
                  <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2.5 flex items-start gap-2">
                      <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs font-semibold text-gray-700">"{oh.objection}"</p>
                    </div>
                    <div className="bg-white px-4 py-2.5 flex items-start gap-2">
                      <Check size={13} className="text-green-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-gray-600 leading-relaxed">{oh.response}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Visit Log Modal ──────────────────────────────────────────────────────────
function VisitLogModal({ competitor, onClose, onSaved }) {
  const [form, setForm] = useState({ visited_at: new Date().toLocaleDateString('en-CA'), tried_class: false, class_name: '', observations: '', pricing_observed: '', staff_notes: '', cleanliness: 3, equipment: 3, overall: 3 })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const saved = await apiPost(`/api/competitors/${competitor.id}/visits`, form)
      onSaved(saved)
      onClose()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600'
  const StarPicker = ({ label, field }) => (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{label}</p>
      <div className="flex gap-1">
        {[1,2,3,4,5].map(n => (
          <button key={n} type="button" onClick={() => set(field, n)}>
            <Star size={20} className={n <= form[field] ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 fill-gray-200'} />
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <form className="bg-white rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} onSubmit={handleSave}>
        <div className="bg-gray-900 px-5 py-4 rounded-t-xl flex items-center justify-between">
          <div>
            <p className="text-white font-bold">Log Visit</p>
            <p className="text-gray-400 text-xs">{competitor.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Visit Date</label>
              <input type="date" className={inp} value={form.visited_at} onChange={e => set('visited_at', e.target.value)} />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.tried_class} onChange={e => set('tried_class', e.target.checked)} className="accent-red-600 w-4 h-4" />
                <span className="text-sm text-gray-700 font-medium">Tried a class</span>
              </label>
            </div>
          </div>

          {form.tried_class && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Class Name</label>
              <input className={inp} value={form.class_name} onChange={e => set('class_name', e.target.value)} placeholder="e.g. Hot Yoga Flow" />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Observations</label>
            <textarea rows={3} className={`${inp} resize-none`} value={form.observations} onChange={e => set('observations', e.target.value)} placeholder="What did you see? Member count, energy, equipment, experience..." />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Pricing Observed</label>
            <input className={inp} value={form.pricing_observed} onChange={e => set('pricing_observed', e.target.value)} placeholder="Any prices seen on signage, website, or mentioned by staff" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Staff Notes</label>
            <input className={inp} value={form.staff_notes} onChange={e => set('staff_notes', e.target.value)} placeholder="How was the sales pitch? Were they pushy?" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StarPicker label="Cleanliness" field="cleanliness" />
            <StarPicker label="Equipment" field="equipment" />
            <StarPicker label="Overall" field="overall" />
          </div>
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-gray-200">
          <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 text-sm py-2 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Visit'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Visit History Panel ──────────────────────────────────────────────────────
function VisitHistory({ competitor }) {
  const [visits, setVisits] = useState(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const load = async () => {
    if (visits !== null) return
    setLoading(true)
    try { setVisits(await apiGet(`/api/competitors/${competitor.id}/visits`)) }
    finally { setLoading(false) }
  }

  const toggle = () => { setOpen(o => !o); if (!open) load() }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-semibold text-gray-700">
        <span className="flex items-center gap-2"><ClipboardList size={14} />{competitor.name}</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="divide-y divide-gray-100">
          {loading && <p className="text-xs text-gray-400 p-4">Loading…</p>}
          {!loading && visits?.length === 0 && <p className="text-xs text-gray-400 p-4 italic">No visits logged yet.</p>}
          {(visits || []).map(v => (
            <div key={v.id} className="px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 text-xs">
                  <User size={11} className="text-gray-400" />
                  <span className="font-medium text-gray-700">{v.visitor_name}</span>
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-500">{new Date(v.visited_at + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}</span>
                  {v.tried_class && <span className="bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded text-[10px] font-medium">Tried class{v.class_name ? `: ${v.class_name}` : ''}</span>}
                </div>
                <div className="flex gap-1">
                  {v.overall && <Stars value={v.overall} max={5} size={11} />}
                </div>
              </div>
              {v.observations && <p className="text-xs text-gray-600 mt-1">{v.observations}</p>}
              {v.pricing_observed && <p className="text-xs text-blue-600 mt-1">💰 {v.pricing_observed}</p>}
              {v.staff_notes && <p className="text-xs text-gray-500 mt-1 italic">Staff: {v.staff_notes}</p>}
              {(v.cleanliness || v.equipment) && (
                <div className="flex gap-3 mt-1.5">
                  {v.cleanliness && <span className="text-[11px] text-gray-400">Cleanliness: <span className="text-gray-600">{v.cleanliness}/5</span></span>}
                  {v.equipment && <span className="text-[11px] text-gray-400">Equipment: <span className="text-gray-600">{v.equipment}/5</span></span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Map View ─────────────────────────────────────────────────────────────────
function MapView({ competitors, onCompare, onLogVisit }) {
  const HOTWORX_LAT = 43.0826, HOTWORX_LNG = -88.2315

  // Simple SVG pin map using lat/lng projection
  const allPoints = [
    { lat: HOTWORX_LAT, lng: HOTWORX_LNG, isHotworx: true },
    ...competitors.filter(c => c.latitude && c.longitude).map(c => ({ lat: c.latitude, lng: c.longitude, comp: c })),
  ]
  const lats = allPoints.map(p => p.lat)
  const lngs = allPoints.map(p => p.lng)
  const minLat = Math.min(...lats) - 0.05, maxLat = Math.max(...lats) + 0.05
  const minLng = Math.min(...lngs) - 0.05, maxLng = Math.max(...lngs) + 0.05

  const W = 800, H = 450
  const toX = lng => ((lng - minLng) / (maxLng - minLng)) * (W - 80) + 40
  const toY = lat => ((maxLat - lat) / (maxLat - minLat)) * (H - 80) + 40

  const [hovered, setHovered] = useState(null)

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2"><MapPin size={15} className="text-red-600" />Competitor Map</h3>
        <div className="flex gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-600 inline-block" />HOTWORX</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-400 inline-block" />Hot Yoga</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />Gym</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-pink-500 inline-block" />Boutique</span>
        </div>
      </div>
      <div className="relative bg-slate-50 overflow-hidden" style={{ height: 450 }}>
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0">
          {/* Grid lines */}
          {[0.2,0.4,0.6,0.8].map(f => (
            <g key={f}>
              <line x1={W*f} y1={0} x2={W*f} y2={H} stroke="#e5e7eb" strokeWidth={1} />
              <line x1={0} y1={H*f} x2={W} y2={H*f} stroke="#e5e7eb" strokeWidth={1} />
            </g>
          ))}

          {/* HOTWORX star */}
          <g transform={`translate(${toX(HOTWORX_LNG)},${toY(HOTWORX_LAT)})`}>
            <circle r={18} fill="#C8102E" opacity={0.15} />
            <circle r={10} fill="#C8102E" />
            <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize={10} fontWeight="bold">H</text>
            <text textAnchor="middle" y={24} fill="#C8102E" fontSize={9} fontWeight="bold">HOTWORX</text>
          </g>

          {/* Competitor pins */}
          {competitors.filter(c => c.latitude && c.longitude).map(c => {
            const x = toX(c.longitude), y = toY(c.latitude)
            const pinColor = c.type === 'hot_yoga' ? '#f97316' : c.type === 'gym' ? '#3b82f6' : c.type === 'boutique' ? '#ec4899' : c.type === 'yoga' ? '#a855f7' : '#6b7280'
            const isHov = hovered === c.id
            return (
              <g key={c.id} transform={`translate(${x},${y})`}
                onMouseEnter={() => setHovered(c.id)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'pointer' }}>
                <circle r={isHov ? 14 : 10} fill={pinColor} opacity={isHov ? 1 : 0.85} />
                <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize={8} fontWeight="bold">
                  {c.name.split(' ').slice(0,2).map(w=>w[0]).join('')}
                </text>
                {isHov && (
                  <g>
                    <rect x={-80} y={16} width={160} height={52} rx={6} fill="white" stroke="#e5e7eb" strokeWidth={1} filter="url(#shadow)" />
                    <text x={0} y={30} textAnchor="middle" fill="#111827" fontSize={9} fontWeight="bold">{c.name}</text>
                    <text x={0} y={44} textAnchor="middle" fill="#6b7280" fontSize={8}>{c.city}</text>
                    {c.price_monthly && <text x={0} y={58} textAnchor="middle" fill="#059669" fontSize={8} fontWeight="bold">${c.price_monthly}/mo</text>}
                  </g>
                )}
              </g>
            )
          })}
          <defs>
            <filter id="shadow"><feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.15"/></filter>
          </defs>
        </svg>
      </div>
      {/* Competitor list below map */}
      <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-2">
        {competitors.filter(c => c.latitude && c.longitude).map(c => {
          const tm = typeMeta(c.type)
          return (
            <button key={c.id} onClick={() => onCompare(c)}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:border-red-300 hover:bg-red-50 transition-colors text-left">
              <Logo competitor={c} size={7} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">{c.name}</p>
                <p className="text-[10px] text-gray-400">{c.city}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Add/Edit Modal ───────────────────────────────────────────────────────────
function EditCompetitorModal({ competitor, onClose, onSaved }) {
  const isNew = !competitor?.id
  const [form, setForm] = useState(competitor || {
    name:'', type:'gym', city:'', address:'', phone:'', website:'', instagram:'',
    logo_url:'', description:'', price_monthly:'', price_drop_in:'', price_trial:'',
    their_strengths:[], our_advantages:[], notes:'',
  })
  const [saving,      setSaving]    = useState(false)
  const [uploading,   setUploading] = useState(false)
  const [error,       setError]     = useState('')
  const logoInputRef  = useRef(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['jpg','jpeg','png','webp','svg'].includes(ext)) { setError('Logo must be JPG, PNG, WebP, or SVG'); return }
    setUploading(true); setError('')
    try {
      const path = `competitor-logos/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage.from('b2b-logos').upload(path, file, { upsert: false, contentType: file.type })
      if (upErr) { setError(upErr.message); return }
      const { data: { publicUrl } } = supabase.storage.from('b2b-logos').getPublicUrl(path)
      set('logo_url', publicUrl)
    } finally { setUploading(false); e.target.value = '' }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.name) { setError('Name is required'); return }
    setSaving(true)
    try {
      const payload = { ...form,
        price_monthly: form.price_monthly ? parseFloat(form.price_monthly) : null,
        price_drop_in: form.price_drop_in ? parseFloat(form.price_drop_in) : null,
        their_strengths: typeof form.their_strengths === 'string' ? form.their_strengths.split('\n').filter(Boolean) : form.their_strengths,
        our_advantages: typeof form.our_advantages === 'string' ? form.our_advantages.split('\n').filter(Boolean) : form.our_advantages,
      }
      const saved = isNew
        ? await apiPost('/api/competitors', payload)
        : await apiPut(`/api/competitors/${competitor.id}`, payload)
      onSaved(saved, isNew)
      onClose()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <form className="bg-white rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} onSubmit={handleSave}>
        <div className="bg-gray-900 px-5 py-4 rounded-t-xl flex items-center justify-between">
          <h2 className="text-white font-bold">{isNew ? 'Add Competitor' : 'Edit Competitor'}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white"><X size={18}/></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="block text-xs font-semibold text-gray-700 mb-1">Name *</label><input className={inp} value={form.name} onChange={e => set('name',e.target.value)} placeholder="Planet Fitness" /></div>
            <div><label className="block text-xs font-semibold text-gray-700 mb-1">Type</label>
              <select className={inp} value={form.type} onChange={e => set('type',e.target.value)}>
                {Object.entries(TYPE_META).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div><label className="block text-xs font-semibold text-gray-700 mb-1">City</label><input className={inp} value={form.city} onChange={e => set('city',e.target.value)} placeholder="Pewaukee" /></div>
            <div className="col-span-2"><label className="block text-xs font-semibold text-gray-700 mb-1">Address</label><input className={inp} value={form.address} onChange={e => set('address',e.target.value)} /></div>
            <div><label className="block text-xs font-semibold text-gray-700 mb-1">Phone</label><input className={inp} value={form.phone} onChange={e => set('phone',e.target.value)} /></div>
            <div><label className="block text-xs font-semibold text-gray-700 mb-1">Website</label><input className={inp} value={form.website} onChange={e => set('website',e.target.value)} placeholder="example.com" /></div>
            <div><label className="block text-xs font-semibold text-gray-700 mb-1">Instagram</label><input className={inp} value={form.instagram} onChange={e => set('instagram',e.target.value)} placeholder="@handle" /></div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Logo</label>
              <div className="flex items-center gap-3">
                {form.logo_url
                  ? <img src={form.logo_url} alt="Logo" className="w-12 h-12 rounded-lg object-contain bg-gray-50 border border-gray-200 p-1 flex-shrink-0" onError={e => e.target.style.display='none'} />
                  : <div className="w-12 h-12 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 flex-shrink-0"><ImagePlus size={18} className="text-gray-400" /></div>
                }
                <div className="space-y-1 flex-1">
                  <button type="button" onClick={() => logoInputRef.current?.click()} disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-red-600 text-red-600 hover:bg-red-600 hover:text-white rounded-lg transition-colors disabled:opacity-50">
                    {uploading ? <><Loader2 size={11} className="animate-spin" />Uploading…</> : <><ImagePlus size={11} />{form.logo_url ? 'Change Logo' : 'Upload Logo'}</>}
                  </button>
                  {form.logo_url && <button type="button" onClick={() => set('logo_url','')} className="block text-xs text-gray-400 hover:text-red-500 transition-colors">Remove</button>}
                  <p className="text-[10px] text-gray-400">Or paste URL: <input className="border-b border-gray-200 text-xs px-1 py-0.5 focus:outline-none focus:border-red-400 w-40" value={form.logo_url} onChange={e => set('logo_url',e.target.value)} placeholder="https://…" /></p>
                </div>
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleLogoUpload} />
              </div>
            </div>
            <div><label className="block text-xs font-semibold text-gray-700 mb-1">Monthly Price $</label><input type="number" className={inp} value={form.price_monthly} onChange={e => set('price_monthly',e.target.value)} /></div>
            <div><label className="block text-xs font-semibold text-gray-700 mb-1">Drop-In $</label><input type="number" className={inp} value={form.price_drop_in} onChange={e => set('price_drop_in',e.target.value)} /></div>
            <div className="col-span-2"><label className="block text-xs font-semibold text-gray-700 mb-1">Trial Offer</label><input className={inp} value={form.price_trial} onChange={e => set('price_trial',e.target.value)} placeholder="First class free" /></div>
            <div className="col-span-2"><label className="block text-xs font-semibold text-gray-700 mb-1">Description</label><textarea rows={2} className={`${inp} resize-none`} value={form.description} onChange={e => set('description',e.target.value)} /></div>
            <div className="col-span-2"><label className="block text-xs font-semibold text-gray-700 mb-1">Their Strengths (one per line)</label><textarea rows={3} className={`${inp} resize-none`} value={Array.isArray(form.their_strengths) ? form.their_strengths.join('\n') : form.their_strengths} onChange={e => set('their_strengths',e.target.value)} /></div>
            <div className="col-span-2"><label className="block text-xs font-semibold text-gray-700 mb-1">Why HOTWORX Wins (one per line)</label><textarea rows={3} className={`${inp} resize-none`} value={Array.isArray(form.our_advantages) ? form.our_advantages.join('\n') : form.our_advantages} onChange={e => set('our_advantages',e.target.value)} /></div>
            <div className="col-span-2"><label className="block text-xs font-semibold text-gray-700 mb-1">Internal Notes</label><textarea rows={2} className={`${inp} resize-none`} value={form.notes} onChange={e => set('notes',e.target.value)} /></div>
          </div>
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-gray-200">
          <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 text-sm py-2 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50">
            {saving ? 'Saving…' : isNew ? 'Add Competitor' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CompetitorsPage() {
  const { role } = useRole()
  const isOwnerOrManager = role === 'owner' || role === 'manager'

  const [competitors, setCompetitors] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [tab,         setTab]         = useState('overview')
  const [compareComp, setCompareComp] = useState(null)
  const [visitComp,   setVisitComp]   = useState(null)
  const [editComp,    setEditComp]    = useState(null)
  const [filterType,  setFilterType]  = useState('')
  const [error,       setError]       = useState('')

  const load = useCallback(async () => {
    try { setCompetitors(await apiGet('/api/competitors')) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAiRefresh = async () => {
    setRefreshing(true)
    try {
      const res = await apiPost('/api/competitors/ai-refresh', {})
      // Merge updated data back
      setCompetitors(prev => prev.map(c => {
        const upd = res.updates?.find(u => u.id === c.id)
        return upd ? { ...c, ai_summary: upd.ai_summary, ai_last_updated: upd.ai_last_updated, price_monthly: upd.price_monthly || c.price_monthly } : c
      }))
    } catch (e) { setError(e.message) }
    finally { setRefreshing(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this competitor?')) return
    await apiDelete(`/api/competitors/${id}`)
    setCompetitors(prev => prev.filter(c => c.id !== id))
  }

  const handleSaved = (saved, isNew) => {
    setCompetitors(prev => isNew ? [...prev, saved] : prev.map(c => c.id === saved.id ? saved : c))
  }

  const filtered = filterType ? competitors.filter(c => c.type === filterType) : competitors

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'map',      label: 'Map' },
    { key: 'compare',  label: 'Compare' },
    { key: 'visits',   label: 'Visit Logs' },
  ]

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Swords size={22} className="text-red-600" /> Competitive Intel
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {competitors.length} competitors tracked · Know who you're up against
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isOwnerOrManager && (
            <button onClick={handleAiRefresh} disabled={refreshing}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${refreshing ? 'border-purple-300 text-purple-600 bg-purple-50' : 'border-gray-300 text-gray-600 hover:border-purple-400 hover:text-purple-600 bg-white'}`}>
              {refreshing
                ? <><RefreshCw size={14} className="animate-spin" />Researching…</>
                : <><Sparkles size={14} />AI Refresh</>}
            </button>
          )}
          {isOwnerOrManager && (
            <button onClick={() => setEditComp({})}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors">
              <Plus size={16} />Add Competitor
            </button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {t.label}
          </button>
        ))}
        {/* Type filter — overview only */}
        {tab === 'overview' && (
          <div className="ml-auto flex items-center">
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-red-600">
              <option value="">All types</option>
              {Object.entries(TYPE_META).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(c => (
            <CompetitorCard key={c.id} comp={c}
              isOwnerOrManager={isOwnerOrManager}
              onEdit={setEditComp}
              onDelete={handleDelete}
              onCompare={setCompareComp}
              onLogVisit={setVisitComp}
            />
          ))}
        </div>
      )}

      {/* ── Map ── */}
      {tab === 'map' && (
        <MapView competitors={competitors} onCompare={setCompareComp} onLogVisit={setVisitComp} />
      )}

      {/* ── Compare ── */}
      {tab === 'compare' && (
        <div>
          <p className="text-sm text-gray-500 mb-4">Select a competitor to see a side-by-side breakdown of why HOTWORX wins.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {competitors.map(c => (
              <button key={c.id} onClick={() => setCompareComp(c)}
                className="flex flex-col items-center gap-2 p-4 border border-gray-200 rounded-xl hover:border-red-400 hover:shadow-md transition-all bg-white text-center">
                <Logo competitor={c} size={12} />
                <div>
                  <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-400">{c.city}</p>
                  {c.price_monthly && <p className="text-xs text-green-600 font-medium mt-1">${c.price_monthly}/mo</p>}
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${typeMeta(c.type).color}`}>
                  {typeMeta(c.type).label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Visit Logs ── */}
      {tab === 'visits' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-500">Log visits to stay sharp on what competitors are doing.</p>
            <button onClick={() => setVisitComp(competitors[0])}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg">
              <Plus size={14} />Log a Visit
            </button>
          </div>
          {competitors.map(c => <VisitHistory key={c.id} competitor={c} />)}
        </div>
      )}

      {/* ── Modals ── */}
      {compareComp && <CompareModal competitor={compareComp} onClose={() => setCompareComp(null)} />}
      {visitComp   && <VisitLogModal competitor={visitComp} onClose={() => setVisitComp(null)} onSaved={() => {}} />}
      {editComp !== null && (
        <EditCompetitorModal
          competitor={editComp.id ? editComp : null}
          onClose={() => setEditComp(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
