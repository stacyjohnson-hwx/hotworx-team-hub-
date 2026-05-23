import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { useRole } from '@/hooks/useRole'
import {
  CheckSquare, Plus, X, Edit2, Trash2, Check, Calendar,
  AlertCircle, ChevronDown, ChevronUp, MessageSquare, Flag,
  Shield, Users,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────
const PRIORITIES = [
  { value: 'high',   label: 'High',   color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { value: 'low',    label: 'Low',    color: 'bg-gray-100 text-gray-600 border-gray-200' },
]

const LISTS = [
  { value: 'manager', label: 'Manager To-Do', icon: Users,  color: 'text-blue-600',  bg: 'bg-blue-600', light: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'owner',   label: 'Owner To-Do',   icon: Shield, color: 'text-red-600',   bg: 'bg-red-600',  light: 'bg-red-50 text-red-700 border-red-200'   },
]

function listMeta(val) { return LISTS.find(l => l.value === val) || LISTS[0] }
function priorityMeta(val) { return PRIORITIES.find(p => p.value === val) || PRIORITIES[1] }

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
  return due_date === new Date().toISOString().split('T')[0]
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

function TodoModal({ item, defaultList, onSave, onClose }) {
  const [form, setForm] = useState(item ? {
    title:       item.title || '',
    notes:       item.notes || '',
    due_date:    item.due_date || '',
    priority:    item.priority || 'medium',
    area:        item.area || '',
    list_target: item.list_target || defaultList || 'manager',
  } : {
    title: '', notes: '', due_date: '', priority: 'medium', area: '',
    list_target: defaultList || 'manager',
  })
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

          {/* List selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Add to List</label>
            <div className="flex gap-2">
              {LISTS.map(l => {
                const Icon = l.icon
                return (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => set('list_target', l.value)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-semibold transition-all ${
                      form.list_target === l.value
                        ? `${l.light} ring-2 ring-offset-1 ring-current`
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Icon size={14} />
                    {l.value === 'manager' ? 'Manager' : 'Owner'}
                  </button>
                )
              })}
            </div>
          </div>

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
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
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
  const isDone  = item.status === 'done'
  const overdue = isOverdue(item.due_date, item.status)
  const today   = isDueToday(item.due_date, item.status)
  const priMeta = priorityMeta(item.priority)

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
            isDone ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-green-400'
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
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded border ${priMeta.color}`}>
              <Flag size={9} /> {priMeta.label}
            </span>
            {item.area && (
              <span className="inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200 capitalize">
                {item.area}
              </span>
            )}
            {item.due_date && (
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                overdue ? 'text-red-600' : today ? 'text-orange-600' : 'text-gray-500'
              }`}>
                <Calendar size={10} />
                {overdue ? 'Overdue · ' : today ? 'Due today · ' : ''}{fmtDate(item.due_date)}
              </span>
            )}
            {item.source === 'coaching' && (
              <span className="inline-flex items-center gap-1 text-xs text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded">
                <MessageSquare size={9} /> From coaching
              </span>
            )}
            {isDone && item.completed_by_name && (
              <span className="text-xs text-gray-400">Completed by {item.completed_by_name}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {!isDone && (
            <button
              onClick={() => onEdit(item)}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Edit2 size={13} />
            </button>
          )}
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
      </div>
    </div>
  )
}

// ─── List Section ─────────────────────────────────────────────────────────────
function ListSection({ listKey, items, onAdd, onToggle, onEdit, onDelete }) {
  const [showDone, setShowDone] = useState(false)
  const meta    = listMeta(listKey)
  const Icon    = meta.icon
  const open    = items.filter(i => i.status === 'open')
  const done    = items.filter(i => i.status === 'done')
  const overdue = open.filter(i => isOverdue(i.due_date, i.status))

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Section header */}
      <div className={`flex items-center justify-between px-5 py-4 border-b border-gray-100`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center`}>
            <Icon size={15} className="text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">{meta.label}</h2>
            <p className="text-xs text-gray-400">
              {open.length} open
              {overdue.length > 0 && <span className="text-red-500 font-medium"> · {overdue.length} overdue</span>}
              {done.length > 0 && <span className="text-gray-300"> · {done.length} done</span>}
            </p>
          </div>
        </div>
        <button
          onClick={() => onAdd(listKey)}
          className={`flex items-center gap-1.5 px-3 py-1.5 ${meta.bg} hover:opacity-90 text-white text-xs font-semibold rounded-lg transition-all shadow-sm`}
        >
          <Plus size={13} /> Add Task
        </button>
      </div>

      <div className="px-4 py-3 space-y-2.5">
        {/* Open tasks */}
        {open.length === 0 && done.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <CheckSquare size={28} className="mx-auto mb-2 opacity-25" />
            <p className="text-xs font-medium text-gray-400">All caught up</p>
            <p className="text-xs text-gray-300 mt-0.5">Click "Add Task" to get started.</p>
          </div>
        ) : (
          <>
            {open.map(item => (
              <TodoItem
                key={item.id}
                item={item}
                onToggle={onToggle}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}

            {/* Completed (collapsible) */}
            {done.length > 0 && (
              <div className="pt-1">
                <button
                  onClick={() => setShowDone(s => !s)}
                  className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
                >
                  {showDone ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {done.length} completed
                </button>
                {showDone && (
                  <div className="mt-2 space-y-2">
                    {done.map(item => (
                      <TodoItem
                        key={item.id}
                        item={item}
                        onToggle={onToggle}
                        onEdit={onEdit}
                        onDelete={onDelete}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TodoPage() {
  const { isOwnerOrManager } = useRole()
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  // modal: null = closed, { defaultList } = new, item obj = edit
  const [modal, setModal]     = useState(null)

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

  // TSA guard — backend also enforces this, but show a friendly message
  if (!isOwnerOrManager) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <div className="text-center">
          <CheckSquare size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium text-gray-500">Access restricted</p>
          <p className="text-xs mt-1">Manager To-Do is only visible to managers and the owner.</p>
        </div>
      </div>
    )
  }

  const managerItems = items.filter(i => i.list_target === 'owner' ? false : true)  // 'manager' or null/legacy
  const ownerItems   = items.filter(i => i.list_target === 'owner')

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CheckSquare size={22} className="text-red-600" /> To-Do Lists
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Manager and Owner task lists — visible to both roles, add to either.
        </p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* Two list sections stacked */}
      <div className="space-y-5">
        <ListSection
          listKey="manager"
          items={managerItems}
          onAdd={(list) => setModal({ defaultList: list })}
          onToggle={handleToggle}
          onEdit={(item) => setModal({ item })}
          onDelete={handleDelete}
        />
        <ListSection
          listKey="owner"
          items={ownerItems}
          onAdd={(list) => setModal({ defaultList: list })}
          onToggle={handleToggle}
          onEdit={(item) => setModal({ item })}
          onDelete={handleDelete}
        />
      </div>

      {/* Modal */}
      {modal !== null && (
        <TodoModal
          item={modal?.item || null}
          defaultList={modal?.defaultList || modal?.item?.list_target || 'manager'}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
