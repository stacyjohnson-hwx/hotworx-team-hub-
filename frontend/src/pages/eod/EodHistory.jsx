import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Trash2, AlertTriangle, CheckCircle, Send, ChevronLeft, ChevronRight } from 'lucide-react'
import { apiGet, apiDelete, apiPost } from '@/hooks/useApi'

const VARIANCE_THRESHOLD = 5

function variance(row) {
  return parseFloat(row.drawer_end) - parseFloat(row.drawer_start) - parseFloat(row.cash_collected)
}

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0)
}

function shiftLabel(type) {
  return { opening: 'Opening', mid: 'Mid', closing: 'Closing' }[type] || type
}

function shiftColor(type) {
  return {
    opening: 'bg-blue-100 text-blue-700',
    mid: 'bg-orange-100 text-orange-700',
    closing: 'bg-purple-100 text-purple-700',
  }[type] || 'bg-gray-100 text-gray-700'
}

// Returns YYYY-MM-DD for a Date object using Chicago timezone
function toChicagoDateStr(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

// Returns YYYY-MM-DD for today in Chicago timezone
function todayChicago() {
  return toChicagoDateStr(new Date())
}

// Returns YYYY-MM-DD for the Monday of the week containing `dateStr` (Chicago)
function mondayOfWeek(dateStr) {
  // Parse as noon UTC to avoid DST edge cases
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay() // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day // adjust so Monday=0
  d.setDate(d.getDate() + diff)
  return toChicagoDateStr(d)
}

// Returns YYYY-MM-DD for the Sunday of the week (or today if in current week)
function sundayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  const diff = day === 0 ? 0 : 7 - day
  d.setDate(d.getDate() + diff)
  return toChicagoDateStr(d)
}

// Add N days to a YYYY-MM-DD string
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return toChicagoDateStr(d)
}

