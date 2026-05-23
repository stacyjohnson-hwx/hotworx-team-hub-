import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import {
  MessageSquare, Plus, X, Edit2, Trash2, ChevronDown, ChevronUp,
  CheckSquare, User, Calendar, ArrowRight, Check, AlertCircle, Loader,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────
const SESSION_TYPES = [
  { value: 'one-on-one', label: 'One-on-One' },
  { value: 'team',       label: 'Team Meeting' },
  { value: 'phone',      label: 'Phone Call' },
  { value: 'written',    label: 'Written / Email' },
  { value: 'other',      label: 'Other' },
]

function fmtDate(str) {
  if (!str) return ''
  return new Date(str + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ─── Session Modal ────────────────────────────────────────────────────────────
function SessionModal({ session, onSave, onClose }) {
  const [form, setForm] = useState({
    session_date: session?.session_date || new Date().toISOString().split('T')[0],
    staff_name:   session?.staff_name || '',
    session_type: session?.session_type || 'one-on-one',
    notes:        session?.notes || '',
  })
  // Action items — only used when creating new sessions
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

          {/* Action items — new sessions only */}
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
function ActionItemRow({ action, sessionId, onPushToTodo, onDelete, onAdd }) {
  const [pushing, setPushing] = useState(false)
  const [pushed, setPushed]   = useState(action.pushed_to_todo)

  const handlePush = async () => {
    setPushing(true)
    try {
      await onPushToTodo(action.id)
      setPushed(true)
    } catch {}
    finally { setPushing(false) }
  }

  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-lg ${pushed ? 'bg-green-50' : 'bg-gray-50'}`}>
      <div className={`mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center ${
        pushed ? 'bg-green-500' : 'bg-gray-300'
      }`}>
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
          <button
            onClick={handlePush}
            disabled={pushing}
            className="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
          >
            {pushing
              ? <Loader size={11} className="animate-spin" />
              : <ArrowRight size={11} />
            }
            Push to To-Do
          </button>
        )}
        <button
          onClick={() => onDelete(action.id)}
          className="p-1 text-gray-300 hover:text-red-400 transition-colors"
        >
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

  const typeLabel = SESSION_TYPES.find(t => t.value === session.session_type)?.label || session.session_type
  const pushedCount = (session.action_items || []).filter(a => a.pushed_to_todo).length
  const totalActions = (session.action_items || []).length

  const handleAddAction = async () => {
    if (!newAction.trim()) return
    setAdding(true)
    try {
      await onAddAction(session.id, newAction.trim())
      setNewAction('')
      setShowAdd(false)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Summary row */}
      <div
        className="flex items-center gap-3 px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
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
        <div className="flex items-center gap-2">
          {expanded ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100">
          {/* Notes */}
          {session.notes && (
            <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Session Notes</p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{session.notes}</p>
            </div>
          )}

          {/* Action items */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Action Items</p>
              <button
                onClick={() => setShowAdd(s => !s)}
                className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
              >
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
                <button
                  onClick={handleAddAction}
                  disabled={addingAction || !newAction.trim()}
                  className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {addingAction ? '…' : 'Add'}
                </button>
                <button onClick={() => { setShowAdd(false); setNewAction('') }}
                  className="p-1.5 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
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
                    sessionId={session.id}
                    onPushToTodo={onPushToTodo}
                    onDelete={onDeleteAction}
                    onAdd={onAddAction}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 bg-white">
            <button
              onClick={() => onEdit(session)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CoachingPage() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [modal, setModal]       = useState(null)
  const [staffFilter, setFilter] = useState('')

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

  // All unique staff names for filter
  const staffNames = [...new Set(sessions.map(s => s.staff_name))].sort()
  const visible = staffFilter
    ? sessions.filter(s => s.staff_name === staffFilter)
    : sessions

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
    // Update the action item in state
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
      s.id === sessionId
        ? { ...s, action_items: [...(s.action_items || []), newAction] }
        : s
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
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-6 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare size={22} className="text-red-600" /> Coaching
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {sessions.length} session{sessions.length !== 1 ? 's' : ''} logged
          </p>
        </div>
        <button
          onClick={() => setModal(false)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
        >
          <Plus size={16} /> Log Session
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* Staff filter */}
      {staffNames.length > 1 && (
        <div className="flex gap-2 flex-wrap mb-5">
          <button
            onClick={() => setFilter('')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
              !staffFilter ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            All Staff
          </button>
          {staffNames.map(name => (
            <button
              key={name}
              onClick={() => setFilter(name)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                staffFilter === name ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Sessions list */}
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

      {/* Modal */}
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
