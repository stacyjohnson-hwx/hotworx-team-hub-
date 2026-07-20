import { useState, useEffect, useCallback } from 'react'
import { apiGet } from '@/hooks/useApi'
import {
  Star, TrendingDown, AlertTriangle, CheckCircle2, Trophy,
  Loader2, Users, ClipboardList, RefreshCw, ChevronUp, ChevronDown,
} from 'lucide-react'

const PERIOD_OPTIONS = [
  { label: '7 days',  value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
]

// ── Helpers ────────────────────────────────────────────────────────────────────
function pct(rate) {
  if (rate === null || rate === undefined) return '—'
  return `${Math.round(rate * 100)}%`
}
function rateColor(rate) {
  if (rate === null) return 'text-gray-400'
  if (rate >= 0.9)   return 'text-green-600'
  if (rate >= 0.7)   return 'text-yellow-600'
  return 'text-red-600'
}
function rateBarColor(rate) {
  if (rate === null) return 'bg-gray-200'
  if (rate >= 0.9)   return 'bg-green-500'
  if (rate >= 0.7)   return 'bg-yellow-400'
  return 'bg-red-500'
}
function rateBg(rate) {
  if (rate === null) return 'bg-gray-50'
  if (rate >= 0.9)   return 'bg-green-50'
  if (rate >= 0.7)   return 'bg-yellow-50'
  return 'bg-red-50'
}
function freqLabel(f) {
  return { daily: 'Daily', specific_days: 'Select Days', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', one_off: 'One-off' }[f] || f
}

// ── Summary card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color = 'text-gray-800', bg = 'bg-white' }) {
  return (
    <div className={`${bg} rounded-2xl border border-gray-100 shadow-sm px-4 py-4 flex items-start gap-3`}>
      <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
        <Icon size={17} className="text-gray-500" />
      </div>
      <div className="min-w-0">
        <p className={`text-2xl font-black leading-none ${color}`}>{value}</p>
        <p className="text-xs font-semibold text-gray-600 mt-0.5 leading-tight">{label}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{sub}</p>}
      </div>
    </div>
  )
}

