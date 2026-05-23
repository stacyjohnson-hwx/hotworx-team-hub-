import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, RefreshCw, ToggleLeft, ToggleRight, ChevronDown } from 'lucide-react'
import { apiGet, apiPut, apiDelete } from '@/hooks/useApi'
import TaskForm from './TaskForm'

const FREQ_LABELS = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  one_off: 'One-Off',
}

const FREQ_COLORS = {
  daily: 'bg-blue-100 text-blue-700',
  weekly: 'bg-purple-100 text-purple-700',
  monthly: 'bg-orange-100 text-orange-700',
  quarterly: 'bg-teal-100 text-teal-700',
  one_off: 'bg-pink-100 text-pink-700',
}

const TYPE_COLORS = {
  Cleaning: 'bg-green-100 text-green-700',
  Operations: 'bg-indigo-100 text-indigo-700',
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function TaskLibrary() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editTask, setEditTask] = useState(null)

  const [filterFreq, setFilterFreq] = useState('all')
  const [filterType, setFilterType] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGet('/api/cleaning/tasks')
      setTasks(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd() { setEditTask(null); setShowForm(true) }
  function openEdit(task) { setEditTask(task); setShowForm(true) }

  async function toggleActive(task) {
    try {
      const updated = await apiPut(`/api/cleaning/tasks/${task.id}`, { ...task, active: !task.active })
      setTasks(prev => prev.map(t => t.id === task.id ? updated : t))
    } catch (e) {
      setError(e.message)
    }
  }

  async function deleteTask(task) {
    if (!confirm(`Delete "${task.title}"? This cannot be undone.`)) return
    try {
      await apiDelete(`/api/cleaning/tasks/${task.id}`)
      setTasks(prev => prev.filter(t => t.id !== task.id))
    } catch (e) {
      setError(e.message)
    }
  }

  function onSaved(task, isNew) {
    if (isNew) {
      setTasks(prev => [...prev, task])
    } else {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t))
    }
    setShowForm(false)
  }

  const allFreqs = [...new Set(tasks.map(t => t.frequency))]
  const allTypes = [...new Set(tasks.map(t => t.task_type).filter(Boolean))]

  const filtered = tasks.filter(t => {
    if (filterFreq !== 'all' && t.frequency !== filterFreq) return false
    if (filterType !== 'all' && t.task_type !== filterType) return false
    return true
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Loading library…
      </div>
    )
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Filters */}
        <div className="flex gap-2 flex-1 flex-wrap">
          {allFreqs.length > 1 && (
            <FilterSelect
              value={filterFreq}
              onChange={setFilterFreq}
              options={[
                { value: 'all', label: 'All frequencies' },
                ...allFreqs.map(f => ({ value: f, label: FREQ_LABELS[f] })),
              ]}
            />
          )}
          {allTypes.length > 1 && (
            <FilterSelect
              value={filterType}
              onChange={setFilterType}
              options={[
                { value: 'all', label: 'All types' },
                ...allTypes.map(t => ({ value: t, label: t })),
              ]}
            />
          )}
          <span className="text-sm text-gray-400 self-center">
            {filtered.length} of {tasks.length} task{tasks.length !== 1 ? 's' : ''}
          </span>
        </div>

        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-red-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-red-600-hover transition-colors flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Task
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm mb-4">
          {error}
        </div>
      )}

      {tasks.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No tasks yet.</p>
          <p className="text-xs mt-1">Add your first task with the button above.</p>
        </div>
      )}

      {tasks.length > 0 && filtered.length === 0 && (
        <div className="text-center py-10 text-gray-400 text-sm">
          No tasks match the selected filters.
        </div>
      )}

      {filtered.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {filtered.map(task => (
            <LibraryRow
              key={task.id}
              task={task}
              onToggleActive={() => toggleActive(task)}
              onEdit={() => openEdit(task)}
              onDelete={() => deleteTask(task)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <TaskForm
          task={editTask}
          onSaved={onSaved}
          onClose={() => setShowForm(false)}
        />
      )}
    </>
  )
}

function LibraryRow({ task, onToggleActive, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={!task.active ? 'opacity-50' : ''}>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Title + badges */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${task.active ? 'text-gray-900' : 'text-gray-500 line-through'}`}>
            {task.title}
          </p>
          <div className="flex gap-1.5 mt-1 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${FREQ_COLORS[task.frequency]}`}>
              {FREQ_LABELS[task.frequency]}
            </span>
            {task.task_type && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[task.task_type] || 'bg-gray-100 text-gray-600'}`}>
                {task.task_type}
              </span>
            )}
            {task.area && (
              <span className="text-xs text-gray-400">Category: {task.area}</span>
            )}
            <span className="text-xs text-gray-400">
              <FrequencyDetail task={task} />
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {task.description && (
            <button
              onClick={() => setExpanded(p => !p)}
              className="p-1.5 text-gray-400 hover:text-gray-700 rounded"
              title="View description"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
          <button onClick={onToggleActive} title={task.active ? 'Deactivate' : 'Activate'} className="p-1.5 text-gray-400 hover:text-gray-700 rounded">
            {task.active
              ? <ToggleRight className="w-4 h-4 text-green-500" />
              : <ToggleLeft className="w-4 h-4" />}
          </button>
          <button onClick={onEdit} title="Edit" className="p-1.5 text-gray-400 hover:text-gray-700 rounded">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={onDelete} title="Delete" className="p-1.5 text-gray-400 hover:text-red-600 rounded">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {task.description && expanded && (
        <div className="px-4 pb-3">
          <p className="text-xs text-gray-500 leading-relaxed bg-gray-50 rounded-lg p-2.5">{task.description}</p>
        </div>
      )}
    </div>
  )
}

function FrequencyDetail({ task }) {
  switch (task.frequency) {
    case 'weekly':
      return task.day_of_week != null ? `Every ${DAYS[task.day_of_week]}` : null
    case 'monthly':
      return task.day_of_month != null ? `Day ${task.day_of_month} of month` : null
    case 'quarterly':
      return task.quarterly_dates?.length ? task.quarterly_dates.join(', ') : null
    case 'one_off':
      return task.one_off_date ? `On ${task.one_off_date}` : null
    default:
      return null
  }
}

function FilterSelect({ value, onChange, options }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 cursor-pointer"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
    </div>
  )
}
