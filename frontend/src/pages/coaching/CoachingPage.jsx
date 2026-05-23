import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import {
  MessageSquare, Plus, X, Edit2, Trash2, ChevronDown, ChevronUp,
  CheckSquare, User, Calendar, ArrowRight, Check, AlertCircle, Loader,
  ClipboardList, GripVertical,
} from 'lucide-react'

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
  { value: 'manager_meeting', label: 'Manager Meeting', color: 'bg-red-100 text-red-700 border-red-200'    },
  { value: 'coaching_call',   label: 'Coaching Call',   color: 'bg-blue-100 text-blue-700 border-blue-200'  },
  { value: 'team_training',   label: 'Team Training',   color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'one_off',         label: 'One Off',         color: 'bg-gray-100 text-gray-600 border-gray-200'  },
  { value: 'vendor_meeting',  label: 'Vendor Meeting',  color: 'bg-amber-100 text-amber-700 border-amber-200' },
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
  return MEETING_TYPES.find(t => t.value === value) || MEETING_TYPES[0]
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

// ═════════════════════════════════════════════════════════════════════════════
// AGENDA COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════

// ─── Agenda Create/Edit Modal ─────────────────────────────────────────────────
function AgendaModal({ agenda, onSave, onClose }) {
  const isNew = !agenda

  const [meetingType, setMeetingType] = useState(agenda?.meetingType || 'manager_meeting')
  const [title,       setTitle]       = useState(agenda?.title || '')
  const [items,       setItems]       = useState(() => {
    if (agenda) return agenda.items.map(i => ({ ...i }))
    // New agenda — pre-load defaults for manager meeting
    return MANAGER_DEFAULTS.map(t => makeItem(t, true))
  })
  const [newItemText, setNewItemText] = useState('')

  // When meeting type changes, offer to swap default items
  function handleTypeChange(val) {
    setMeetingType(val)
    const defaultItems = items.filter(i => i.isDefault)
    const customItems  = items.filter(i => !i.isDefault)
    if (val === 'manager_meeting') {
      setItems([...MANAGER_DEFAULTS.map(t => makeItem(t, true)), ...customItems])
    } else if (defaultItems.length > 0 && defaultItems.every(i => !i.checked)) {
      // Clear out manager defaults if switching away and none are checked
      setItems(customItems)
    }
  }

  function addItem() {
    if (!newItemText.trim()) return
    setItems(prev => [...prev, makeItem(newItemText.trim())])
    setNewItemText('')
  }

  function removeItem(id) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  function moveItem(id, dir) {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === id)
      if ((dir === -1 && idx === 0) || (dir === 1 && idx === prev.length - 1)) return prev
      const next = [...prev]
      ;[next[idx], next[idx + dir]] = [next[idx + dir], next[idx]]
      return next
    })
  }

  function handleSave() {
    if (!title.trim()) return
    onSave({
      id:          agenda?.id || uid(),
      meetingType,
      title:       title.trim(),
      items:       items.filter(i => i.text.trim()),
      createdAt:   agenda?.createdAt || new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
    })
    onClose()
  }

  const mt = getMeetingType(meetingType)

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
                <button
                  key={t.value}
                  type="button"
                  onClick={() => handleTypeChange(t.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    meetingType === t.value
                      ? t.color + ' ring-2 ring-offset-1 ring-red-400'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Meeting Title <span className="text-red-400">*</span>
            </label>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={meetingType === 'manager_meeting' ? 'e.g. Weekly Manager Meeting' : 'e.g. Chrissy — May Check-in'}
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
                  <span className="text-gray-200 cursor-grab flex-shrink-0">
                    <GripVertical size={14} />
                  </span>
                  <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                    item.isDefault ? 'bg-red-50 border border-red-100' : 'bg-gray-50 border border-gray-100'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.isDefault ? 'bg-red-400' : 'bg-gray-300'}`} />
                    <span className="flex-1 text-gray-800">{item.text}</span>
                    {item.isDefault && (
                      <span className="text-[10px] text-red-400 font-medium flex-shrink-0">default</span>
                    )}
                  </div>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => moveItem(item.id, -1)}
                      disabled={idx === 0}
                      className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-20">
                      <ChevronUp size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(item.id, 1)}
                      disabled={idx === items.length - 1}
                      className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-20">
                      <ChevronDown size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="p-1 text-gray-300 hover:text-red-400">
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add item input */}
            <div className="flex gap-2">
              <input
                value={newItemText}
                onChange={e => setNewItemText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addItem()}
                placeholder="Add agenda item…"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
              />
              <button
                type="button"
                onClick={addItem}
                disabled={!newItemText.trim()}
                className="px-3 py-2 bg-gray-900 text-white text-xs font-semibold rounded-lg disabled:opacity-30 hover:bg-gray-700">
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex-shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!title.trim()}
            className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors">
            {isNew ? 'Create Agenda' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Agenda Card ──────────────────────────────────────────────────────────────
function AgendaCard({ agenda, onEdit, onDelete, onToggleItem }) {
  const [expanded,      setExpanded]      = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const mt          = getMeetingType(agenda.meetingType)
  const checkedCount = agenda.items.filter(i => i.checked).length
  const total        = agenda.items.length
  const allDone      = total > 0 && checkedCount === total

  return (
    <div className={`bg-white border rounded-xl shadow-sm overflow-hidden transition-all ${allDone ? 'border-green-200' : 'border-gray-200'}`}>
      {/* Header */}
      <div
        className="flex items-start gap-3 px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className={`mt-0.5 px-2 py-1 rounded-md text-[11px] font-bold border flex-shrink-0 ${mt.color}`}>
          {mt.label}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-gray-900 text-sm font-semibold leading-tight">{agenda.title}</p>
          <p className="text-gray-400 text-xs mt-0.5">
            {fmtDateTime(agenda.createdAt)}
            {total > 0 && (
              <> · <span className={allDone ? 'text-green-600 font-medium' : ''}>
                {checkedCount}/{total} items {allDone ? '✓ complete' : 'covered'}
              </span></>
            )}
          </p>
        </div>
        {/* Progress bar */}
        {total > 0 && (
          <div className="flex-shrink-0 w-16">
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-red-500'}`}
                style={{ width: `${(checkedCount / total) * 100}%` }}
              />
            </div>
          </div>
        )}
        {expanded
          ? <ChevronUp size={15} className="text-gray-400 flex-shrink-0 mt-1" />
          : <ChevronDown size={15} className="text-gray-400 flex-shrink-0 mt-1" />
        }
      </div>

      {/* Expanded checklist */}
      {expanded && (
        <div className="border-t border-gray-100">
          <div className="px-5 py-3 space-y-1">
            {agenda.items.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-2">No agenda items.</p>
            ) : (
              agenda.items.map(item => (
                <label
                  key={item.id}
                  className="flex items-center gap-3 py-1.5 cursor-pointer group rounded-lg hover:bg-gray-50 px-2 -mx-2 transition-colors"
                >
                  <div
                    onClick={() => onToggleItem(agenda.id, item.id)}
                    className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                      item.checked
                        ? 'bg-green-500 border-green-500'
                        : 'border-gray-300 group-hover:border-gray-400'
                    }`}
                  >
                    {item.checked && <Check size={11} className="text-white" strokeWidth={3} />}
                  </div>
                  <span className={`text-sm flex-1 transition-colors ${
                    item.checked ? 'text-gray-400 line-through' : 'text-gray-800'
                  }`}>
                    {item.text}
                  </span>
                  {item.isDefault && !item.checked && (
                    <span className="text-[10px] text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      default
                    </span>
                  )}
                </label>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100">
            <button
              onClick={() => onEdit(agenda)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
              <Edit2 size={12} /> Edit
            </button>
            <div className="ml-auto">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Delete this agenda?</span>
                  <button
                    onClick={() => onDelete(agenda.id)}
                    className="px-2.5 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700">
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs text-gray-400 hover:text-gray-700 px-2">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
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

// ─── Agenda Tab ───────────────────────────────────────────────────────────────
function AgendaTab() {
  const [agendas,  setAgendas]  = useState(() => loadAgendas())
  const [modal,    setModal]    = useState(null) // null | 'new' | agenda obj
  const [typeFilter, setTypeFilter] = useState('')

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
    setAgendas(prev => prev.filter(a => a.id !== id))
  }

  function handleToggleItem(agendaId, itemId) {
    setAgendas(prev => prev.map(a => {
      if (a.id !== agendaId) return a
      return {
        ...a,
        items: a.items.map(i => i.id === itemId ? { ...i, checked: !i.checked } : i),
      }
    }))
  }

  const typesUsed = [...new Set(agendas.map(a => a.meetingType))]
  const visible   = typeFilter ? agendas.filter(a => a.meetingType === typeFilter) : agendas

  return (
    <div>
      {modal && (
        <AgendaModal
          agenda={modal === 'new' ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        {/* Type filter pills */}
        {typesUsed.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setTypeFilter('')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                !typeFilter ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}>
              All
            </button>
            {typesUsed.map(val => {
              const t = getMeetingType(val)
              return (
                <button
                  key={val}
                  onClick={() => setTypeFilter(typeFilter === val ? '' : val)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                    typeFilter === val ? t.color + ' ring-2 ring-offset-1 ring-red-300' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}>
                  {t.label}
                </button>
              )
            })}
          </div>
        )}
        <button
          onClick={() => setModal('new')}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm">
          <Plus size={15} /> New Agenda
        </button>
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <ClipboardList size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium text-gray-500">No agendas yet</p>
          <p className="text-xs mt-1 text-gray-400">
            Create an agenda before your meeting — Manager Meetings auto-load the standard items.
          </p>
          <button
            onClick={() => setModal('new')}
            className="mt-4 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700">
            Create First Agenda
          </button>
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
    staff_name:   session?.staff_name || '',
    session_type: session?.session_type || 'one-on-one',
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
    if (!form.staff_name.trim()) { setError('Staff name is required'); return }
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Staff Member *</label>
              <input
                className={inputCls} value={form.staff_name}
                onChange={e => set('staff_name', e.target.value)}
                placeholder="Chrissy, Synneva…"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Session Type</label>
              <select className={inputCls} value={form.session_type} onChange={e => set('session_type', e.target.value)}>
                {SESSION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input type="date" className={inputCls} value={form.session_date}
              onChange={e => set('session_date', e.target.value)} />
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
  const [pushing, setPushing] = useState(false)
  const [pushed, setPushed]   = useState(action.pushed_to_todo)

  const handlePush = async () => {
    setPushing(true)
    try { await onPushToTodo(action.id); setPushed(true) }
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
        ) : (
          <button onClick={handlePush} disabled={pushing}
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

  const typeLabel    = SESSION_TYPES.find(t => t.value === session.session_type)?.label || session.session_type
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
function SessionsTab() {
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

  const handlePushToTodo = async (actionId) => {
    const res = await apiPost(`/api/coaching/actions/${actionId}/push-to-todo`, {})
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
      {tab === 'agenda'   && <AgendaTab />}
      {tab === 'sessions' && <SessionsTab />}
    </div>
  )
}