// Format date for display: "Monday, May 26"
function formatDateLabel(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

export default function EodHistory() {
  const today = todayChicago()
  const [weekStart, setWeekStart] = useState(() => mondayOfWeek(today))
  const weekEnd = sundayOfWeek(weekStart)
  const isCurrentWeek = weekStart === mondayOfWeek(today)

  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sending, setSending] = useState(false)
  const [sendMsg, setSendMsg] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Use full Mon–Sun range so any day's submissions are visible.
      // Future days simply have no data and won't render.
      const data = await apiGet(`/api/eod?from=${weekStart}&to=${weekEnd}`)
      setSubmissions(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [weekStart, weekEnd])

  useEffect(() => { load() }, [load])

  function prevWeek() {
    setWeekStart(prev => addDays(prev, -7))
    setSendMsg(null)
  }

  function nextWeek() {
    if (!isCurrentWeek) {
      setWeekStart(prev => addDays(prev, 7))
      setSendMsg(null)
    }
  }

  async function deleteSubmission(id) {
    if (!confirm('Delete this EOD submission?')) return
    try {
      await apiDelete(`/api/eod/${id}`)
      setSubmissions(prev => prev.filter(s => s.id !== id))
    } catch (e) {
      setError(e.message)
    }
  }

  async function sendDigest() {
    setSending(true)
    setSendMsg(null)
    try {
      await apiPost('/api/eod/send-digest', { date: today })
      setSendMsg('Email digest sent!')
    } catch (e) {
      setSendMsg(`Error: ${e.message}`)
    } finally {
      setSending(false)
    }
  }

  // Group submissions by shift_date, newest date first
  const byDate = submissions.reduce((acc, s) => {
    if (!acc[s.shift_date]) acc[s.shift_date] = []
    acc[s.shift_date].push(s)
    return acc
  }, {})
  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))

  // Week label — always show full Mon–Sun range
  const fmtShort = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const weekLabel = isCurrentWeek
    ? `This week (${fmtShort(weekStart)} – ${fmtShort(weekEnd)})`
    : `${fmtShort(weekStart)} – ${fmtShort(weekEnd)}`

  return (
    <div>
      {/* Week navigator + actions */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={prevWeek}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            title="Previous week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[120px] text-center">{weekLabel}</span>
          <button
            onClick={nextWeek}
            disabled={isCurrentWeek}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next week"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {sendMsg && (
            <span className={`text-xs ${sendMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
              {sendMsg}
            </span>
          )}
          <button
            onClick={sendDigest}
            disabled={sending}
            className="flex items-center gap-1.5 text-sm font-medium border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            <Send className="w-3.5 h-3.5" />
            {sending ? 'Sending…' : 'Send Digest Email'}
          </button>
          <button onClick={load} className="text-gray-400 hover:text-gray-600" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm mb-4">{error}</div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      )}

      {!loading && submissions.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No EOD submissions for {weekLabel.toLowerCase()}.</p>
        </div>
      )}

      {!loading && sortedDates.map(date => (
        <div key={date} className="mb-6">
          {/* Date header */}
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-gray-700">{formatDateLabel(date)}</h3>
            {date === today && (
              <span className="text-xs bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full">Today</span>
            )}
          </div>

          <div className="space-y-4">
            {byDate[date].map(sub => {
              const v = variance(sub)
              const varAlert = Math.abs(v) > VARIANCE_THRESHOLD
              return (
                <div key={sub.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${shiftColor(sub.shift_type)}`}>
                        {shiftLabel(sub.shift_type)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(sub.submitted_at).toLocaleTimeString('en-US', {
                          hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago',
                        })}
                      </span>
                    </div>
                    <button onClick={() => deleteSubmission(sub.id)} className="text-gray-400 hover:text-red-600 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-4 space-y-4 text-sm">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {/* Drawer */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Drawer</p>
                        <p className="text-gray-700">Start: {fmt(sub.drawer_start)}</p>
                        <p className="text-gray-700">Cash: {fmt(sub.cash_collected)}</p>
                        <p className="text-gray-700">Credit: {fmt(sub.credit_collected)}</p>
                        <p className="text-gray-700">End: {fmt(sub.drawer_end)}</p>
                        <p className={`font-semibold mt-1 flex items-center gap-1 ${varAlert ? 'text-red-600' : 'text-green-600'}`}>
                          {varAlert ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                          Variance: {v >= 0 ? '+' : ''}{fmt(v)}
                        </p>
                      </div>

                      {/* Sales */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Sales</p>
                        <p className="text-gray-700">Sweat Basic: {sub.sweat_basic ?? 0}</p>
                        <p className="text-gray-700">Sweat Elite: {sub.sweat_elite ?? 0}</p>
                        <p className="text-gray-700">Cancellations: {sub.cancellations_count ?? 0}</p>
                        <p className="text-gray-700">Retail: {fmt(sub.retail_amount)}</p>
                        <p className="text-gray-700">Red Appts: {sub.red_appt_scheduled ?? 0}</p>
                      </div>

                      {/* Sales Training */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Sales Training</p>
                        {sub.watched_training_video && <p className="text-green-600">✅ Training video</p>}
                        {sub.role_played_script     && <p className="text-green-600">✅ Role played script</p>}
                        {sub.used_sales_gpt         && <p className="text-green-600">✅ Sales GPT</p>}
                        {!sub.watched_training_video && !sub.role_played_script && !sub.used_sales_gpt && (
                          <p className="text-gray-400 text-xs italic">None completed</p>
                        )}
                        {sub.orders_needed && (
                          <div className="mt-2">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Orders Needed</p>
                            <p className="text-gray-700 text-xs">{sub.orders_needed}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Completed Cleaning Tasks */}
                    {(sub.completed_cleaning?.length > 0) && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Cleaning Completed</p>
                        <div className="flex flex-wrap gap-1.5">
                          {sub.completed_cleaning.map((t, i) => (
                            <span key={i} className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full border border-green-200">
                              ✅ {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Completed Operations Tasks */}
                    {(sub.completed_operations?.length > 0) && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Operations Completed</p>
                        <div className="flex flex-wrap gap-1.5">
                          {sub.completed_operations.map((t, i) => (
                            <span key={i} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-medium px-2 py-0.5 rounded-full border border-indigo-200">
                              ✅ {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Completed Growth Missions */}
                    {(sub.completed_missions?.length > 0) && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Missions Completed</p>
                        <div className="flex flex-wrap gap-1.5">
                          {sub.completed_missions.map((t, i) => (
                            <span key={i} className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 text-xs font-medium px-2 py-0.5 rounded-full border border-orange-200">
                              ✅ {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {sub.general_notes && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Notes</p>
                        <p className="text-gray-700 text-xs">{sub.general_notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