// ── Progress bar ───────────────────────────────────────────────────────────────
function RateBar({ rate, height = 'h-2' }) {
  const w = rate === null ? 0 : Math.round(rate * 100)
  return (
    <div className={`w-full ${height} rounded-full bg-gray-100 overflow-hidden`}>
      <div
        className={`${height} rounded-full transition-all duration-500 ${rateBarColor(rate)}`}
        style={{ width: `${w}%` }}
      />
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function CleaningAnalytics() {
  const [days,    setDays]    = useState(30)
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [taskSort, setTaskSort] = useState('rate_asc')   // rate_asc | rate_desc | missed | alpha
  const [typeFilter, setTypeFilter] = useState('all')    // all | Cleaning | Operations

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await apiGet(`/api/cleaning/analytics?days=${days}`)
      setData(res)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [days])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
      <Loader2 size={28} className="animate-spin" />
      <p className="text-sm">Loading analytics…</p>
    </div>
  )
  if (error) return (
    <div className="text-center py-16">
      <p className="text-red-500 text-sm">{error}</p>
      <button onClick={load} className="mt-3 text-xs text-gray-500 underline">Retry</button>
    </div>
  )
  if (!data) return null

  const { taskStats, userStats, totalScheduled, totalCompleted, overallRate, period, staleTasks = [] } = data

  // ── Derived stats ─────────────────────────────────────────────────────────
  const neverDone   = taskStats.filter(t => t.completedCount === 0)
  const struggling  = taskStats.filter(t => t.completionRate !== null && t.completionRate < 0.5 && t.completedCount > 0)
  const topPerformer = userStats[0] || null
  const starThreshold = topPerformer ? Math.ceil(topPerformer.count * 0.75) : Infinity

  // ── Filtered + sorted tasks ───────────────────────────────────────────────
  const filtered = taskStats.filter(t =>
    typeFilter === 'all' || t.task_type === typeFilter
  )
  const sorted = [...filtered].sort((a, b) => {
    if (taskSort === 'rate_asc')  return (a.completionRate ?? -1) - (b.completionRate ?? -1)
    if (taskSort === 'rate_desc') return (b.completionRate ?? -1) - (a.completionRate ?? -1)
    if (taskSort === 'missed')    return b.missedCount - a.missedCount
    return a.title.localeCompare(b.title)
  })

  const sortIcon = (key) => {
    if (taskSort === key + '_asc')  return <ChevronUp size={11} className="text-red-500" />
    if (taskSort === key + '_desc') return <ChevronDown size={11} className="text-red-500" />
    return <ChevronUp size={11} className="text-gray-300" />
  }
  function toggleSort(key) {
    setTaskSort(prev => prev === key + '_asc' ? key + '_desc' : key + '_asc')
  }

  return (
    <div className="space-y-6 pb-8">

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {PERIOD_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setDays(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                days === opt.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold transition-colors">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* ── Summary cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Overall completion"
          value={pct(overallRate)}
          sub={`${totalCompleted} of ${totalScheduled} tasks`}
          icon={CheckCircle2}
          color={rateColor(overallRate)}
        />
        <StatCard
          label="Never completed"
          value={neverDone.length}
          sub={`task${neverDone.length !== 1 ? 's' : ''} with 0 completions`}
          icon={AlertTriangle}
          color={neverDone.length > 0 ? 'text-red-600' : 'text-gray-400'}
        />
        <StatCard
          label="Needs attention"
          value={struggling.length}
          sub="below 50% completion"
          icon={TrendingDown}
          color={struggling.length > 0 ? 'text-yellow-600' : 'text-gray-400'}
        />
        <StatCard
          label="Team members"
          value={userStats.length}
          sub={`${period.days}-day window`}
          icon={Users}
        />
      </div>

      {/* ── Stale task alert ──────────────────────────────────────────────── */}
      {staleTasks.length > 0 && (
        <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-4">
          <div className="flex items-center gap-2 mb-2.5">
            <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
            <h2 className="text-sm font-bold text-red-800">Overdue tasks — falling behind schedule</h2>
            <span className="text-[11px] font-semibold text-red-500 ml-auto">{staleTasks.length} flagged</span>
          </div>
          <p className="text-[11px] text-red-500/80 mb-3">
            Not completed within their expected cadence (weekly, daily, etc.) — worth a look with the team.
          </p>
          <div className="space-y-1.5">
            {staleTasks.map(t => (
              <div key={t.id} className="flex items-center justify-between gap-3 bg-white/70 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">{t.title}</p>
                  <p className="text-[10px] text-gray-400">{freqLabel(t.frequency)} · {t.task_type}</p>
                </div>
                <span className="text-[11px] font-bold text-red-600 flex-shrink-0 whitespace-nowrap">
                  {t.daysSinceEver == null
                    ? 'Never done'
                    : `${t.daysSinceEver}d since last`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Star performer callout ────────────────────────────────────────── */}
      {topPerformer && (
        <div className="rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 px-5 py-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Trophy size={22} className="text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-amber-600 uppercase tracking-widest">Star Performer</p>
            <p className="text-lg font-black text-gray-900 leading-tight">{topPerformer.name}</p>
            <p className="text-xs text-gray-600 mt-0.5">
              Completed <span className="font-bold text-amber-700">{topPerformer.count} tasks</span> across{' '}
              {topPerformer.uniqueTasks} unique task{topPerformer.uniqueTasks !== 1 ? 's' : ''} in the last {period.days} days — leading the team!
            </p>
          </div>
          <Star size={28} className="text-amber-300 flex-shrink-0 fill-amber-200" />
        </div>
      )}

      {/* ── Staff leaderboard ─────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Users size={15} className="text-gray-500" />
          <h2 className="text-sm font-bold text-gray-800">Staff Breakdown</h2>
          <span className="text-[11px] text-gray-400 ml-auto">{period.from} → {period.to}</span>
        </div>

        {userStats.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400 bg-gray-50 rounded-2xl border border-gray-100">
            No completions recorded yet in this period.
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white divide-y divide-gray-50">
            {userStats.map((u, i) => {
              const isStar = u.count >= starThreshold && u.count > 0
              const barPct = topPerformer ? u.count / topPerformer.count : 0
              const medal  = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null

              return (
                <div key={u.userId} className={`flex items-center gap-3 px-4 py-3 ${i === 0 ? 'bg-amber-50/60' : ''}`}>
                  <span className="w-5 text-center text-sm flex-shrink-0">{medal || <span className="text-xs text-gray-300">#{i+1}</span>}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <p className="text-sm font-semibold text-gray-800 truncate">{u.name}</p>
                      {isStar && <Star size={12} className="text-amber-400 fill-amber-300 flex-shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${i === 0 ? 'bg-amber-400' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-orange-400' : 'bg-blue-300'}`}
                          style={{ width: `${Math.round(barPct * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 flex-shrink-0">{u.uniqueTasks} unique tasks</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-black text-gray-800 leading-none">{u.count}</p>
                    <p className="text-[10px] text-gray-400">completions</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Task breakdown ────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <ClipboardList size={15} className="text-gray-500" />
          <h2 className="text-sm font-bold text-gray-800">Task Completion Rates</h2>

          {/* Type filter */}
          <div className="ml-auto flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {['all', 'Cleaning', 'Operations'].map(t => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  typeFilter === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {t === 'all' ? 'All' : t}
              </button>
            ))}
          </div>
        </div>

        {/* Sort bar */}
        <div className="flex items-center gap-1 mb-2 px-1">
          <button onClick={() => toggleSort('rate')}
            className="flex items-center gap-0.5 text-[11px] font-semibold text-gray-500 hover:text-gray-800 transition-colors">
            Rate {sortIcon('rate')}
          </button>
          <span className="text-gray-200 mx-1">|</span>
          <button onClick={() => setTaskSort('missed')}
            className={`flex items-center gap-0.5 text-[11px] font-semibold transition-colors ${taskSort === 'missed' ? 'text-red-600' : 'text-gray-500 hover:text-gray-800'}`}>
            Most Missed
          </button>
          <span className="text-gray-200 mx-1">|</span>
          <button onClick={() => setTaskSort('alpha')}
            className={`flex items-center gap-0.5 text-[11px] font-semibold transition-colors ${taskSort === 'alpha' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>
            A–Z
          </button>
        </div>

        {sorted.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400 bg-gray-50 rounded-2xl border border-gray-100">
            No tasks scheduled in this period.
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map(task => {
              const isNever    = task.completedCount === 0
              const isStruggle = task.completionRate !== null && task.completionRate < 0.5
              const isStar     = task.completionRate !== null && task.completionRate >= 0.95 && task.scheduledCount >= 5

              return (
                <div key={task.id}
                  className={`rounded-xl border px-4 py-3 ${
                    isNever    ? 'border-red-200 bg-red-50' :
                    isStruggle ? 'border-yellow-200 bg-yellow-50' :
                    isStar     ? 'border-green-200 bg-green-50' :
                    'border-gray-100 bg-white'
                  }`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-semibold text-gray-800 leading-tight">{task.title}</p>
                        {isNever    && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Never done</span>}
                        {isStruggle && !isNever && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Needs attention</span>}
                        {isStar     && <Star size={11} className="text-green-500 fill-green-400 flex-shrink-0" title="Consistently completed" />}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          task.task_type === 'Operations'
                            ? 'bg-indigo-100 text-indigo-600'
                            : 'bg-green-100 text-green-600'
                        }`}>{task.task_type}</span>
                        <span className="text-[10px] text-gray-400">{freqLabel(task.frequency)}</span>
                        {task.lastCompletedBy && (
                          <span className="text-[10px] text-gray-400">
                            Last: <span className="font-medium text-gray-600">{task.lastCompletedBy}</span>
                            {task.daysSinceLast !== null && (
                              <span className={`ml-1 ${task.daysSinceLast > 7 ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                                ({task.daysSinceLast}d ago)
                              </span>
                            )}
                          </span>
                        )}
                        {!task.lastCompletedBy && (
                          <span className="text-[10px] text-red-500 font-semibold">Not completed in {period.days} days</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-lg font-black leading-none ${rateColor(task.completionRate)}`}>
                        {pct(task.completionRate)}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {task.completedCount}/{task.scheduledCount}
                      </p>
                    </div>
                  </div>
                  <RateBar rate={task.completionRate} />
                  {task.missedCount > 0 && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      Missed <span className={`font-semibold ${task.missedCount > 5 ? 'text-red-600' : 'text-yellow-600'}`}>{task.missedCount}</span> scheduled occurrence{task.missedCount !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

    </div>
  )
}
