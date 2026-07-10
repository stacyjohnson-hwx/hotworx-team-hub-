import { useState, useEffect, useCallback, useRef } from 'react'
import { CheckCircle, Circle, RefreshCw, ChevronDown, Clock, History, X } from 'lucide-react'
import { apiGet, apiPost, apiDelete } from '@/hooks/useApi'
import { useAuth } from '@/contexts/AuthContext'

const FREQ_LABELS = {
  daily: 'Daily',
  specific_days: 'Select Days',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  one_off: 'One-Off',
}

const FREQ_COLORS = {
  daily: 'bg-blue-100 text-blue-700',
  specific_days: 'bg-cyan-100 text-cyan-700',
  weekly: 'bg-purple-100 text-purple-700',
  monthly: 'bg-orange-100 text-orange-700',
  quarterly: 'bg-teal-100 text-teal-700',
  one_off: 'bg-pink-100 text-pink-700',
}

const TYPE_COLORS = {
  Cleaning: 'bg-green-100 text-green-700',
  Operations: 'bg-indigo-100 text-indigo-700',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Relative label from a completion_date (YYYY-MM-DD, in studio/Chicago time).
// Compares CALENDAR days against today in Chicago — NOT rolling 24h windows, which
// made a task closed last night read "today" the next morning.
function relativeDate(dateStr) {
  if (!dateStr) return null
  const dayStr = String(dateStr).slice(0, 10)   // tolerate a full timestamp too
  const d = new Date(dayStr + 'T00:00:00')
  const t = new Date(getTodayCT() + 'T00:00:00')
  const diffDays = Math.round((t - d) / 86400000)

  if (diffDays <= 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 14) return '1 week ago'
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 60) return '1 month ago'
  return `${Math.floor(diffDays / 30)} months ago`
}

