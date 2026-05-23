import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, RefreshCw, X, Flag, Calendar, LayoutGrid, MessageSquare } from 'lucide-react'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { useRole } from '@/hooks/useRole'

// ─── Date helpers ─────────────────────────────────────────────────────────────

function mondayOf(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return d
}

function sundayOf(date) {
  const d = new Date(date)
  const day = d.getDay()
  if (day !== 0) d.setDate(d.getDate() + (7 - day))
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function toDateStr(date) {
  return date.toLocaleDateString('en-CA')
}

function formatTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h < 12 ? 'AM' : 'PM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

function dateInRange(dateStr, start, end) {
  return dateStr >= start && dateStr <= end
}

// Build a month grid: array of 4–6 week arrays, each with 7 Date objects
function getMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1)
  const lastDay  = new Date(year, month + 1, 0)
  const gridStart = mondayOf(firstDay)
  const gridEnd   = sundayOf(lastDay)
  const days = []
  const cur = new Date(gridStart)
  while (cur <= gridEnd) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1) }
  const weeks = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
  return {
    weeks,
    gridStart: toDateStr(gridStart),
    gridEnd:   toDateStr(gridEnd),
  }
}

// Hours helpers
function shiftMinutes(start, end) {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm))
}

function fmtHours(mins) {
  if (!mins) return ''
  const h = mins / 60
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ─── Color system ─────────────────────────────────────────────────────────────

const PERSON_COLORS = [
  { shift: 'bg-blue-50 border-blue-200 text-blue-800',     timeoff: 'bg-blue-100 text-blue-700 border-blue-200' },
  { shift: 'bg-purple-50 border-purple-200 text-purple-800', timeoff: 'bg-purple-100 text-purple-700 border-purple-200' },
  { shift: 'bg-green-50 border-green-200 text-green-800',  timeoff: 'bg-green-100 text-green-700 border-green-200' },
  { shift: 'bg-orange-50 border-orange-200 text-orange-800', timeoff: 'bg-orange-100 text-orange-700 border-orange-200' },
  { shift: 'bg-pink-50 border-pink-200 text-pink-800',     timeoff: 'bg-pink-100 text-pink-700 border-pink-200' },
  { shift: 'bg-teal-50 border-teal-200 text-teal-800',     timeoff: 'bg-teal-100 text-teal-700 border-teal-200' },
]

const colorCache = {}
function personColorIdx(userId) {
  if (colorCache[userId] === undefined)
    colorCache[userId] = Object.keys(colorCache).length % PERSON_COLORS.length
  return colorCache[userId]
}
const shiftColor   = id => PERSON_COLORS[personColorIdx(id)].shift
const timeOffColor = id => PERSON_COLORS[personColorIdx(id)].timeoff

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const { isOwnerOrManager } = useRole()

  const [view, setView] = useState('week')

  // Week view state
  const [weekStart, setWeekStart] = useState(() => toDateStr(mondayOf(new Date())))

  // Month view state
  const today = toDateStr(new Date())
  const [monthYear, setMonthYear] = useState(() => ({ month: new Date().getMonth(), year: new Date().getFullYear() }))

  const [shifts,         setShifts]         = useState([])
  const [users,          setUsers]           = useState([])
  const [timeOffReqs,    setTimeOffReqs]     = useState([])
  const [blockedDays,    setBlockedDays]     = useState([])
  const [events,         setEvents]          = useState([])
  const [loading,        setLoading]         = useState(true)
  const [error,          setError]           = useState(null)
  const [formState,      setFormState]       = useState(null)
  const [holidayForm,    setHolidayForm]     = useState(null)

  // Derive date range from current view — always returns both start + end
  const rangeParams = useCallback(() => {
    if (view === 'week') {
      const end = toDateStr(addDays(new Date(weekStart + 'T00:00:00'), 6))
      return { weekStart, end }
    } else {
      const { gridStart, gridEnd } = getMonthGrid(monthYear.year, monthYear.month)
      return { weekStart: gridStart, end: gridEnd }
    }
  }, [view, weekStart, monthYear])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { weekStart: start, end } = rangeParams()
      const [shiftsData, usersData, timeOffData, blockedData, eventsData] = await Promise.all([
        apiGet(`/api/schedule?weekStart=${start}&end=${end}`),
        apiGet('/api/users'),
        apiGet(`/api/schedule/timeoff-week?weekStart=${start}&end=${end}`),
        apiGet(`/api/schedule/blocked?weekStart=${start}&end=${end}`),
        apiGet(`/api/events?startDate=${start}&endDate=${end}`),
      ])
      setShifts(shiftsData)
      setUsers(usersData) // all roles including owner
      setTimeOffReqs(timeOffData)
      setBlockedDays(blockedData)
      setEvents(eventsData)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [rangeParams])

  useEffect(() => { load() }, [load])

  // ── Week navigation ──
  function prevWeek() { setWeekStart(toDateStr(addDays(new Date(weekStart + 'T00:00:00'), -7))) }
  function nextWeek() { setWeekStart(toDateStr(addDays(new Date(weekStart + 'T00:00:00'), 7))) }
  function goToToday() {
    if (view === 'week') setWeekStart(toDateStr(mondayOf(new Date())))
    else setMonthYear({ month: new Date().getMonth(), year: new Date().getFullYear() })
  }

  // ── Month navigation ──
  function prevMonth() {
    setMonthYear(({ month, year }) => month === 0 ? { month: 11, year: year - 1 } : { month: month - 1, year })
  }
  function nextMonth() {
    setMonthYear(({ month, year }) => month === 11 ? { month: 0, year: year + 1 } : { month: month + 1, year })
  }

  // ── Shift actions ──
  function openAdd(date) { setFormState({ shift: null, date }) }
  function openEdit(shift) { setFormState({ shift, date: shift.shift_date }) }

  async function deleteShift(id) {
    if (!confirm('Delete this shift?')) return
    try {
      await apiDelete(`/api/schedule/${id}`)
      setShifts(prev => prev.filter(s => s.id !== id))
    } catch (e) { setError(e.message) }
  }

  function onSaved(shift, isNew) {
    setShifts(prev => isNew
      ? [...prev, shift].sort((a, b) => a.shift_date.localeCompare(b.shift_date) || a.start_time.localeCompare(b.start_time))
      : prev.map(s => s.id === shift.id ? shift : s)
    )
    setFormState(null)
  }

  // ── Blocked day actions ──
  async function addBlockedDay(date, label, block_type) {
    try {
      const created = await apiPost('/api/schedule/blocked', { block_date: date, label, block_type })
      setBlockedDays(prev => [...prev.filter(b => b.block_date !== date), created])
    } catch (e) { setError(e.message) }
    setHolidayForm(null)
  }

  async function removeBlockedDay(id) {
    try {
      await apiDelete(`/api/schedule/blocked/${id}`)
      setBlockedDays(prev => prev.filter(b => b.id !== id))
    } catch (e) { setError(e.message) }
  }

  // ── Label helpers ──
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(new Date(weekStart + 'T00:00:00'), i))
  const weekLabel = (() => {
    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${fmt(weekDays[0])} – ${fmt(weekDays[6])}, ${weekDays[0].getFullYear()}`
  })()
  const monthLabel = new Date(monthYear.year, monthYear.month, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              onClick={() => setView('week')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
                view === 'week' ? 'bg-red-600 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Week
            </button>
            <button
              onClick={() => setView('month')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-l border-gray-300 transition-colors ${
                view === 'month' ? 'bg-red-600 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" /> Month
            </button>
          </div>

          {/* Navigation */}
          <button onClick={goToToday} className="text-sm text-gray-500 hover:text-gray-800 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
            Today
          </button>
          <button onClick={view === 'week' ? prevWeek : prevMonth} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[180px] text-center">
            {view === 'week' ? weekLabel : monthLabel}
          </span>
          <button onClick={view === 'week' ? nextWeek : nextMonth} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={load} className="text-gray-400 hover:text-gray-600 p-2">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm mb-4">{error}</div>
      )}

      {view === 'week' ? (
        <>
          <WeekGrid
            days={weekDays}
            shifts={shifts}
            timeOffReqs={timeOffReqs}
            blockedDays={blockedDays}
            events={events}
            loading={loading}
            today={today}
            isOwnerOrManager={isOwnerOrManager}
            onAdd={openAdd}
            onEdit={openEdit}
            onDelete={deleteShift}
            onAddHoliday={date => setHolidayForm({ date })}
            onRemoveHoliday={removeBlockedDay}
          />

          {/* Hours summary table — manager/owner only, week view only */}
          {isOwnerOrManager && !loading && shifts.length > 0 && (
            <HoursTable shifts={shifts} days={weekDays} />
          )}
        </>
      ) : (
        <MonthGrid
          monthYear={monthYear}
          shifts={shifts}
          timeOffReqs={timeOffReqs}
          blockedDays={blockedDays}
          events={events}
          loading={loading}
          today={today}
          isOwnerOrManager={isOwnerOrManager}
          onAdd={openAdd}
          onEdit={openEdit}
          onDelete={deleteShift}
          onAddHoliday={date => setHolidayForm({ date })}
          onRemoveHoliday={removeBlockedDay}
        />
      )}

      {formState && (
        <ShiftForm
          shift={formState.shift}
          defaultDate={formState.date}
          users={users}
          onSaved={onSaved}
          onClose={() => setFormState(null)}
        />
      )}

      {holidayForm && (
        <HolidayForm
          date={holidayForm.date}
          onSave={addBlockedDay}
          onClose={() => setHolidayForm(null)}
        />
      )}
    </div>
  )
}

// ─── Week grid ────────────────────────────────────────────────────────────────

function WeekGrid({ days, shifts, timeOffReqs, blockedDays, events, loading, today, isOwnerOrManager, onAdd, onEdit, onDelete, onAddHoliday, onRemoveHoliday }) {
  // Time-off legend
  const uniqueTimeOff = [...new Map(timeOffReqs.map(r => [r.requested_by, r])).values()]

  return (
    <>
      {uniqueTimeOff.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {uniqueTimeOff.map(r => (
            <div key={r.requested_by} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${timeOffColor(r.requested_by)}`}>
              <span className="w-2 h-2 rounded-full bg-current opacity-60" />
              {r.requester_name} — Time Off
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-7 gap-2">
        {days.map((day, i) => {
          const dateStr = toDateStr(day)
          const isToday  = dateStr === today
          const dayShifts   = shifts.filter(s => s.shift_date === dateStr)
          const dayTimeOff  = timeOffReqs.filter(r => dateInRange(dateStr, r.start_date, r.end_date))
          const dayEvents   = (events || []).filter(e => dateInRange(dateStr, e.start_date, e.end_date || e.start_date))
          const blocked = blockedDays.find(b => b.block_date === dateStr)

          return (
            <div key={dateStr} className={`bg-white rounded-xl border ${isToday ? 'border-red-600' : 'border-gray-200'} overflow-hidden min-h-[160px] flex flex-col`}>
              {/* Day header */}
              <div className={`px-2 py-2 text-center border-b ${isToday ? 'bg-red-600 border-red-600' : 'bg-gray-50 border-gray-200'}`}>
                <p className={`text-xs font-semibold uppercase tracking-wide ${isToday ? 'text-white' : 'text-gray-500'}`}>{DAY_LABELS[i]}</p>
                <p className={`text-lg font-bold leading-tight ${isToday ? 'text-white' : 'text-gray-900'}`}>{day.getDate()}</p>
              </div>

              {blocked && (
                <div className={`px-2 py-1 flex items-center justify-between text-xs font-medium border-b ${
                  blocked.block_type === 'holiday' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-gray-100 text-gray-600 border-gray-200'
                }`}>
                  <span className="truncate">{blocked.label}</span>
                  {isOwnerOrManager && (
                    <button onClick={() => onRemoveHoliday(blocked.id)} className="ml-1 flex-shrink-0 hover:opacity-70">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}

              <div className="flex-1 p-1.5 space-y-1">
                {loading ? (
                  <div className="flex justify-center pt-4"><RefreshCw className="w-4 h-4 animate-spin text-gray-300" /></div>
                ) : dayShifts.length === 0 && dayTimeOff.length === 0 && dayEvents.length === 0 ? (
                  <p className="text-xs text-gray-300 text-center pt-3">—</p>
                ) : (
                  <>
                    {dayEvents.map(e => (
                      <WeekEventChip key={e.id} event={e} />
                    ))}
                    {dayShifts.map(s => (
                      <ShiftCard key={s.id} shift={s} canEdit={isOwnerOrManager} onEdit={() => onEdit(s)} onDelete={() => onDelete(s.id)} />
                    ))}
                    {dayTimeOff.map(r => (
                      <div key={r.id} className={`rounded-lg border px-2 py-1 text-xs ${timeOffColor(r.requested_by)}`}>
                        <p className="font-semibold truncate">{r.requester_name}</p>
                        <p className="opacity-75">Time Off</p>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {isOwnerOrManager && !loading && (
                <div className="border-t border-gray-100 flex">
                  <button onClick={() => onAdd(dateStr)} className="flex-1 py-1.5 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors flex items-center justify-center gap-1">
                    <Plus className="w-3 h-3" /> Add
                  </button>
                  {!blocked && (
                    <button onClick={() => onAddHoliday(dateStr)} title="Mark as holiday or closed"
                      className="border-l border-gray-100 px-2 text-gray-300 hover:text-amber-500 hover:bg-amber-50 transition-colors">
                      <Flag className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

// ─── Month grid ───────────────────────────────────────────────────────────────

function MonthGrid({ monthYear, shifts, timeOffReqs, blockedDays, events, loading, today, isOwnerOrManager, onAdd, onEdit, onDelete, onAddHoliday, onRemoveHoliday }) {
  const { weeks } = getMonthGrid(monthYear.year, monthYear.month)
  const currentMonthStart = toDateStr(new Date(monthYear.year, monthYear.month, 1))
  const currentMonthEnd   = toDateStr(new Date(monthYear.year, monthYear.month + 1, 0))

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {DAY_LABELS.map(d => (
          <div key={d} className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 border-r last:border-r-0 border-gray-100">
            {d}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b last:border-b-0 border-gray-100">
            {week.map((day, di) => {
              const dateStr    = toDateStr(day)
              const isToday    = dateStr === today
              const inMonth    = dateStr >= currentMonthStart && dateStr <= currentMonthEnd
              const dayShifts  = shifts.filter(s => s.shift_date === dateStr)
              const dayTimeOff = timeOffReqs.filter(r => dateInRange(dateStr, r.start_date, r.end_date))
              const dayEvents  = (events || []).filter(e => dateInRange(dateStr, e.start_date, e.end_date || e.start_date))
              const blocked    = blockedDays.find(b => b.block_date === dateStr)

              return (
                <div key={dateStr} className={`min-h-[100px] border-r last:border-r-0 border-gray-100 flex flex-col ${!inMonth ? 'bg-gray-50/50' : ''}`}>
                  {/* Day number */}
                  <div className="flex items-start justify-between px-2 pt-1.5 pb-1">
                    <span className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full ${
                      isToday ? 'bg-red-600 text-white' : inMonth ? 'text-gray-900' : 'text-gray-300'
                    }`}>
                      {day.getDate()}
                    </span>
                    {isOwnerOrManager && inMonth && !blocked && (
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                        <button onClick={() => onAddHoliday(dateStr)} title="Mark holiday"
                          className="p-0.5 text-gray-300 hover:text-amber-500 transition-colors">
                          <Flag className="w-3 h-3" />
                        </button>
                        <button onClick={() => onAdd(dateStr)} title="Add shift"
                          className="p-0.5 text-gray-300 hover:text-red-600 transition-colors">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {blocked && (
                    <div className={`mx-1 mb-1 px-1.5 py-0.5 rounded text-xs font-medium flex items-center justify-between ${
                      blocked.block_type === 'holiday' ? 'bg-amber-100 text-amber-800' : 'bg-gray-200 text-gray-600'
                    }`}>
                      <span className="truncate text-xs">{blocked.label}</span>
                      {isOwnerOrManager && (
                        <button onClick={() => onRemoveHoliday(blocked.id)} className="ml-1 flex-shrink-0">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Events + shift + time-off chips */}
                  <div className="px-1 pb-1 space-y-0.5 flex-1">
                    {dayEvents.map(e => (
                      <MonthEventChip key={e.id} event={e} />
                    ))}
                    {dayShifts.map(s => (
                      <MonthChip
                        key={s.id}
                        color={shiftColor(s.tsa_id)}
                        label={s.tsa_name}
                        sub={`${formatTime(s.start_time)}–${formatTime(s.end_time)}`}
                        canEdit={isOwnerOrManager}
                        onEdit={() => onEdit(s)}
                        onDelete={() => onDelete(s.id)}
                      />
                    ))}
                    {dayTimeOff.map(r => (
                      <div key={r.id} className={`rounded px-1.5 py-0.5 text-xs border ${timeOffColor(r.requested_by)}`}>
                        <span className="font-medium truncate block">{r.requester_name}</span>
                        <span className="opacity-75 text-xs">Off</span>
                      </div>
                    ))}
                  </div>

                  {/* Add shift button — show on hover via CSS */}
                  {isOwnerOrManager && inMonth && (
                    <button
                      onClick={() => onAdd(dateStr)}
                      className="w-full py-1 text-xs text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors flex items-center justify-center gap-0.5 opacity-0 hover:opacity-100 focus:opacity-100"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ))
      )}
    </div>
  )
}

// ─── Event chips ──────────────────────────────────────────────────────────────

// Week view — full-height chip with title + optional time + type badge
function WeekEventChip({ event }) {
  const typeLabel = {
    'in-store':    'In-Store',
    'community':   'Community',
    'b2b':         'B2B',
    'corporate':   'Corporate',
    'partnership': 'Partner',
    'virtual':     'Virtual',
    'other':       'Other',
  }[event.event_type] || event.event_type || 'Event'

  return (
    <div className="rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-800">
      <div className="flex items-start justify-between gap-1">
        <p className="font-semibold truncate leading-tight">★ {event.title}</p>
        <span className="flex-shrink-0 text-[9px] bg-red-100 text-red-600 px-1 py-0.5 rounded font-medium border border-red-200 leading-none mt-0.5">
          {typeLabel}
        </span>
      </div>
      {(event.start_time || event.location) && (
        <p className="opacity-70 mt-0.5 truncate">
          {event.start_time ? formatTime(event.start_time) : ''}
          {event.start_time && event.location ? ' · ' : ''}
          {event.location || ''}
        </p>
      )}
    </div>
  )
}

// Month view — compact chip, just title + optional time
function MonthEventChip({ event }) {
  return (
    <div className="rounded px-1.5 py-0.5 text-xs border border-red-300 bg-red-50 text-red-800">
      <span className="font-semibold truncate block">★ {event.title}</span>
      {event.start_time && (
        <span className="opacity-70 text-[10px]">{formatTime(event.start_time)}</span>
      )}
    </div>
  )
}

function MonthChip({ color, label, sub, canEdit, onEdit, onDelete }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`relative rounded px-1.5 py-0.5 text-xs border ${color} cursor-default`}
    >
      <span className="font-medium truncate block pr-8">{label}</span>
      <span className="opacity-70 text-xs">{sub}</span>
      {canEdit && hover && (
        <div className="absolute top-0.5 right-0.5 flex gap-0.5">
          <button onClick={onEdit} className="p-0.5 rounded hover:bg-white/60"><Pencil className="w-2.5 h-2.5" /></button>
          <button onClick={onDelete} className="p-0.5 rounded hover:bg-white/60"><Trash2 className="w-2.5 h-2.5" /></button>
        </div>
      )}
    </div>
  )
}

// ─── Hours summary table ──────────────────────────────────────────────────────

function HoursTable({ shifts, days }) {
  // Build per-employee daily minutes
  const employees = {}
  for (const s of shifts) {
    if (!employees[s.tsa_id]) employees[s.tsa_id] = { name: s.tsa_name, id: s.tsa_id, daily: {}, total: 0 }
    const mins = shiftMinutes(s.start_time, s.end_time)
    const d = s.shift_date
    employees[s.tsa_id].daily[d] = (employees[s.tsa_id].daily[d] || 0) + mins
    employees[s.tsa_id].total += mins
  }
  const rows = Object.values(employees).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-2">Hours This Week</h2>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</th>
              {days.map(day => (
                <th key={toDateStr(day)} className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">
                  {DAY_LABELS[days.indexOf(day)]}<br />
                  <span className="font-normal normal-case">{day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </th>
              ))}
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-700 uppercase tracking-wide text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((emp, i) => (
              <tr key={emp.id} className={i < rows.length - 1 ? 'border-b border-gray-100' : ''}>
                <td className="px-4 py-2.5 font-medium text-gray-900">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${PERSON_COLORS[personColorIdx(emp.id)].shift.split(' ')[0].replace('bg-', 'bg-').replace('50', '400')}`} />
                    {emp.name}
                  </div>
                </td>
                {days.map(day => {
                  const dateStr = toDateStr(day)
                  const mins = emp.daily[dateStr]
                  return (
                    <td key={dateStr} className="px-3 py-2.5 text-center text-gray-600">
                      {fmtHours(mins) || <span className="text-gray-200">—</span>}
                    </td>
                  )
                })}
                <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{fmtHours(emp.total)}</td>
              </tr>
            ))}
            {/* Totals row */}
            <tr className="border-t-2 border-gray-200 bg-gray-50">
              <td className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Daily Total</td>
              {days.map(day => {
                const dateStr = toDateStr(day)
                const dayTotal = rows.reduce((sum, e) => sum + (e.daily[dateStr] || 0), 0)
                return (
                  <td key={dateStr} className="px-3 py-2 text-center text-xs font-semibold text-gray-700">
                    {fmtHours(dayTotal) || <span className="text-gray-300">—</span>}
                  </td>
                )
              })}
              <td className="px-4 py-2 text-right text-xs font-bold text-gray-900">
                {fmtHours(rows.reduce((s, e) => s + e.total, 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Shift card (week view) ───────────────────────────────────────────────────

function ShiftCard({ shift, canEdit, onEdit, onDelete }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`relative rounded-lg border px-2 py-1.5 text-xs ${shiftColor(shift.tsa_id)}`}
    >
      <p className="font-semibold truncate">{shift.tsa_name}</p>
      <p className="opacity-75">{formatTime(shift.start_time)}–{formatTime(shift.end_time)}</p>
      {shift.notes && (
        <p className="flex items-start gap-0.5 mt-1 opacity-70 text-[10px] leading-tight">
          <MessageSquare className="w-2.5 h-2.5 mt-0.5 shrink-0" />
          <span className="truncate">{shift.notes}</span>
        </p>
      )}
      {canEdit && hover && (
        <div className="absolute top-1 right-1 flex gap-0.5">
          <button onClick={onEdit} className="p-0.5 rounded hover:bg-white/60"><Pencil className="w-3 h-3" /></button>
          <button onClick={onDelete} className="p-0.5 rounded hover:bg-white/60"><Trash2 className="w-3 h-3" /></button>
        </div>
      )}
    </div>
  )
}

// ─── Holiday form modal ───────────────────────────────────────────────────────

function HolidayForm({ date, onSave, onClose }) {
  const [label,     setLabel]     = useState('')
  const [blockType, setBlockType] = useState('holiday')
  const [saving,    setSaving]    = useState(false)

  const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  async function submit(e) {
    e.preventDefault()
    if (!label.trim()) return
    setSaving(true)
    await onSave(date, label.trim(), blockType)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Mark Day</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <p className="text-sm text-gray-500">{fmt(date)}</p>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Type</label>
            <div className="flex gap-2">
              {[{ value: 'holiday', label: 'Holiday' }, { value: 'blocked', label: 'Studio Closed' }].map(opt => (
                <button key={opt.value} type="button" onClick={() => setBlockType(opt.value)}
                  className={`flex-1 text-sm py-2 rounded-lg border font-medium transition-colors ${
                    blockType === opt.value ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}>{opt.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Label *</label>
            <input type="text" value={label} onChange={e => setLabel(e.target.value)}
              placeholder={blockType === 'holiday' ? 'e.g. Memorial Day' : 'e.g. Studio Renovation'}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600"
              autoFocus />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={saving || !label.trim()}
              className="flex-1 bg-red-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-red-600-hover transition-colors disabled:opacity-60">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Shift form modal ─────────────────────────────────────────────────────────

function ShiftForm({ shift, defaultDate, users, onSaved, onClose }) {
  const isEdit = !!shift
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)
  const [form,   setForm]   = useState({
    tsa_id:     shift?.tsa_id     || (users[0]?.id || ''),
    shift_date: shift?.shift_date || defaultDate || '',
    start_time: shift?.start_time?.slice(0, 5) || '09:00',
    end_time:   shift?.end_time?.slice(0, 5)   || '15:00',
    notes:      shift?.notes || '',
  })

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function submit(e) {
    e.preventDefault()
    if (!form.tsa_id || !form.shift_date || !form.start_time || !form.end_time)
      return setError('All fields except notes are required.')
    setSaving(true); setError(null)
    try {
      const saved = isEdit
        ? await apiPut(`/api/schedule/${shift.id}`, form)
        : await apiPost('/api/schedule', form)
      onSaved(saved, !isEdit)
    } catch (e) { setError(e.message); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{isEdit ? 'Edit Shift' : 'Add Shift'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Team Member *</label>
            <select value={form.tsa_id} onChange={e => set('tsa_id', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600">
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date *</label>
            <input type="date" value={form.shift_date} onChange={e => set('shift_date', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Start Time *</label>
              <input type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">End Time *</label>
              <input type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Shift Notes <span className="text-gray-400 font-normal">(optional — visible to TSA on their Goals page)</span>
            </label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="e.g. Focus on upselling retail today. Check in with Stacy before close."
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 resize-none" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-red-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-red-600-hover transition-colors disabled:opacity-60">
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Shift'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
