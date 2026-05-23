import { useState, useEffect, useCallback } from 'react'
import { Plus, Minus, RefreshCw, Save } from 'lucide-react'
import { apiGet, apiPut } from '@/hooks/useApi'
import { useMonth } from '@/contexts/MonthContext'
import LeadGenHQ from './hq/LeadGenHQ'

function toDateStr(d) { return d.toLocaleDateString('en-CA') }
function todayStr() { return toDateStr(new Date()) }

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const { selectedMonth: { month, year } } = useMonth()

  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  // Today's editable state
  const [count,   setCount]   = useState(0)
  const [notes,   setNotes]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  const isCurrentMonth = month === new Date().getMonth() + 1 && year === new Date().getFullYear()

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const d = await apiGet(`/api/leads?month=${month}&year=${year}`)
      setData(d)
      // Pre-fill today's entry if it exists
      if (isCurrentMonth) {
        const today = d.entries?.find(e => e.lead_date === todayStr())
        setCount(today?.count ?? 0)
        setNotes(today?.notes ?? '')
      }
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [month, year, isCurrentMonth])

  useEffect(() => { load() }, [load])

  async function saveTodayLeads() {
    setSaving(true); setSaved(false); setError(null)
    try {
      const updated = await apiPut('/api/leads', { count, notes, date: todayStr() })
      // Update local data
      setData(prev => {
        if (!prev) return prev
        const entries = prev.entries.filter(e => e.lead_date !== todayStr())
        entries.push(updated)
        const month_total = entries.reduce((s, e) => s + e.count, 0)
        const sparkline = prev.sparkline.map(s =>
          s.date === todayStr() ? { ...s, count } : s
        )
        return { ...prev, entries, month_total, sparkline }
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-gray-400">
      <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
    </div>
  )

  const daily_goal   = data?.daily_goal   ?? 5
  const monthly_goal = data?.monthly_goal ?? 145
  const month_total  = data?.month_total  ?? 0
  const sparkline    = data?.sparkline    ?? []
  const monthPct     = monthly_goal > 0 ? Math.min(100, (month_total / monthly_goal) * 100) : 0

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Lead Generation</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} — Daily goal: {daily_goal} · Monthly goal: {monthly_goal}
        </p>
      </div>

      {/* Lead Gen HQ — mission-based outreach system */}
      <div className="mb-6">
        <LeadGenHQ />
      </div>

      {/* ── Daily Tracker ─────────────────────────────────────────────────── */}
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Daily Tracker</p>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm mb-4">{error}</div>}

      {/* Today's entry — only in current month */}
      {isCurrentMonth && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-gray-700">Today's Leads</p>
              <p className="text-xs text-gray-400">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${count >= daily_goal ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              Goal: {daily_goal}/day
            </span>
          </div>

          {/* Counter */}
          <div className="flex items-center justify-center gap-6 mb-5">
            <button
              onClick={() => setCount(c => Math.max(0, c - 1))}
              className="w-12 h-12 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-400 hover:border-red-600 hover:text-red-600 transition-colors"
            >
              <Minus className="w-5 h-5" />
            </button>
            <div className="text-center">
              <p className={`text-6xl font-bold tabular-nums ${count >= daily_goal ? 'text-green-600' : 'text-gray-900'}`}>{count}</p>
              {count >= daily_goal && <p className="text-xs text-green-600 font-medium mt-1">Goal met! 🎉</p>}
            </div>
            <button
              onClick={() => setCount(c => c + 1)}
              className="w-12 h-12 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-400 hover:border-red-600 hover:text-red-600 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Notes */}
          <textarea
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes (optional)…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 mb-3"
          />

          <button
            onClick={saveTodayLeads}
            disabled={saving}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              saved ? 'bg-green-600 text-white' : 'bg-red-600 text-white hover:bg-red-600-hover'
            } disabled:opacity-60`}
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      )}

      {/* Monthly progress */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-end justify-between mb-2">
          <div>
            <p className="text-sm font-semibold text-gray-700">Monthly Total</p>
            <p className="text-3xl font-bold text-gray-900 mt-0.5">{month_total}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">of {monthly_goal} goal</p>
            <p className={`text-lg font-bold ${month_total >= monthly_goal ? 'text-green-600' : 'text-gray-600'}`}>
              {Math.round(monthPct)}%
            </p>
          </div>
        </div>
        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${month_total >= monthly_goal ? 'bg-green-500' : 'bg-red-600'}`}
            style={{ width: `${monthPct}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1.5">{monthly_goal - month_total > 0 ? `${monthly_goal - month_total} more to reach monthly goal` : 'Monthly goal reached!'}</p>
      </div>

      {/* 7-day sparkline */}
      {sparkline.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-semibold text-gray-700 mb-4">Last 7 Days</p>
          <Sparkline data={sparkline} dailyGoal={daily_goal} />
        </div>
      )}
    </div>
  )
}

// ─── 7-Day Bar Chart ──────────────────────────────────────────────────────────

function Sparkline({ data, dailyGoal }) {
  const maxCount = Math.max(...data.map(d => d.count), dailyGoal, 1)
  const todayS   = todayStr()

  return (
    <div className="space-y-1">
      {/* Bars */}
      <div className="flex items-end gap-1.5 h-32">
        {data.map(({ date, count }) => {
          const isToday  = date === todayS
          const metGoal  = count >= dailyGoal
          const heightPct = (count / maxCount) * 100
          const goalLinePct = (dailyGoal / maxCount) * 100

          return (
            <div key={date} className="flex-1 flex flex-col items-center justify-end h-full relative">
              {/* Goal line marker on first bar */}
              {date === data[0]?.date && (
                <div
                  className="absolute left-0 right-0 border-t border-dashed border-gray-300"
                  style={{ bottom: `${goalLinePct}%` }}
                />
              )}
              {/* Count label */}
              {count > 0 && (
                <span className="text-xs font-medium text-gray-600 mb-0.5 z-10">{count}</span>
              )}
              {/* Bar */}
              <div
                className={`w-full rounded-t-md transition-all ${
                  isToday
                    ? metGoal ? 'bg-green-500' : 'bg-red-600'
                    : metGoal ? 'bg-green-400' : 'bg-gray-300'
                }`}
                style={{ height: count > 0 ? `${heightPct}%` : '4px', opacity: count > 0 ? 1 : 0.3 }}
              />
            </div>
          )
        })}
      </div>

      {/* Goal line label */}
      <div className="flex items-end gap-1.5">
        {data.map(({ date }) => {
          const d = new Date(date + 'T00:00:00')
          const isToday = date === todayS
          return (
            <div key={date} className="flex-1 text-center">
              <p className={`text-xs ${isToday ? 'font-bold text-red-600' : 'text-gray-400'}`}>
                {d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1)}
              </p>
              <p className="text-xs text-gray-300">{d.getDate()}</p>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400 mt-2">
        <span className="inline-block w-3 border-t border-dashed border-gray-400 mr-1 align-middle" />
        Daily goal ({dailyGoal})
      </p>
    </div>
  )
}