function fmtDateTime(str) {
  if (!str) return ''
  return new Date(str).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

// ── History Modal ─────────────────────────────────────────────────────────────

function HistoryModal({ task, onClose }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    apiGet(`/api/cleaning/history/${task.id}`)
      .then(setHistory)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [task.id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-0.5">
              <History className="w-4 h-4 text-red-600 flex-shrink-0" />
              <h2 className="text-base font-semibold text-gray-900">Completion History</h2>
            </div>
            <p className="text-sm text-gray-500 truncate">{task.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              Loading history…
            </div>
          )}
          {error && (
            <p className="text-sm text-red-600 text-center py-6">{error}</p>
          )}
          {!loading && !error && history.length === 0 && (
            <div className="text-center py-10">
              <Clock className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No completions recorded yet.</p>
            </div>
          )}
          {!loading && !error && history.length > 0 && (
            <ol className="space-y-0">
              {history.map((entry, i) => (
                <li key={entry.id} className="flex gap-3">
                  {/* Timeline line */}
                  <div className="flex flex-col items-center">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 ${i === 0 ? 'bg-green-500' : 'bg-gray-300'}`} />
                    {i < history.length - 1 && <div className="w-px flex-1 bg-gray-100 my-1" />}
                  </div>
                  {/* Content */}
                  <div className="pb-4 flex-1">
                    <p className="text-sm font-medium text-gray-900">{entry.by_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{fmtDateTime(entry.completed_at)}</p>
                    {i === 0 && (
                      <span className="inline-block mt-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        Most recent
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Footer */}
        {history.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
            <p className="text-xs text-gray-400 text-center">
              Showing last {history.length} completion{history.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main TaskList ─────────────────────────────────────────────────────────────

// Always use Central time so tasks reset at midnight CT, not midnight UTC
function getTodayCT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

export default function TaskList() {
  const { user } = useAuth()
  const [today, setToday] = useState(getTodayCT)

  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toggling, setToggling] = useState(new Set())
  const [historyTask, setHistoryTask] = useState(null)

  const [filterFreq, setFilterFreq] = useState('all')
  const [filterType, setFilterType] = useState('all')

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    setError(null)
    try {
      const currentDate = getTodayCT()
      // If date rolled over midnight CT, update the date state
      setToday(prev => prev !== currentDate ? currentDate : prev)
      const data = await apiGet(`/api/cleaning/today?date=${currentDate}`)
      setTasks(data.tasks)
    } catch (e) {
      setError(e.message)
    } finally {
      if (showSpinner) setLoading(false)
    }
  }, [])

  // Initial load with spinner
  useEffect(() => { load(true) }, [load])

  // Poll every 30 seconds — picks up completions from other users without a manual refresh
  useEffect(() => {
    const interval = setInterval(() => load(false), 30_000)
    return () => clearInterval(interval)
  }, [load])

  async function toggle(task) {
    if (toggling.has(task.id)) return
    setToggling(prev => new Set(prev).add(task.id))
    const currentDate = getTodayCT()
    try {
      if (task.completed) {
        await apiDelete('/api/cleaning/complete', { task_id: task.id, date: currentDate })
        setTasks(prev => prev.map(t =>
          t.id === task.id ? { ...t, completed: false, completion: null } : t
        ))
      } else {
        await apiPost('/api/cleaning/complete', { task_id: task.id, date: currentDate })
        // After completing, update last_completion to today
        const nowStr = new Date().toISOString()
        setTasks(prev => prev.map(t =>
          t.id === task.id ? {
            ...t,
            completed: true,
            completion: { completed_by: user?.id, completed_at: nowStr },
            last_completion: {
              date: today,
              completed_at: nowStr,
              by_id: user?.id,
              by_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'You',
            },
          } : t
        ))
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setToggling(prev => { const s = new Set(prev); s.delete(task.id); return s })
    }
  }

  const filtered = tasks.filter(t => {
    if (filterFreq !== 'all' && t.frequency !== filterFreq) return false
    if (filterType !== 'all' && t.task_type !== filterType) return false
    return true
  })

  const completedCount = filtered.filter(t => t.completed).length
  const total = filtered.length

  const grouped = filtered.reduce((acc, t) => {
    const key = t.area || 'General'
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})

  // Sort groups: Open, Close, Saunas, FX Zone, General (and any legacy areas last)
  const CATEGORY_ORDER = ['Open', 'Close', 'Saunas', 'FX Zone', 'General']
  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => {
    const ai = CATEGORY_ORDER.indexOf(a)
    const bi = CATEGORY_ORDER.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })

  const dateLabel = new Date(today + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  const activeFreqs = [...new Set(tasks.map(t => t.frequency))]
  const activeTypes = [...new Set(tasks.map(t => t.task_type).filter(Boolean))].filter(t => t !== 'Marketing')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Loading tasks…
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
        {error}
        <button onClick={load} className="ml-3 underline">Retry</button>
      </div>
    )
  }

  return (
    <div>
      {/* Progress header */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">{dateLabel}</p>
          <p className="text-lg font-semibold text-gray-900 mt-0.5">
            {completedCount} / {total} tasks complete
          </p>
        </div>
        <div className="flex items-center gap-3">
          {total > 0 && (
            <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-600 rounded-full transition-all duration-500"
                style={{ width: `${total > 0 ? (completedCount / total) * 100 : 0}%` }}
              />
            </div>
          )}
          <button onClick={load} className="text-gray-400 hover:text-gray-600" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      {tasks.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {activeFreqs.length > 1 && (
            <FilterSelect
              value={filterFreq}
              onChange={setFilterFreq}
              options={[
                { value: 'all', label: 'All frequencies' },
                ...activeFreqs.map(f => ({ value: f, label: FREQ_LABELS[f] })),
              ]}
            />
          )}
          {activeTypes.length > 1 && (
            <FilterSelect
              value={filterType}
              onChange={setFilterType}
              options={[
                { value: 'all', label: 'All types' },
                ...activeTypes.map(t => ({ value: t, label: t })),
              ]}
            />
          )}
        </div>
      )}

      {tasks.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No tasks scheduled for today.</p>
          <p className="text-xs mt-1">Tasks are added by the manager in the Task Library tab.</p>
        </div>
      )}

      {tasks.length > 0 && filtered.length === 0 && (
        <div className="text-center py-10 text-gray-400 text-sm">
          No tasks match the selected filters.
        </div>
      )}

      {/* Task groups */}
      {sortedGroups.map(([area, areaTasks]) => (
        <div key={area} className="mb-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">
            {area}
          </h3>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {areaTasks.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                loading={toggling.has(task.id)}
                onToggle={() => toggle(task)}
                onHistory={() => setHistoryTask(task)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* History modal */}
      {historyTask && (
        <HistoryModal task={historyTask} onClose={() => setHistoryTask(null)} />
      )}
    </div>
  )
}

// ── TaskRow ───────────────────────────────────────────────────────────────────

function TaskRow({ task, loading, onToggle, onHistory }) {
  const [expanded, setExpanded] = useState(false)
  const lc = task.last_completion

  return (
    <div className={task.completed ? 'bg-green-50/40' : ''}>
      {/* Make the whole left side (checkbox + title) one tap target on mobile */}
      <div className="flex items-center gap-3 px-4 py-4 md:py-3.5">
        {/* Checkbox — larger touch target on mobile */}
        <button
          onClick={onToggle}
          disabled={loading}
          className="flex-shrink-0 disabled:opacity-60 p-1 -m-1"
          aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
        >
          {loading ? (
            <RefreshCw className="w-6 h-6 md:w-5 md:h-5 text-gray-400 animate-spin" />
          ) : task.completed ? (
            <CheckCircle className="w-6 h-6 md:w-5 md:h-5 text-green-500" />
          ) : (
            <Circle className="w-6 h-6 md:w-5 md:h-5 text-gray-300" />
          )}
        </button>

        {/* Title + badges + last completed */}
        <div className="flex-1 min-w-0" onClick={onToggle}>
          <p className={`text-base md:text-sm font-medium ${task.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>
            {task.title}
          </p>
          <div className="flex gap-1.5 mt-1 flex-wrap items-center">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${FREQ_COLORS[task.frequency]}`}>
              {FREQ_LABELS[task.frequency]}
            </span>
            {task.task_type && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[task.task_type] || 'bg-gray-100 text-gray-600'}`}>
                {task.task_type}
              </span>
            )}
            {lc && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Clock className="w-3 h-3 flex-shrink-0" />
                {relativeDate(lc.date || lc.completed_at)} by {lc.by_name}
              </span>
            )}
            {!lc && (
              <span className="text-xs text-gray-300 italic">Never completed</span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* History button */}
          <button
            onClick={onHistory}
            className="p-1.5 text-gray-300 hover:text-gray-500 rounded-lg hover:bg-gray-100 transition-colors"
            title="View history"
          >
            <History className="w-3.5 h-3.5" />
          </button>

          {/* Expand description */}
          {task.description && (
            <button
              onClick={() => setExpanded(p => !p)}
              className="p-1.5 text-gray-300 hover:text-gray-500 rounded-lg hover:bg-gray-100 transition-colors"
              title="Show details"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {task.description && expanded && (
        <div className="px-4 pb-3 pl-[3.25rem]">
          <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-line">{task.description}</p>
        </div>
      )}
    </div>
  )
}

function FilterSelect({ value, onChange, options }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 cursor-pointer"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
    </div>
  )
}
