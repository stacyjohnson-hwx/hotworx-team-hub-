import { useState, useEffect, useCallback, useRef } from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import {
  MessageSquare, Plus, X, Edit2, Trash2, ChevronDown, ChevronUp,
  CheckSquare, User, Calendar, ArrowRight, Check, AlertCircle, Loader,
  ClipboardList, GripVertical, Paperclip, Download, FileText, Image,
  FileSpreadsheet, File as FileIcon, UploadCloud, Play,
} from 'lucide-react'

// ─── IndexedDB document store ────────────────────────────────────────────────
const DB_NAME    = 'hotworx_agenda_docs'
const DB_STORE   = 'blobs'
const DB_VERSION = 1

function openDocDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => e.target.result.createObjectStore(DB_STORE)
    req.onsuccess  = e => resolve(e.target.result)
    req.onerror    = e => reject(e.target.error)
  })
}

async function saveDocBlob(id, blob) {
  const db = await openDocDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put(blob, id)
    tx.oncomplete = resolve
    tx.onerror    = e => reject(e.target.error)
  })
}

async function getDocBlob(id) {
  const db = await openDocDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(DB_STORE, 'readonly')
    const req = tx.objectStore(DB_STORE).get(id)
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}

async function deleteDocBlob(id) {
  const db = await openDocDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).delete(id)
    tx.oncomplete = resolve
    tx.onerror    = e => reject(e.target.error)
  })
}

function docId() { return `doc-${Date.now()}-${Math.random().toString(36).slice(2,7)}` }

