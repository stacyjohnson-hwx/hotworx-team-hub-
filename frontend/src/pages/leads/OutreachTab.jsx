import { useState, useEffect, useCallback, useRef } from 'react'
import { useRole } from '@/hooks/useRole'
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from '@/hooks/useApi'
import {
  Phone, MessageSquare, ChevronDown, ChevronUp, Plus, Trash2,
  Edit2, Check, X, ArrowUp, ArrowDown, Upload, Users,
  BookOpen, MapPin, ClipboardList, AlertCircle, ChevronRight, RefreshCw,
} from 'lucide-react'

// ─── Color map ────────────────────────────────────────────────────────────────
const COLOR_MAP = {
  red:    { bar: 'bg-red-500',    badge: 'bg-red-100 text-red-700 border-red-200',    ring: 'ring-red-200'    },
  green:  { bar: 'bg-green-500',  badge: 'bg-green-100 text-green-700 border-green-200',  ring: 'ring-green-200'  },
  orange: { bar: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700 border-orange-200', ring: 'ring-orange-200' },
  blue:   { bar: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-700 border-blue-200',   ring: 'ring-blue-200'   },
  purple: { bar: 'bg-purple-500', badge: 'bg-purple-100 text-purple-700 border-purple-200', ring: 'ring-purple-200' },
  amber:  { bar: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700 border-amber-200',  ring: 'ring-amber-200'  },
  teal:   { bar: 'bg-teal-500',   badge: 'bg-teal-100 text-teal-700 border-teal-200',   ring: 'ring-teal-200'   },
  gray:   { bar: 'bg-gray-400',   badge: 'bg-gray-100 text-gray-600 border-gray-200',   ring: 'ring-gray-200'   },
}
const COLORS = Object.keys(COLOR_MAP)
const COLOR_LABELS = { red:'Red', green:'Green', orange:'Orange', blue:'Blue', purple:'Purple', amber:'Amber', teal:'Teal', gray:'Gray' }

const OUTCOME_OPTIONS = [
  { value: 'vm',             label: 'Left Voicemail' },
  { value: 'connected',      label: 'Connected'      },
  { value: 'follow_up',      label: 'Follow Up'      },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'joined',         label: 'Joined / Booked'},
]
const OUTCOME_COLORS = {
  vm:             'bg-gray-100 text-gray-600',
  connected:      'bg-blue-100 text-blue-700',
  follow_up:      'bg-amber-100 text-amber-700',
  not_interested: 'bg-red-100 text-red-600',
  joined:         'bg-green-100 text-green-700',
}

// ─── Counter button ───────────────────────────────────────────────────────────
function Counter({ label, icon: Icon, value, onIncrement, onDecrement, color }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={15} className={color} />
      <span className="text-xs text-gray-500 w-10">{label}</span>
      <button
        onClick={onDecrement}
        disabled={value <= 0}
        className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-bold leading-none"
      >−</button>
      <span className="text-base font-bold text-gray-800 w-6 text-center">{value}</span>
      <button
        onClick={onIncrement}
        className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors text-sm font-bold leading-none"
      >+</button>
    </div>
  )
}

// ─── Import modal ─────────────────────────────────────────────────────────────
function ImportModal({ tile, onClose, onImported }) {
  const [raw, setRaw] = useState('')
  const [clearExisting, setClearExisting] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleImport = async () => {
    const names = raw.split(/[\n,]+/).map(n => n.trim()).filter(Boolean)
    if (!names.length) { setError('Paste at least one name'); return }
    setSaving(true)
    setError('')
    try {
      await apiPost(`/api/outreach/tiles/${tile.id}/contacts/import`, { names, clearExisting })
      onImported()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Import Contact List</h2>
            <p className="text-xs text-gray-500 mt-0.5">{tile.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">
              Paste names (one per line, or comma-separated)
            </label>
            <textarea
              value={raw}
              onChange={e => setRaw(e.target.value)}
              placeholder={"Sarah Johnson\nMike Torres\nAngie Webb"}
              rows={8}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-400"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              {raw.split(/[\n,]+/).filter(n => n.trim()).length} names detected
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={clearExisting}
              onChange={e => setClearExisting(e.target.checked)}
              className="rounded"
            />
            <span className="text-xs text-gray-600">Replace existing pending contacts</span>
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={handleImport}
            disabled={saving || !raw.trim()}
            className="flex-1 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit tile modal ──────────────────────────────────────────────────────────
const BLANK_TILE = { title: '', description: '', script: '', crm_instructions: '', color: 'blue' }

function TileModal({ tile, onClose, onSaved }) {
  const [form, setForm] = useState(tile ? {
    title: tile.title || '',
    description: tile.description || '',
    script: tile.script || '',
    crm_instructions: tile.crm_instructions || '',
    color: tile.color || 'blue',
  } : { ...BLANK_TILE })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true); setError('')
    try {
      const saved = tile?.id
        ? await apiPut(`/api/outreach/tiles/${tile.id}`, form)
        : await apiPost('/api/outreach/tiles', form)
      onSaved(saved)
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{tile ? 'Edit Tile' : 'New Outreach Tile'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Title *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              placeholder="e.g. Cancelled Members" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-400"
              placeholder="Brief description of who this list is and the goal of the call" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Call Script</label>
            <textarea value={form.script} onChange={e => set('script', e.target.value)}
              rows={5} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-400"
              placeholder="Write the script TSAs should follow when calling this list…" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">
              How to Find This List in SAIL
            </label>
            <textarea value={form.crm_instructions} onChange={e => set('crm_instructions', e.target.value)}
              rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-400"
              placeholder="Step-by-step: In SAIL → go to… → filter by…" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-2 block">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button key={c} onClick={() => set('color', c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${COLOR_MAP[c].bar} ${form.color === c ? 'border-gray-700 scale-110' : 'border-transparent opacity-60 hover:opacity-100'}`}
                  title={COLOR_LABELS[c]}
                />
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2 text-sm bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-medium disabled:opacity-50">
            {saving ? 'Saving…' : tile ? 'Save Changes' : 'Create Tile'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Contact row ──────────────────────────────────────────────────────────────
function ContactRow({ contact, onChange }) {
  const [showOutcome, setShowOutcome] = useState(false)
  const isDone = contact.status === 'done' || contact.status === 'called'

  // Update a contact's status/outcome via the PATCH endpoint
  const patch = async (payload) => {
    try {
      return await apiPatch(`/api/outreach/contacts/${contact.id}`, payload)
    } catch { return null }
  }

  return (
    <div className={`flex items-center gap-2 py-2 border-b border-gray-50 last:border-0 ${isDone ? 'opacity-60' : ''}`}>
      <button
        onClick={() => isDone ? patch({ status: 'pending', outcome: null }).then(u => u && onChange(u)) : setShowOutcome(v => !v)}
        className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isDone ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-green-400'}`}
      >
        {isDone && <Check size={10} className="text-white" />}
      </button>
      <span className={`flex-1 text-sm ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>{contact.name}</span>
      {contact.outcome && (
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${OUTCOME_COLORS[contact.outcome] || 'bg-gray-100 text-gray-500'}`}>
          {OUTCOME_OPTIONS.find(o => o.value === contact.outcome)?.label || contact.outcome}
        </span>
      )}
      {showOutcome && (
        <div className="absolute right-4 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 py-1 min-w-[160px]">
          {OUTCOME_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => patch({ status: 'done', outcome: opt.value }).then(u => u && onChange(u)).finally(() => setShowOutcome(false))}
              className="w-full text-left px-4 py-2 text-xs hover:bg-gray-50 text-gray-700">
              {opt.label}
            </button>
          ))}
          <button onClick={() => setShowOutcome(false)} className="w-full text-left px-4 py-2 text-xs hover:bg-gray-50 text-gray-400 border-t border-gray-100">Cancel</button>
        </div>
      )}
    </div>
  )
}

// ─── Single tile card ─────────────────────────────────────────────────────────
function TileCard({ tile, log, editMode, onEdit, onDelete, onMoveUp, onMoveDown, isFirst, isLast, onLogChange }) {
  const [expanded, setExpanded] = useState(false)
  const [showScript, setShowScript] = useState(false)
  const [showCRM, setShowCRM] = useState(false)
  const [contacts, setContacts] = useState(null)
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const colors = COLOR_MAP[tile.color] || COLOR_MAP.blue
  const totalCalls = log?.calls_made || 0
  const totalTexts = log?.texts_made || 0
  const hasActivity = totalCalls > 0 || totalTexts > 0

  const loadContacts = useCallback(async () => {
    if (contacts !== null) return
    setLoadingContacts(true)
    try {
      const data = await apiGet(`/api/outreach/tiles/${tile.id}/contacts`)
      setContacts(data)
    } catch {} finally { setLoadingContacts(false) }
  }, [tile.id, contacts])

  useEffect(() => {
    if (expanded) loadContacts()
  }, [expanded])

  const handleCountChange = async (field, delta) => {
    const newCalls = field === 'calls' ? Math.max(0, totalCalls + delta) : totalCalls
    const newTexts = field === 'texts' ? Math.max(0, totalTexts + delta) : totalTexts
    try {
      const updated = await apiPost('/api/outreach/logs/upsert', {
        tile_id: tile.id,
        calls_made: newCalls,
        texts_made: newTexts,
      })
      onLogChange(tile.id, updated)
    } catch {}
  }

  const handleDeleteTile = async () => {
    if (!window.confirm(`Delete "${tile.title}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await apiDelete(`/api/outreach/tiles/${tile.id}`)
      onDelete(tile.id)
    } catch { setDeleting(false) }
  }

  const handleClearContacts = async () => {
    if (!window.confirm('Clear all contacts for this tile?')) return
    await apiDelete(`/api/outreach/tiles/${tile.id}/contacts`)
    setContacts([])
  }

  const pendingContacts = (contacts || []).filter(c => c.status === 'pending')
  const doneContacts    = (contacts || []).filter(c => c.status === 'done' || c.status === 'called')
  const hasContacts     = contacts && contacts.length > 0

  return (
    <>
      <div className={`bg-white rounded-2xl border border-gray-200 overflow-hidden transition-shadow hover:shadow-md ${editMode ? 'ring-2 ring-dashed ring-gray-300' : ''}`}>

        {/* Color bar */}
        <div className={`h-1 ${colors.bar}`} />

        {/* Header row */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-start gap-3">
            {/* Edit mode controls */}
            {editMode && (
              <div className="flex flex-col gap-1 flex-shrink-0 mt-0.5">
                <button onClick={onMoveUp} disabled={isFirst} className="text-gray-300 hover:text-gray-600 disabled:opacity-20"><ArrowUp size={14} /></button>
                <button onClick={onMoveDown} disabled={isLast} className="text-gray-300 hover:text-gray-600 disabled:opacity-20"><ArrowDown size={14} /></button>
              </div>
            )}

            {/* Title + description */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-gray-900">{tile.title}</h3>
                {hasActivity && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${colors.badge}`}>
                    {totalCalls > 0 && `${totalCalls} call${totalCalls !== 1 ? 's' : ''}`}
                    {totalCalls > 0 && totalTexts > 0 && ' · '}
                    {totalTexts > 0 && `${totalTexts} text${totalTexts !== 1 ? 's' : ''}`}
                  </span>
                )}
              </div>
              {tile.description && (
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{tile.description}</p>
              )}
            </div>

            {/* Edit mode actions */}
            {editMode && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => onEdit(tile)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"><Edit2 size={14} /></button>
                <button onClick={handleDeleteTile} disabled={deleting} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"><Trash2 size={14} /></button>
              </div>
            )}

            {/* Expand toggle */}
            <button onClick={() => setExpanded(v => !v)} className="flex-shrink-0 text-gray-400 hover:text-gray-600 p-1">
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        {/* ── Expanded content ── */}
        {expanded && (
          <div className="px-4 pb-4 space-y-4 border-t border-gray-50 pt-3">

            {/* Script */}
            {tile.script && (
              <div>
                <button onClick={() => setShowScript(v => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 mb-1">
                  <BookOpen size={13} />
                  Call Script
                  {showScript ? <ChevronUp size={12} /> : <ChevronRight size={12} />}
                </button>
                {showScript && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-gray-700 leading-relaxed whitespace-pre-line">
                    {tile.script}
                  </div>
                )}
              </div>
            )}

            {/* CRM instructions */}
            {tile.crm_instructions && (
              <div>
                <button onClick={() => setShowCRM(v => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 mb-1">
                  <MapPin size={13} />
                  How to Find in SAIL
                  {showCRM ? <ChevronUp size={12} /> : <ChevronRight size={12} />}
                </button>
                {showCRM && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-gray-700 leading-relaxed whitespace-pre-line">
                    {tile.crm_instructions}
                  </div>
                )}
              </div>
            )}

            {/* Outreach counters */}
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-2">Today's Outreach</p>
              <div className="flex items-center gap-6 flex-wrap">
                <Counter
                  label="Calls"
                  icon={Phone}
                  value={totalCalls}
                  onIncrement={() => handleCountChange('calls', +1)}
                  onDecrement={() => handleCountChange('calls', -1)}
                  color="text-green-600"
                />
                <Counter
                  label="Texts"
                  icon={MessageSquare}
                  value={totalTexts}
                  onIncrement={() => handleCountChange('texts', +1)}
                  onDecrement={() => handleCountChange('texts', -1)}
                  color="text-blue-600"
                />
              </div>
            </div>

            {/* Contact list section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Users size={13} className="text-gray-400" />
                  <span className="text-xs font-medium text-gray-600">
                    {hasContacts
                      ? `Contact List · ${pendingContacts.length} pending, ${doneContacts.length} done`
                      : 'Contact List'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {hasContacts && (
                    <button onClick={handleClearContacts} className="text-[11px] text-red-400 hover:text-red-600 transition-colors">Clear list</button>
                  )}
                  <button
                    onClick={() => setShowImport(true)}
                    className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-medium transition-colors"
                  >
                    <Upload size={11} /> {hasContacts ? 'Replace list' : 'Import names'}
                  </button>
                </div>
              </div>

              {loadingContacts && (
                <div className="flex justify-center py-3">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {!loadingContacts && !hasContacts && (
                <div className="bg-gray-50 rounded-xl px-3 py-3 text-center">
                  <p className="text-[11px] text-gray-400">No list imported — using manual counter above.</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Manager can import names for a trackable checklist.</p>
                </div>
              )}

              {!loadingContacts && hasContacts && (
                <div className="relative">
                  {contacts.map(c => (
                    <ContactRow
                      key={c.id}
                      contact={c}
                      onChange={updated => setContacts(prev => prev.map(x => x.id === updated.id ? updated : x))}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showImport && (
        <ImportModal
          tile={tile}
          onClose={() => setShowImport(false)}
          onImported={() => { setContacts(null); loadContacts() }}
        />
      )}
    </>
  )
}

// ─── Main outreach tab ────────────────────────────────────────────────────────
export default function OutreachTab() {
  const { role } = useRole()
  const isOwnerOrManager = role === 'owner' || role === 'manager'

  const [tiles, setTiles]       = useState([])
  const [logs, setLogs]         = useState({})   // { [tile_id]: log }
  const [loading, setLoading]   = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [tileModal, setTileModal] = useState(null)  // null | false (new) | tile (edit)
  const [error, setError]       = useState('')
  const [syncing, setSyncing]   = useState(false)
  const [syncMsg, setSyncMsg]   = useState('')

  const load = useCallback(async () => {
    try {
      const [tilesData, logsData] = await Promise.all([
        apiGet('/api/outreach/tiles'),
        apiGet('/api/outreach/logs'),
      ])
      setTiles(tilesData)
      const logMap = {}
      for (const l of logsData) logMap[l.tile_id] = l
      setLogs(logMap)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSync = async () => {
    setSyncing(true); setSyncMsg('')
    try {
      const res = await apiPost('/api/outreach/sync', {})
      const counts = Object.entries(res.tiles || {}).map(([k, v]) => `${k}: ${v.inserted}${v.overflow ? `(+${v.overflow} over cap)` : ''}`).join(' · ')
      setSyncMsg(`Updated from Airtable — ${counts}`)
      await load()
    } catch (e) {
      setSyncMsg(e.message || 'Sync failed')
    } finally { setSyncing(false) }
  }

  const handleLogChange = (tileId, updated) => {
    setLogs(prev => ({ ...prev, [tileId]: updated }))
  }

  const handleTileSaved = (saved) => {
    setTiles(prev => {
      const idx = prev.findIndex(t => t.id === saved.id)
      return idx >= 0 ? prev.map((t, i) => i === idx ? saved : t) : [...prev, saved]
    })
  }

  const handleDeleteTile = (id) => {
    setTiles(prev => prev.filter(t => t.id !== id))
  }

  const handleMove = async (idx, dir) => {
    const next = [...tiles]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setTiles(next)
    try {
      await apiPost('/api/outreach/tiles/reorder', { orderedIds: next.map(t => t.id) })
    } catch {}
  }

  // Today's totals across all tiles
  const todayTotalCalls = Object.values(logs).reduce((s, l) => s + (l.calls_made || 0), 0)
  const todayTotalTexts = Object.values(logs).reduce((s, l) => s + (l.texts_made || 0), 0)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-4 max-w-3xl mx-auto">

      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Phone size={18} className="text-red-600" /> Outreach
          </h2>
          {isOwnerOrManager && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSync}
                disabled={syncing}
                title="Pull the latest call lists from Airtable"
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 disabled:opacity-50 transition-colors"
              >
                <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing…' : 'Sync from Airtable'}
              </button>
              <button
                onClick={() => setEditMode(v => !v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${editMode ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}
              >
                {editMode ? 'Done Editing' : 'Manage Tiles'}
              </button>
              {editMode && (
                <button
                  onClick={() => setTileModal(false)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  <Plus size={13} /> Add Tile
                </button>
              )}
            </div>
          )}
        </div>

        {syncMsg && (
          <div className="mb-3 text-xs px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-600">{syncMsg}</div>
        )}

        {/* Big daily totals */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-50 border border-green-100 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0">
              <Phone size={20} className="text-white" />
            </div>
            <div>
              <p className="text-3xl font-black text-green-700 leading-none">{todayTotalCalls}</p>
              <p className="text-xs text-green-600 font-medium mt-0.5">Calls Today</p>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
              <MessageSquare size={20} className="text-white" />
            </div>
            <div>
              <p className="text-3xl font-black text-blue-700 leading-none">{todayTotalTexts}</p>
              <p className="text-xs text-blue-600 font-medium mt-0.5">Texts Today</p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Tiles grid */}
      <div className="space-y-3">
        {tiles.map((tile, idx) => (
          <TileCard
            key={tile.id}
            tile={tile}
            log={logs[tile.id]}
            editMode={editMode}
            isFirst={idx === 0}
            isLast={idx === tiles.length - 1}
            onEdit={(t) => setTileModal(t)}
            onDelete={handleDeleteTile}
            onMoveUp={() => handleMove(idx, -1)}
            onMoveDown={() => handleMove(idx, +1)}
            onLogChange={handleLogChange}
          />
        ))}
        {tiles.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <ClipboardList size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium text-gray-500">No outreach tiles yet</p>
            {isOwnerOrManager && (
              <button onClick={() => { setEditMode(true); setTileModal(false) }}
                className="mt-3 text-xs text-red-600 hover:underline">Create your first tile</button>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {tileModal !== null && (
        <TileModal
          tile={tileModal || null}
          onClose={() => setTileModal(null)}
          onSaved={handleTileSaved}
        />
      )}
    </div>
  )
}
