import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, Circle, RefreshCw, Clock, CalendarClock } from 'lucide-react'
import { apiGet, apiPost } from '@/hooks/useApi'

const SECTIONS = [
  { freq: 'weekly',    label: 'Weekly',    color: 'bg-purple-100 text-purple-700', hint: 'Next week' },
  { freq: 'monthly',   label: 'Monthly',   color: 'bg-orange-100 text-orange-700', hint: 'This month / next' },
  { freq: 'quarterly', label: 'Quarterly', color: 'bg-teal-100 text-teal-700',     hint: 'Next scheduled date' },
  { freq: 'annual',    label: 'Annual',    color: 'bg-amber-100 text-amber-700',   hint: 'Once a year' },
]

function getTodayCT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

// "Thu, Nov 12" + a relative hint ("in 5 days")
function dueLabel(dateStr, todayStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const nice = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const diff = Math.round((new Date(dateStr + 'T00:00:00') - new Date(todayStr + 'T00:00:00')) / 86400000)
  const rel = diff <= 0 ? 'soon' : diff === 1 ? 'tomorrow' : diff < 14 ? `in ${diff} days` : diff < 60 ? `in ${Math.round(diff / 7)} weeks` : `in ${Math.round(diff / 30)} months`
  return `${nice} · ${rel}`
}

export default function UpcomingTasks() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(new Set())
  const today = getTodayCT()

  const load = useCallback(async (spin = false) => {
    if (spin) setLoading(true)
    setError(null)
    try {
      const data = await apiGet(`/api/cleaning/upcoming?date=${getTodayCT()}`)
      setItems(data.items || [])
    } catch (e) { setError(e.message) }
    finally { if (spin) setLoading(false) }
  }, [])
  useEffect(() => { load(true) }, [load])

  // Mark a task done ahead of time — book the completion against its due date so
  // it counts when the day arrives and drops off this list.
  async function doAhead(item) {
    if (busy.has(item.id)) return
    setBusy(prev => new Set(prev).add(item.id))
    try {
      await apiPost('/api/cleaning/complete', { task_id: item.id, date: item.next_due })
      setItems(prev => prev.filter(i => i.id !== item.id))
    } catch (e) { setError(e.message) }
    finally { setBusy(prev => { const s = new Set(prev); s.delete(item.id); return s }) }
  }

  if (loading) return <div className="flex items-center justify-center py-16 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{error}<button onClick={() => load(true)} className="ml-3 underline">Retry</button></div>

  const byFreq = items.reduce((acc, i) => { (acc[i.frequency] = acc[i.frequency] || []).push(i); return acc }, {})
  const sections = SECTIONS.filter(s => (byFreq[s.freq] || []).length > 0)

  return (
    <div>
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex items-center gap-2">
        <CalendarClock className="w-5 h-5 text-red-600" />
        <p className="text-sm text-gray-600">Weekly, monthly, and quarterly tasks coming up. Knock one out early when it makes sense — it’ll count for its due date and come off today’s list when that day arrives.</p>
      </div>

      {sections.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">Nothing upcoming — every recurring task is either due today or already handled ahead.</p>
        </div>
      ) : sections.map(sec => (
        <div key={sec.freq} className="mb-5">
          <div className="flex items-center gap-2 mb-2 px-1">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{sec.label}</h3>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${sec.color}`}>{byFreq[sec.freq].length}</span>
            <span className="text-[11px] text-gray-300">{sec.hint}</span>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {byFreq[sec.freq].map(item => {
              const working = busy.has(item.id)
              return (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3.5">
                  <button onClick={() => doAhead(item)} disabled={working} className="flex-shrink-0 disabled:opacity-60 p-1 -m-1" aria-label="Mark done ahead of time">
                    {working ? <RefreshCw className="w-6 h-6 md:w-5 md:h-5 text-gray-400 animate-spin" /> : <Circle className="w-6 h-6 md:w-5 md:h-5 text-gray-300 hover:text-green-400" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-base md:text-sm font-medium text-gray-900">{item.title}</p>
                    <div className="flex gap-2 mt-1 flex-wrap items-center text-xs">
                      <span className="flex items-center gap-1 text-red-600 font-medium"><Clock className="w-3 h-3" /> Due {dueLabel(item.next_due, today)}</span>
                      {item.area && <span className="text-gray-400">· {item.area}</span>}
                      {item.last_completion && <span className="text-gray-400">· last done {item.last_completion.date} by {item.last_completion.by_name}</span>}
                    </div>
                  </div>
                  <button onClick={() => doAhead(item)} disabled={working}
                    className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-semibold bg-green-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50">
                    <CheckCircle className="w-3.5 h-3.5" /> Do it now
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
