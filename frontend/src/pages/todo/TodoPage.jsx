import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import {
  CheckSquare, Plus, X, Edit2, Trash2, Check, Calendar,
  AlertCircle, ChevronDown, ChevronUp, MessageSquare, Flag,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────
const PRIORITIES = [
  { value: 'high',   label: 'High',   color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { value: 'low',    label: 'Low',    color: 'bg-gray-100 text-gray-600 border-gray-200' },
]

function priorityMeta(val) {
  return PRIORITIES.find(p => p.value === val) || PRIORITIES[1]
}

function fmtDate(str) {
  if (!str) return null
  return new Date(str + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function isOverdue(due_date, status) {
  if (!due_date || status === 'done') return false
  return new Date(due_date + 'T00:00:00') < new Date(new Date().toDateString())
}

function isDueToday(due_date, status) {
  if (!due_date || status === 'done') return false
  const today = new Date().toISOString().split('T')[0]
  return due_date === today
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────
const AREAS = [
  { value: '',        label: 'No Area'  },
  { value: 'open',   label: 'Open'     },
  { value: 'close',  label: 'Close'    },
  { value: 'sales',  label: 'Sales'    },
  { value: 'studio', label: 'Studio'   },
  { value: 'admin',  label: 'Admin'    },
]

const blankForm = { title: '', notes: '', due_date: '', priority: 'medium', area: '' }

function TodoModal({ item, onSave, onClose }) {
  const [form, setForm] = useState(item ? {
    title:    item.title || '',
    notes:    item.notes || '',
    due_date: item.due_date || '',
    priority: item.priority || 'medium',
    area:     item.area || '',
  } : { ...blankForm })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true); setError('')
    try {
      const saved = item?.id
        ? await apiPut(`/api/todo/${item.id}`, form)
        : await apiPost('/api/todo', form)
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
        className="bg-white rounded-xl shadow-xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-gray-900 font-semibold">{item ? 'Edit Task' : 'New Task'}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Task *</label>
            <input
              className={inputCls} value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="What needs to get done?"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
              <select className={inputCls} value={form.priority} onChange={e => set('priority', e.target.value)}>
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Area</label>
              <select className={inputCls} value={form.area} onChange={e => set('area', e.target.value)}>
                {AREAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
            <input
              type="date" className={inputCls}
              value={form.due_date}
              onChange={e => set('due_date', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              rows={3} className={`${inputCls} resize-none`}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Additional context or details…"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : item ? 'Save Changes' : 'Add Task'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Todo Item Row ────────────────────────────────────────────────────────────
function TodoItem({ item, onToggle, onEdit, onDelete }) {
  const [toggling, setToggling]     = useState(false)
  const [confirmDelete, setConfirm] = useState(false)
  const isDone     = item.status === 'done'
  const overdue    = isOverdue(item.due_date, item.status)
  const today      = isDueToday(item.due_date, item.status)
  const priMeta    = priorityMeta(item.priority)

  const handleToggle = async () => {
    setToggling(true)
    try { await onToggle(item.id, isDone ? 'open' : 'done') }
    finally { setToggling(false) }
  }

  return (
    <div className={`bg-white border rounded-xl shadow-sm transition-all ${
      isDone ? 'border-gray-200 opacity-60' : overdue ? 'border-red-200 border-l-4 border-l-red-400' : 'border-gray-200'
    }`}>
      <div className="flex items-start gap-3 px-4 py-3.5">
        {/* Checkbox */}
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
            isDone
              ? 'bg-green-500 border-green-500'
              : 'border-gray-300 hover:border-green-400'
          }`}
        >
          {toggling
            ? <div className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
            : isDone && <Check size={11} className="text-white" strokeWidth={3} />
          }
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
            {item.title}
          </p>
          {item.notes && (
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.notes}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {/* Priority */}
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded border ${priMeta.color}`}>
              <Flag size={9} /> {priMeta.label}
            </span>
            {/* Area */}
            {item.area && (
              <span className="inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200 capitalize">
                {item.area}
              </span>
            )}
            {/* Due date */}
            {item.due_date && (
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                overdue ? 'text-red-600' : today ? 'text-orange-600' : 'text-gray-500'
              }`}>
                <Calendar size={10} />
                {overdue ? 'Overdue · ' : today ? 'Due today · ' : ''}{fmtDate(item.due_date)}
              </span>
            )}
            {/* Source badge for coaching-generated tasks */}
            {item.source === 'coaching' && (
              <span className="inline-flex items-center gap-1 text-xs text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded">
                <MessageSquare size={9} /> From coaching
              </span>
            )}
            {/* Completed info */}
            {isDone && item.completed_by_name && (
              <span className="text-xs text-gray-400">
                Completed by {item.completed_by_name}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        {!isDone && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onEdit(item)}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Edit2 size={13} />
            </button>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <button onClick={() => onDelete(item.id)}
                  className="px-2 py-1 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700">Del</button>
                <button onClick={() => setConfirm(false)}
                  className="px-1 py-1 text-xs text-gray-400 hover:text-gray-700">✕</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirm(true)}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TodoPage() {
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [modal, setModal]       = useState(null)
  const [showDone, setShowDone] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await apiGet('/api/todo')
      setItems(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const open = items.filter(i => i.status === 'open')
  const done = items.filter(i => i.status === 'done')
  const overdue = open.filter(i => isOverdue(i.due_date, i.status))

  const handleSave = (saved) => {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === saved.id)
      if (idx >= 0) { const n = [...prev]; n[idx] = saved; return n }
      return [saved, ...prev]
    })
    setModal(null)
  }

  const handleToggle = async (id, newStatus) => {
    const updated = await apiPut(`/api/todo/${id}`, { status: newStatus })
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updated } : i))
  }

  const handleDelete = async (id) => {
    await apiDelete(`/api/todo/${id}`)
    setItems(prev => prev.filter(i => i.id !== id))
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
            <CheckSquare size={22} className="text-red-600" /> Manager To-Do
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {open.length} open
            {overdue.length > 0 && (
              <span className="text-red-600 font-medium"> · {overdue.length} overdue</span>
            )}
            {done.length > 0 && <span className="text-gray-400"> · {done.length} done</span>}
          </p>
        </div>
        <button
          onClick={() => setModal(false)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
        >
          <Plus size={16} /> Add Task
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* Open tasks */}
      {open.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CheckSquare size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium text-gray-500">All caught up!</p>
          <p className="text-xs mt-1">Add a task or push action items from coaching sessions.</p>
        </div>
      ) : (
        <div className="space-y-2.5 mb-6">
          {open.map(item => (
            <TodoItem
              key={item.id}
              item={item}
              onToggle={handleToggle}
              onEdit={setModal}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Completed tasks (collapsible) */}
      {done.length > 0 && (
        <div>
          <button
            onClick={() => setShowDone(s => !s)}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 mb-3 transition-colors"
          >
            {showDone ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {done.length} completed task{done.length !== 1 ? 's' : ''}
          </button>
          {showDone && (
            <div className="space-y-2">
              {done.map(item => (
                <TodoItem
                  key={item.id}
                  item={item}
                  onToggle={handleToggle}
                  onEdit={setModal}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <TodoModal
          item={modal || null}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