function fmtFileSize(bytes) {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileTypeIcon({ mimeType, size = 14 }) {
  if (mimeType?.startsWith('image/'))
    return <Image size={size} className="text-blue-500" />
  if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel') || mimeType?.includes('csv'))
    return <FileSpreadsheet size={size} className="text-green-600" />
  if (mimeType?.includes('pdf') || mimeType?.includes('word') || mimeType?.includes('text'))
    return <FileText size={size} className="text-red-500" />
  return <FileIcon size={size} className="text-gray-400" />
}

// ─── Session constants ────────────────────────────────────────────────────────
const SESSION_TYPES = [
  { value: 'one-on-one', label: 'One-on-One' },
  { value: 'team',       label: 'Team Meeting' },
  { value: 'phone',      label: 'Phone Call' },
  { value: 'written',    label: 'Written / Email' },
  { value: 'other',      label: 'Other' },
]

// ─── Agenda constants ─────────────────────────────────────────────────────────
const MEETING_TYPES = [
  { value: 'manager_meeting',    label: 'Manager Meeting',    color: 'bg-red-100 text-red-700 border-red-200'       },
  { value: 'coaching_call',      label: 'Coaching Call',      color: 'bg-blue-100 text-blue-700 border-blue-200'    },
  { value: 'team_training',      label: 'Team Training',      color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: '1_on_1',             label: '1:1',                color: 'bg-pink-100 text-pink-700 border-pink-200'    },
  { value: 'performance_review', label: 'Performance Review', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { value: 'one_off',            label: 'One Off',            color: 'bg-gray-100 text-gray-600 border-gray-200'   },
  { value: 'vendor_meeting',     label: 'Vendor Meeting',     color: 'bg-amber-100 text-amber-700 border-amber-200' },
]

const MANAGER_DEFAULTS = [
  'Weekly Review',
  'Staffing Update',
  'Upcoming Events',
  'Upcoming Promotions',
  'Orders Needed',
  'Studio Maintenance',
]

function getMeetingType(value) {
  const mt = MEETING_TYPES.find(t => t.value === value)
  if (mt) return mt
  // Fallback for old session_type values stored in DB
  const st = SESSION_TYPES.find(t => t.value === value)
  if (st) return { value: st.value, label: st.label, color: 'bg-gray-100 text-gray-600 border-gray-200' }
  return MEETING_TYPES[0]
}

// ─── Agenda localStorage ──────────────────────────────────────────────────────
const AGENDAS_KEY = 'coaching_agendas'
function loadAgendas() {
  try { return JSON.parse(localStorage.getItem(AGENDAS_KEY) || '[]') } catch { return [] }
}
function saveAgendas(list) {
  try { localStorage.setItem(AGENDAS_KEY, JSON.stringify(list)) } catch {}
}
function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2,6)}` }
function makeItem(text, isDefault = false) {
  return { id: uid(), text, checked: false, isDefault }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Local calendar date (NOT UTC) — toISOString() would roll to the next day in the
// evening for US time zones and throw off "Today/Tomorrow" chips.
function ymdLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function todayStr() { return ymdLocal(new Date()) }

// Meeting types that recur weekly: when their agenda is converted to notes, the
// next week's agenda is auto-created at the same time.
const RECURRING_TYPES = ['manager_meeting', '1_on_1', 'coaching_call']
function addDaysStr(dateStr, days) {
  const d = new Date((dateStr || todayStr()) + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return ymdLocal(d)
}

function fmtDate(str) {
  if (!str) return ''
  return new Date(str + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}
function fmtDateTime(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}
function fmtTime(timeStr) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12  = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}
function daysFromToday(dateStr) {
  if (!dateStr) return null
  const diff = Math.round((new Date(dateStr + 'T00:00:00') - new Date(todayStr() + 'T00:00:00')) / 86400000)
  return diff
}
function relativeMeetingLabel(dateStr) {
  const d = daysFromToday(dateStr)
  if (d === null) return null
  if (d === 0)  return { text: 'Today',     cls: 'text-red-600 font-semibold' }
  if (d === 1)  return { text: 'Tomorrow',  cls: 'text-orange-600 font-semibold' }
  if (d === -1) return { text: 'Yesterday', cls: 'text-gray-500' }
  if (d > 0 && d <= 7)  return { text: `In ${d} days`,      cls: 'text-blue-600' }
  if (d < 0 && d >= -7) return { text: `${Math.abs(d)} days ago`, cls: 'text-gray-400' }
  return null
}

// ═════════════════════════════════════════════════════════════════════════════
// AGENDA COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════

// ─── Agenda Create/Edit Modal ─────────────────────────────────────────────────
function AgendaModal({ agenda, onSave, onClose }) {
  const isNew     = !agenda
  const fileInput = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  const [meetingType,  setMeetingType]  = useState(agenda?.meetingType || 'manager_meeting')
  const [meetingDate,  setMeetingDate]  = useState(agenda?.meetingDate || todayStr())
  const [meetingTime,  setMeetingTime]  = useState(agenda?.meetingTime || '')
  const [title,        setTitle]        = useState(agenda?.title || '')
  const [attendees,    setAttendees]    = useState(agenda?.attendees || '')
  const [items,        setItems]        = useState(() => {
    if (agenda) return agenda.items.map(i => ({ ...i }))
    return MANAGER_DEFAULTS.map(t => makeItem(t, true))
  })
  const [newItemText,  setNewItemText]  = useState('')
  // existingDocs: already saved docs from the agenda (metadata only)
  const [existingDocs, setExistingDocs] = useState(agenda?.documents || [])
  // pendingFiles: newly selected File objects not yet persisted
  const [pendingFiles, setPendingFiles] = useState([])
  const [saving,       setSaving]       = useState(false)

  function handleTypeChange(val) {
    setMeetingType(val)
    const defaultItems = items.filter(i => i.isDefault)
    const customItems  = items.filter(i => !i.isDefault)
    if (val === 'manager_meeting') {
      setItems([...MANAGER_DEFAULTS.map(t => makeItem(t, true)), ...customItems])
    } else if (defaultItems.length > 0 && defaultItems.every(i => !i.checked)) {
      setItems(customItems)
    }
  }

  function addItem() {
    if (!newItemText.trim()) return
    setItems(prev => [...prev, makeItem(newItemText.trim())])
    setNewItemText('')
  }
  function removeItem(id) { setItems(prev => prev.filter(i => i.id !== id)) }
  function moveItem(id, dir) {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === id)
      if ((dir === -1 && idx === 0) || (dir === 1 && idx === prev.length - 1)) return prev
      const next = [...prev]; [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]]; return next
    })
  }

  // File handling
  function addFiles(files) {
    const newFiles = Array.from(files).filter(f => {
      // Deduplicate by name+size
      const already = pendingFiles.some(p => p.name === f.name && p.size === f.size)
      const existAlready = existingDocs.some(d => d.name === f.name && d.size === f.size)
      return !already && !existAlready
    })
    setPendingFiles(prev => [...prev, ...newFiles])
  }

  function removePending(idx) {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx))
  }

  async function removeExisting(docMeta) {
    setExistingDocs(prev => prev.filter(d => d.id !== docMeta.id))
    try { await deleteDocBlob(docMeta.id) } catch {}
  }

  function handleDrop(e) {
    e.preventDefault(); setIsDragging(false)
    addFiles(e.dataTransfer.files)
  }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      // Persist pending file blobs to IndexedDB
      const newDocMeta = await Promise.all(
        pendingFiles.map(async (file) => {
          const id = docId()
          await saveDocBlob(id, file)
          return { id, name: file.name, size: file.size, type: file.type, uploadedAt: new Date().toISOString() }
        })
      )
      const allDocs = [...existingDocs, ...newDocMeta]
      onSave({
        id:          agenda?.id || uid(),
        meetingType,
        meetingDate,
        meetingTime: meetingTime.trim() || null,
        title:       title.trim(),
        attendees:   attendees.trim(),
        items:       items.filter(i => i.text.trim()),
        documents:   allDocs,
        createdAt:   agenda?.createdAt || new Date().toISOString(),
        updatedAt:   new Date().toISOString(),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const mt = getMeetingType(meetingType)
  const totalDocs = existingDocs.length + pendingFiles.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-gray-900 font-semibold flex items-center gap-2">
            <ClipboardList size={17} className="text-red-500" />
            {isNew ? 'New Meeting Agenda' : 'Edit Agenda'}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          {/* Meeting type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Meeting Type</label>
            <div className="flex flex-wrap gap-2">
              {MEETING_TYPES.map(t => (
                <button key={t.value} type="button" onClick={() => handleTypeChange(t.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    meetingType === t.value
                      ? t.color + ' ring-2 ring-offset-1 ring-red-400'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title + Date + Time row */}
          <div className="grid grid-cols-6 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Meeting Title <span className="text-red-400">*</span>
              </label>
              <input
                autoFocus value={title} onChange={e => setTitle(e.target.value)}
                placeholder={meetingType === 'manager_meeting' ? 'e.g. Weekly Manager Meeting' : 'e.g. Chrissy — May Check-in'}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Meeting Date <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={meetingDate}
                onChange={e => setMeetingDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Time</label>
              <input
                type="time"
                value={meetingTime}
                onChange={e => setMeetingTime(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
              />
            </div>
          </div>

          {/* Attendees */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Attendees</label>
            <input
              value={attendees}
              onChange={e => setAttendees(e.target.value)}
              placeholder="e.g. Chrissy, Synneva"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
            />
          </div>

          {/* Agenda items */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              Agenda Items
              {meetingType === 'manager_meeting' && (
                <span className="ml-2 text-[10px] font-normal text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-100">
                  defaults loaded
                </span>
              )}
            </label>
            <div className="space-y-1.5 mb-3">
              {items.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-2 group">
                  <span className="text-gray-200 cursor-grab flex-shrink-0"><GripVertical size={14} /></span>
                  <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                    item.isDefault ? 'bg-red-50 border border-red-100' : 'bg-gray-50 border border-gray-100'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.isDefault ? 'bg-red-400' : 'bg-gray-300'}`} />
                    <span className="flex-1 text-gray-800">{item.text}</span>
                    {item.isDefault && <span className="text-[10px] text-red-400 font-medium flex-shrink-0">default</span>}
                  </div>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button type="button" onClick={() => moveItem(item.id, -1)} disabled={idx === 0}
                      className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-20"><ChevronUp size={13} /></button>
                    <button type="button" onClick={() => moveItem(item.id, 1)} disabled={idx === items.length - 1}
                      className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-20"><ChevronDown size={13} /></button>
                    <button type="button" onClick={() => removeItem(item.id)}
                      className="p-1 text-gray-300 hover:text-red-400"><X size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newItemText} onChange={e => setNewItemText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addItem()}
                placeholder="Add agenda item…"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500" />
              <button type="button" onClick={addItem} disabled={!newItemText.trim()}
                className="px-3 py-2 bg-gray-900 text-white text-xs font-semibold rounded-lg disabled:opacity-30 hover:bg-gray-700">
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* ── Documents ─────────────────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2 flex items-center gap-1.5">
              <Paperclip size={12} /> Documents
              {totalDocs > 0 && (
                <span className="ml-1 text-[10px] font-semibold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                  {totalDocs}
                </span>
              )}
            </label>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInput.current?.click()}
              className={`border-2 border-dashed rounded-xl px-4 py-5 flex flex-col items-center gap-2 cursor-pointer transition-all ${
                isDragging
                  ? 'border-red-400 bg-red-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <UploadCloud size={22} className={isDragging ? 'text-red-400' : 'text-gray-300'} />
              <p className="text-xs text-gray-500 text-center leading-snug">
                <span className="font-semibold text-gray-700">Click to upload</span> or drag & drop
              </p>
              <p className="text-[10px] text-gray-400">Any file type · Multiple files OK</p>
            </div>
            <input ref={fileInput} type="file" multiple className="hidden"
              onChange={e => { addFiles(e.target.files); e.target.value = '' }} />

            {/* Existing saved docs */}
            {existingDocs.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {existingDocs.map(doc => (
                  <div key={doc.id} className="flex items-center gap-2.5 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                    <FileTypeIcon mimeType={doc.type} size={14} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{doc.name}</p>
                      <p className="text-[10px] text-gray-400">{fmtFileSize(doc.size)} · saved</p>
                    </div>
                    <button type="button" onClick={() => removeExisting(doc)}
                      className="p-1 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Pending new files */}
            {pendingFiles.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {pendingFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    <FileTypeIcon mimeType={file.type} size={14} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{file.name}</p>
                      <p className="text-[10px] text-gray-400">{fmtFileSize(file.size)} · pending</p>
                    </div>
                    <button type="button" onClick={() => removePending(idx)}
                      className="p-1 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex-shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={!title.trim() || saving}
            className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors flex items-center gap-2">
            {saving && <Loader size={13} className="animate-spin" />}
            {isNew ? 'Create Agenda' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Agenda Card ──────────────────────────────────────────────────────────────
function AgendaCard({ agenda, onEdit, onDelete, onToggleItem, onRemoveDoc, onConvert }) {
  const [expanded,      setExpanded]      = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [downloading,   setDownloading]   = useState(null)

  const mt           = getMeetingType(agenda.meetingType)
  const checkedCount = agenda.items.filter(i => i.checked).length
  const total        = agenda.items.length
  const allDone      = total > 0 && checkedCount === total
  const docs         = agenda.documents || []

  async function handleDownload(doc) {
    setDownloading(doc.id)
    try {
      const blob = await getDocBlob(doc.id)
      if (!blob) { alert('File not found — it may have been cleared.'); return }
      const url = URL.createObjectURL(blob)
      const a   = Object.assign(document.createElement('a'), { href: url, download: doc.name })
      document.body.appendChild(a); a.click()
      setTimeout(() => { URL.revokeObjectURL(url); a.remove() }, 500)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className={`bg-white border rounded-xl shadow-sm overflow-hidden transition-all ${allDone ? 'border-green-200' : 'border-gray-200'}`}>
      {/* Header */}
      <div className="flex items-start gap-3 px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(e => !e)}>
        <div className={`mt-0.5 px-2 py-1 rounded-md text-[11px] font-bold border flex-shrink-0 ${mt.color}`}>
          {mt.label}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-gray-900 text-sm font-semibold leading-tight">{agenda.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {/* Meeting date (primary) */}
            {agenda.meetingDate ? (
              <span className="text-xs text-gray-600 flex items-center gap-1">
                <Calendar size={11} className="text-gray-400" />
                {fmtDate(agenda.meetingDate)}
                {agenda.meetingTime && <span className="text-gray-400">· {fmtTime(agenda.meetingTime)}</span>}
              </span>
            ) : (
              <span className="text-xs text-gray-400">{fmtDateTime(agenda.createdAt)}</span>
            )}
            {/* Relative label (Today / Tomorrow / In N days) */}
            {(() => { const rel = relativeMeetingLabel(agenda.meetingDate); return rel ? <span className={`text-xs ${rel.cls}`}>{rel.text}</span> : null })()}
            {agenda.attendees && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                · <User size={10} className="text-gray-400 inline" /> {agenda.attendees}
              </span>
            )}
            {total > 0 && (
              <span className={`text-xs ${allDone ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                · {checkedCount}/{total} {allDone ? '✓ complete' : 'covered'}
              </span>
            )}
            {docs.length > 0 && (
              <span className="text-xs text-gray-400">
                · <Paperclip size={10} className="inline mr-0.5" />{docs.length} doc{docs.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        {total > 0 && (
          <div className="flex-shrink-0 w-16">
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-red-500'}`}
                style={{ width: `${(checkedCount / total) * 100}%` }} />
            </div>
          </div>
        )}
        {expanded
          ? <ChevronUp size={15} className="text-gray-400 flex-shrink-0 mt-1" />
          : <ChevronDown size={15} className="text-gray-400 flex-shrink-0 mt-1" />}
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-gray-100">

          {/* Checklist */}
          <div className="px-5 py-3 space-y-1">
            {agenda.items.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-2">No agenda items.</p>
            ) : (
              agenda.items.map(item => (
                <label key={item.id}
                  className="flex items-center gap-3 py-1.5 cursor-pointer group rounded-lg hover:bg-gray-50 px-2 -mx-2 transition-colors">
                  <div onClick={() => onToggleItem(agenda.id, item.id)}
                    className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                      item.checked ? 'bg-green-500 border-green-500' : 'border-gray-300 group-hover:border-gray-400'
                    }`}>
                    {item.checked && <Check size={11} className="text-white" strokeWidth={3} />}
                  </div>
                  <span className={`text-sm flex-1 transition-colors ${item.checked ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                    {item.text}
                  </span>
                  {item.isDefault && !item.checked && (
                    <span className="text-[10px] text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">default</span>
                  )}
                </label>
              ))
            )}
          </div>

          {/* Documents */}
          {docs.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Paperclip size={11} /> Documents ({docs.length})
              </p>
              <div className="space-y-1.5">
                {docs.map(doc => (
                  <div key={doc.id} className="flex items-center gap-2.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 group">
                    <FileTypeIcon mimeType={doc.type} size={14} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{doc.name}</p>
                      <p className="text-[10px] text-gray-400">{fmtFileSize(doc.size)}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleDownload(doc)}
                        disabled={downloading === doc.id}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Download">
                        {downloading === doc.id
                          ? <Loader size={13} className="animate-spin" />
                          : <Download size={13} />}
                      </button>
                      <button
                        onClick={() => onRemoveDoc(agenda.id, doc)}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Remove">
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100">
            <button onClick={() => onEdit(agenda)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
              <Edit2 size={12} /> Edit
            </button>
            <button onClick={() => onConvert(agenda)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors">
              <Play size={11} fill="currentColor" /> Start Notes
            </button>
            <div className="ml-auto">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Delete this agenda?</span>
                  <button onClick={() => onDelete(agenda.id)}
                    className="px-2.5 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700">
                    Delete
                  </button>
                  <button onClick={() => setConfirmDelete(false)}
                    className="text-xs text-gray-400 hover:text-gray-700 px-2">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 size={12} /> Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Convert Agenda → Session Notes Modal ────────────────────────────────────
function ConvertModal({ agenda, onSave, onClose }) {
  const mt = getMeetingType(agenda.meetingType)

  const [attendees,    setAttendees]    = useState(agenda.attendees || '')
  const [sessionTime,  setSessionTime]  = useState(agenda.meetingTime || '')
  const [notes,        setNotes]        = useState('')
  const [actionInputs, setActionInputs] = useState([''])
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  const addActionRow    = () => setActionInputs(a => [...a, ''])
  const setAction       = (i, v) => setActionInputs(a => { const n = [...a]; n[i] = v; return n })
  const removeAction    = (i) => setActionInputs(a => a.filter((_, idx) => idx !== i))

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const payload = {
        session_date: agenda.meetingDate || new Date().toISOString().split('T')[0],
        session_time: sessionTime.trim() || null,
        staff_name:   attendees.trim(),
        session_type: agenda.meetingType,
        notes:        notes.trim(),
        action_items: actionInputs
          .filter(a => a.trim())
          .map(a => ({ title: a.trim() })),
      }
      const saved = await apiPost('/api/coaching', payload)
      onSave(saved)
    } catch (err) {
      setError(err.message || 'Save failed')
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-gray-900 font-semibold flex items-center gap-2">
              <MessageSquare size={16} className="text-red-500" />
              Start Session Notes
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{agenda.title}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Meeting type + date — read-only summary */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex-shrink-0 ${mt.color}`}>
              {mt.label}
            </span>
            {agenda.meetingDate && (
              <span className="text-sm text-gray-600 flex items-center gap-1.5">
                <Calendar size={13} className="text-gray-400" />
                {fmtDate(agenda.meetingDate)}
                {sessionTime && <span className="text-gray-400">· {fmtTime(sessionTime)}</span>}
              </span>
            )}
          </div>

          {/* Attendees + Time row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Attendees</label>
              <input
                autoFocus
                className={inputCls}
                value={attendees}
                onChange={e => setAttendees(e.target.value)}
                placeholder="e.g. Chrissy, Synneva"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Time</label>
              <input
                type="time"
                className={inputCls}
                value={sessionTime}
                onChange={e => setSessionTime(e.target.value)}
              />
            </div>
          </div>

          {/* Agenda reference — collapsed checklist */}
          {agenda.items.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">
                Agenda Reference
              </label>
              <div className="space-y-1 bg-gray-50 rounded-xl border border-gray-200 px-3 py-2.5">
                {agenda.items.map(item => (
                  <div key={item.id} className="flex items-center gap-2 py-1">
                    <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                      item.checked ? 'bg-green-500 border-green-500' : 'border-gray-300'
                    }`}>
                      {item.checked && <Check size={9} className="text-white" strokeWidth={3} />}
                    </div>
                    <span className={`text-xs ${item.checked ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                      {item.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Session notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Session Notes</label>
            <textarea
              rows={5}
              className={`${inputCls} resize-y`}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="What was discussed? Key observations, feedback given, decisions made…"
            />
          </div>

          {/* Action items */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              Action Items <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="space-y-2">
              {actionInputs.map((val, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className={inputCls}
                    value={val}
                    onChange={e => setAction(i, e.target.value)}
                    placeholder={`Action item ${i + 1}…`}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addActionRow() } }}
                  />
                  {actionInputs.length > 1 && (
                    <button type="button" onClick={() => removeAction(i)}
                      className="text-gray-400 hover:text-red-500 flex-shrink-0">
                      <X size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={addActionRow}
              className="mt-2 text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1">
              <Plus size={12} /> Add action item
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex-shrink-0">
          <p className="text-xs text-gray-400">This agenda will be converted to session notes.</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors flex items-center gap-2">
              {saving && <Loader size={13} className="animate-spin" />}
              Create Session Notes
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

// ─── Agenda Tab ───────────────────────────────────────────────────────────────
function AgendaTab({ onConvert }) {
  const [agendas,      setAgendas]      = useState(() => loadAgendas())
  const [modal,        setModal]        = useState(null)   // null | 'new' | agendaObj
  const [convertAgenda,setConvertAgenda]= useState(null)   // agendaObj to convert
  const [typeFilter,   setTypeFilter]   = useState('')
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [showFilter,   setShowFilter]   = useState(false)

  useEffect(() => { saveAgendas(agendas) }, [agendas])

  function handleSave(data) {
    setAgendas(prev => {
      const idx = prev.findIndex(a => a.id === data.id)
      if (idx >= 0) { const n = [...prev]; n[idx] = data; return n }
      return [data, ...prev]
    })
    setModal(null)
  }

  function handleDelete(id) {
    const agenda = agendas.find(a => a.id === id)
    if (agenda?.documents) {
      agenda.documents.forEach(doc => deleteDocBlob(doc.id).catch(() => {}))
    }
    setAgendas(prev => prev.filter(a => a.id !== id))
  }

  function handleToggleItem(agendaId, itemId) {
    setAgendas(prev => prev.map(a => {
      if (a.id !== agendaId) return a
      return { ...a, items: a.items.map(i => i.id === itemId ? { ...i, checked: !i.checked } : i) }
    }))
  }

  function handleRemoveDoc(agendaId, doc) {
    deleteDocBlob(doc.id).catch(() => {})
    setAgendas(prev => prev.map(a =>
      a.id !== agendaId ? a : { ...a, documents: (a.documents || []).filter(d => d.id !== doc.id) }
    ))
  }

  function handleConvertSave(savedSession) {
    const converted = convertAgenda
    // Remove the agenda (it's now session notes)
    handleDelete(converted.id)
    setConvertAgenda(null)
    // For recurring meeting types, auto-create next week's agenda at the same time,
    // carrying the standing agenda items forward (unchecked, no documents).
    if (converted && RECURRING_TYPES.includes(converted.meetingType)) {
      const next = {
        id:          uid(),
        meetingType: converted.meetingType,
        meetingDate: addDaysStr(converted.meetingDate, 7),
        meetingTime: converted.meetingTime || null,
        title:       converted.title,
        attendees:   converted.attendees || '',
        items:       (converted.items || []).map(i => ({ id: uid(), text: i.text, checked: false, isDefault: i.isDefault })),
        documents:   [],
        createdAt:   new Date().toISOString(),
      }
      setAgendas(prev => [next, ...prev])
    }
    // Bubble up so CoachingPage can switch to Session Notes tab
    onConvert(savedSession)
  }

  function clearFilters() { setTypeFilter(''); setDateFrom(''); setDateTo('') }
  const hasFilters = typeFilter || dateFrom || dateTo

  // All agendas sorted ascending (soonest first)
  const sorted = [...agendas].sort((a, b) => {
    const da = a.meetingDate || a.createdAt.slice(0, 10)
    const db = b.meetingDate || b.createdAt.slice(0, 10)
    return da.localeCompare(db)
  })

  // Type options used
  const typesUsed = [...new Set(sorted.map(a => a.meetingType))]

  // Apply filters
  const visible = sorted.filter(a => {
    if (typeFilter && a.meetingType !== typeFilter) return false
    const d = a.meetingDate || a.createdAt.slice(0, 10)
    if (dateFrom && d < dateFrom) return false
    if (dateTo   && d > dateTo)   return false
    return true
  })

  return (
    <div>
      {modal && (
        <AgendaModal
          agenda={modal === 'new' ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
      {convertAgenda && (
        <ConvertModal
          agenda={convertAgenda}
          onSave={handleConvertSave}
          onClose={() => setConvertAgenda(null)}
        />
      )}

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Filter toggle */}
        <button
          onClick={() => setShowFilter(f => !f)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
            hasFilters
              ? 'bg-red-50 border-red-200 text-red-600'
              : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
          }`}>
          <Calendar size={13} />
          Filter
          {hasFilters && <span className="ml-0.5 w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold">!</span>}
        </button>

        <button
          onClick={() => setModal('new')}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm">
          <Plus size={15} /> New Agenda
        </button>
      </div>

      {/* ── Filter panel ── */}
      {showFilter && (
        <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">From date</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">To date</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500" />
            </div>
          </div>

          {typesUsed.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Meeting type</label>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setTypeFilter('')}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                    !typeFilter ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}>All</button>
                {typesUsed.map(val => {
                  const t = getMeetingType(val)
                  return (
                    <button key={val} onClick={() => setTypeFilter(typeFilter === val ? '' : val)}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                        typeFilter === val ? t.color + ' ring-1 ring-offset-1 ring-red-300' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}>{t.label}</button>
                  )
                })}
              </div>
            </div>
          )}

          {hasFilters && (
            <button onClick={clearFilters}
              className="text-xs text-gray-400 hover:text-red-600 font-medium transition-colors">
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* ── List ── */}
      {visible.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <ClipboardList size={40} className="mx-auto mb-3 opacity-30" />
          {sorted.length === 0 ? (
            <>
              <p className="text-sm font-medium text-gray-500">No agendas yet</p>
              <p className="text-xs mt-1 text-gray-400">
                Create an agenda — Manager Meetings auto-load the standard items.
              </p>
              <button onClick={() => setModal('new')}
                className="mt-4 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700">
                Create First Agenda
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-500">No agendas match your filters</p>
              <button onClick={clearFilters} className="mt-3 text-sm text-red-600 hover:text-red-700 font-medium">
                Clear filters
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(agenda => (
            <AgendaCard
              key={agenda.id}
              agenda={agenda}
              onEdit={setModal}
              onDelete={handleDelete}
              onToggleItem={handleToggleItem}
              onRemoveDoc={handleRemoveDoc}
              onConvert={setConvertAgenda}
            />
          ))}
        </div>
      )}
    </div>
  )
}


// ═════════════════════════════════════════════════════════════════════════════
// EXISTING SESSION COMPONENTS (unchanged)
// ═════════════════════════════════════════════════════════════════════════════

// ─── Session Modal ────────────────────────────────────────────────────────────
function SessionModal({ session, onSave, onClose }) {
  const [form, setForm] = useState({
    session_date: session?.session_date || new Date().toISOString().split('T')[0],
    session_time: session?.session_time || '',
    staff_name:   session?.staff_name || '',
    session_type: session?.session_type || 'manager_meeting',
    notes:        session?.notes || '',
  })
  const [actionInputs, setActionInputs] = useState([''])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addActionRow = () => setActionInputs(a => [...a, ''])
  const setAction = (i, v) => setActionInputs(a => { const n = [...a]; n[i] = v; return n })
  const removeAction = (i) => setActionInputs(a => a.filter((_, idx) => idx !== i))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.staff_name.trim()) { setError('Attendees is required'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form }
      if (!session?.id) {
        payload.action_items = actionInputs
          .filter(a => a.trim())
          .map(a => ({ title: a.trim() }))
      }
      const saved = session?.id
        ? await apiPut(`/api/coaching/${session.id}`, payload)
        : await apiPost('/api/coaching', payload)
      onSave(saved)
    } catch (err) {
      setError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-gray-900 font-semibold">
            {session ? 'Edit Session' : 'Log Coaching Session'}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Attendees *</label>
            <input
              className={inputCls} value={form.staff_name}
              onChange={e => set('staff_name', e.target.value)}
              placeholder="Chrissy, Synneva…"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Meeting Type</label>
            <div className="flex flex-wrap gap-2">
              {MEETING_TYPES.map(t => (
                <button key={t.value} type="button" onClick={() => set('session_type', t.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    form.session_type === t.value
                      ? t.color + ' ring-2 ring-offset-1 ring-red-400'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input type="date" className={inputCls} value={form.session_date}
                onChange={e => set('session_date', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Time</label>
              <input type="time" className={inputCls} value={form.session_time}
                onChange={e => set('session_time', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Session Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={5} className={`${inputCls} resize-y`}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="What was discussed? Key observations, feedback given, goals set…"
            />
          </div>

          {!session?.id && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">
                Action Items <span className="text-gray-400 font-normal">(can add more later)</span>
              </label>
              <div className="space-y-2">
                {actionInputs.map((val, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className={inputCls} value={val}
                      onChange={e => setAction(i, e.target.value)}
                      placeholder={`Action item ${i + 1}…`}
                    />
                    {actionInputs.length > 1 && (
                      <button type="button" onClick={() => removeAction(i)}
                        className="text-gray-400 hover:text-red-500 flex-shrink-0">
                        <X size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={addActionRow}
                className="mt-2 text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1">
                <Plus size={12} /> Add action item
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex-shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : session ? 'Save Changes' : 'Log Session'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Action Item Row ──────────────────────────────────────────────────────────
function ActionItemRow({ action, onPushToTodo, onDelete }) {
  const [pushing,     setPushing]     = useState(false)
  const [pushed,      setPushed]      = useState(action.pushed_to_todo)
  const [showPicker,  setShowPicker]  = useState(false)
  const [managers,    setManagers]    = useState([])

  const openPicker = async () => {
    setShowPicker(true)
    if (!managers.length) {
      try { const m = await apiGet('/api/todo/managers'); setManagers(Array.isArray(m) ? m : []) } catch {}
    }
  }

  const handlePush = async (target) => {
    setPushing(true)
    setShowPicker(false)
    try { await onPushToTodo(action.id, target); setPushed(true) }
    catch {} finally { setPushing(false) }
  }

  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-lg ${pushed ? 'bg-green-50' : 'bg-gray-50'}`}>
      <div className={`mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center ${pushed ? 'bg-green-500' : 'bg-gray-300'}`}>
        {pushed && <Check size={10} className="text-white" strokeWidth={3} />}
      </div>
      <p className={`text-sm flex-1 ${pushed ? 'text-gray-500' : 'text-gray-800'}`}>
        {action.title}
        {action.notes && <span className="text-xs text-gray-400 block mt-0.5">{action.notes}</span>}
      </p>
      <div className="flex items-center gap-1 flex-shrink-0">
        {pushed ? (
          <span className="text-xs text-green-600 font-medium flex items-center gap-1">
            <CheckSquare size={12} /> In To-Do
          </span>
        ) : showPicker ? (
          <div className="flex items-center gap-1 flex-wrap justify-end">
            <span className="text-xs text-gray-500 mr-0.5">To:</span>
            {managers.map(m => (
              <button key={m.id} onClick={() => handlePush({ list_target: 'manager', assigned_to: m.id })} disabled={pushing}
                className="text-xs font-semibold px-2 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                {m.name}
              </button>
            ))}
            <button onClick={() => handlePush({ list_target: 'owner', assigned_to: '' })} disabled={pushing}
              className="text-xs font-semibold px-2 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50">
              Owner
            </button>
            <button onClick={() => setShowPicker(false)}
              className="p-1 text-gray-400 hover:text-gray-600">
              <X size={12} />
            </button>
          </div>
        ) : (
          <button onClick={openPicker} disabled={pushing}
            className="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors disabled:opacity-50">
            {pushing ? <Loader size={11} className="animate-spin" /> : <ArrowRight size={11} />}
            Push to To-Do
          </button>
        )}
        <button onClick={() => onDelete(action.id)}
          className="p-1 text-gray-300 hover:text-red-400 transition-colors">
          <X size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── Session Card ─────────────────────────────────────────────────────────────
function SessionCard({ session, onEdit, onDelete, onPushToTodo, onAddAction, onDeleteAction }) {
  const [expanded, setExpanded]     = useState(false)
  const [confirmDelete, setConfirm] = useState(false)
  const [newAction, setNewAction]   = useState('')
  const [addingAction, setAdding]   = useState(false)
  const [showAddField, setShowAdd]  = useState(false)

  const typeLabel    = getMeetingType(session.session_type)?.label || session.session_type
  const pushedCount  = (session.action_items || []).filter(a => a.pushed_to_todo).length
  const totalActions = (session.action_items || []).length

  const handleAddAction = async () => {
    if (!newAction.trim()) return
    setAdding(true)
    try { await onAddAction(session.id, newAction.trim()); setNewAction(''); setShowAdd(false) }
    finally { setAdding(false) }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(e => !e)}>
        <div className="w-9 h-9 rounded-full bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0">
          <User size={16} className="text-red-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-gray-900 text-sm font-semibold">{session.staff_name}</p>
          <p className="text-gray-500 text-xs mt-0.5">
            {typeLabel} · {fmtDate(session.session_date)}
            {session.session_time && <span> · {fmtTime(session.session_time)}</span>}
            {totalActions > 0 && (
              <> · <span className={pushedCount === totalActions ? 'text-green-600' : 'text-gray-500'}>
                {pushedCount}/{totalActions} actions pushed
              </span></>
            )}
          </p>
        </div>
        {expanded ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
      </div>

      {expanded && (
        <div className="border-t border-gray-100">
          {session.notes && (
            <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Session Notes</p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{session.notes}</p>
            </div>
          )}

          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Action Items</p>
              <button onClick={() => setShowAdd(s => !s)}
                className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1">
                <Plus size={12} /> Add
              </button>
            </div>

            {showAddField && (
              <div className="flex gap-2 mb-3">
                <input
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-red-500"
                  placeholder="New action item…"
                  value={newAction}
                  onChange={e => setNewAction(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddAction()}
                  autoFocus
                />
                <button onClick={handleAddAction} disabled={addingAction || !newAction.trim()}
                  className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
                  {addingAction ? '…' : 'Add'}
                </button>
                <button onClick={() => { setShowAdd(false); setNewAction('') }}
                  className="p-1.5 text-gray-400 hover:text-gray-600"><X size={14} /></button>
              </div>
            )}

            {(session.action_items || []).length === 0 ? (
              <p className="text-sm text-gray-400 italic">No action items yet.</p>
            ) : (
              <div className="space-y-1.5">
                {session.action_items.map(action => (
                  <ActionItemRow
                    key={action.id}
                    action={action}
                    onPushToTodo={onPushToTodo}
                    onDelete={onDeleteAction}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 bg-white">
            <button onClick={() => onEdit(session)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
              <Edit2 size={12} /> Edit Session
            </button>
            <div className="ml-auto">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Delete this session?</span>
                  <button onClick={() => onDelete(session.id)}
                    className="px-2.5 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700">
                    Yes, delete
                  </button>
                  <button onClick={() => setConfirm(false)}
                    className="text-xs text-gray-400 hover:text-gray-700 px-2">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirm(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 size={12} /> Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sessions Tab ─────────────────────────────────────────────────────────────
function SessionsTab({ newSession }) {
  const [sessions, setSessions]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [modal, setModal]         = useState(null)
  const [staffFilter, setFilter]  = useState('')

  const load = useCallback(async () => {
    try {
      const data = await apiGet('/api/coaching')
      setSessions(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Immediately prepend the just-converted session so it's visible before the
  // API fetch returns (handles any timing gap between POST and GET).
  useEffect(() => {
    if (!newSession) return
    setSessions(prev => {
      if (prev.some(s => s.id === newSession.id)) return prev
      return [{ ...newSession, action_items: newSession.action_items || [] }, ...prev]
    })
  }, [newSession])

  const staffNames = [...new Set(sessions.map(s => s.staff_name))].sort()
  const visible    = staffFilter ? sessions.filter(s => s.staff_name === staffFilter) : sessions

  const handleSave = (saved) => {
    setSessions(prev => {
      const idx = prev.findIndex(s => s.id === saved.id)
      if (idx >= 0) { const n = [...prev]; n[idx] = saved; return n }
      return [saved, ...prev]
    })
    setModal(null)
  }

  const handleDelete = async (id) => {
    await apiDelete(`/api/coaching/${id}`)
    setSessions(prev => prev.filter(s => s.id !== id))
  }

  const handlePushToTodo = async (actionId, target) => {
    const res = await apiPost(`/api/coaching/actions/${actionId}/push-to-todo`, target)
    setSessions(prev => prev.map(s => ({
      ...s,
      action_items: (s.action_items || []).map(a =>
        a.id === actionId ? { ...a, pushed_to_todo: true, todo_id: res.todo?.id } : a
      ),
    })))
  }

  const handleAddAction = async (sessionId, title) => {
    const newAction = await apiPost('/api/coaching/actions', { session_id: sessionId, title })
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, action_items: [...(s.action_items || []), newAction] } : s
    ))
  }

  const handleDeleteAction = async (actionId) => {
    await apiDelete(`/api/coaching/actions/${actionId}`)
    setSessions(prev => prev.map(s => ({
      ...s,
      action_items: (s.action_items || []).filter(a => a.id !== actionId),
    })))
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div>
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {staffNames.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilter('')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                !staffFilter ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}>
              All Staff
            </button>
            {staffNames.map(name => (
              <button key={name} onClick={() => setFilter(name)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                  staffFilter === name ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                }`}>
                {name}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setModal(false)}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm">
          <Plus size={15} /> Log Session
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <MessageSquare size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium text-gray-500">No coaching sessions yet</p>
          <p className="text-xs mt-1">Click "Log Session" to record a coaching conversation.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(session => (
            <SessionCard
              key={session.id}
              session={session}
              onEdit={setModal}
              onDelete={handleDelete}
              onPushToTodo={handlePushToTodo}
              onAddAction={handleAddAction}
              onDeleteAction={handleDeleteAction}
            />
          ))}
        </div>
      )}

      {modal !== null && (
        <SessionModal
          session={modal || null}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════════
export default function CoachingPage() {
  const [tab, setTab] = useState('agenda') // 'agenda' | 'sessions'
  const [convertedSession, setConvertedSession] = useState(null)

  function handleConvert(session) {
    setConvertedSession(session)
    setTab('sessions')
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MessageSquare size={22} className="text-red-600" /> Coaching
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">Meeting agendas, session notes, and action items</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        <button
          onClick={() => setTab('agenda')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            tab === 'agenda'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <ClipboardList size={15} /> Agenda Planner
        </button>
        <button
          onClick={() => setTab('sessions')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            tab === 'sessions'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <MessageSquare size={15} /> Session Notes
        </button>
      </div>

      {/* Tab content */}
      {tab === 'agenda'   && <AgendaTab onConvert={handleConvert} />}
      {tab === 'sessions' && <SessionsTab newSession={convertedSession} />}
    </div>
  )
}
