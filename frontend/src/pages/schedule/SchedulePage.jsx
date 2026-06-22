import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, RefreshCw, X, Flag, Calendar, LayoutGrid, MessageSquare, Tag, Sparkles, Check, Building2, ExternalLink } from 'lucide-react'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { useRole } from '@/hooks/useRole'
import { renderRichText } from '@/components/RichText'

// ─── Date helpers ─────────────────────────────────────────────────────────────

// Week runs Sunday → Saturday
function startOfWeek(date) {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay()) // back up to Sunday
  return d
}

function endOfWeek(date) {
  const d = new Date(date)
  d.setDate(d.getDate() + (6 - d.getDay())) // forward to Saturday
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
  const gridStart = startOfWeek(firstDay)
  const gridEnd   = endOfWeek(lastDay)
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

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─── Promo layout helpers ─────────────────────────────────────────────────────

// Build promo color from promo_type
const PROMO_COLORS = {
  discount:     { bar: 'bg-amber-500',  text: 'text-white', badge: 'bg-amber-400/30' },
  free_session: { bar: 'bg-green-500',  text: 'text-white', badge: 'bg-green-400/30' },
  referral:     { bar: 'bg-blue-500',   text: 'text-white', badge: 'bg-blue-400/30'  },
  flash_sale:   { bar: 'bg-red-500',    text: 'text-white', badge: 'bg-red-400/30'   },
  bundle:       { bar: 'bg-purple-500', text: 'text-white', badge: 'bg-purple-400/30' },
  other:        { bar: 'bg-gray-500',   text: 'text-white', badge: 'bg-gray-400/30'  },
}
function promoColor(type) { return PROMO_COLORS[type] || PROMO_COLORS.other }

// Given a list of promos and the 7 weekDays for a row, compute column spans + lane rows
// Returns { items: [{promo, colStart, colEnd, lane, isStart, isEnd}], laneCount }
function layoutPromosForWeek(promos, weekDays) {
  if (!promos?.length || !weekDays?.length) return { items: [], laneCount: 0 }
  const weekStart = toDateStr(weekDays[0])
  const weekEnd   = toDateStr(weekDays[weekDays.length - 1])

  const visible = promos.filter(p => {
    if (!p.start_date) return false
    const pEnd = p.end_date || p.start_date
    return p.start_date <= weekEnd && pEnd >= weekStart
  })
  if (!visible.length) return { items: [], laneCount: 0 }

  // Sort: longer spans first, then by start date
  visible.sort((a, b) => {
    const aEnd = a.end_date || a.start_date
    const bEnd = b.end_date || b.start_date
    const aLen = (new Date(aEnd) - new Date(a.start_date)) / 86400000
    const bLen = (new Date(bEnd) - new Date(b.start_date)) / 86400000
    return bLen - aLen || a.start_date.localeCompare(b.start_date)
  })

  const mapped = visible.map(p => {
    const pEnd     = p.end_date || p.start_date
    const clampStart = p.start_date < weekStart ? weekStart : p.start_date
    const clampEnd   = pEnd > weekEnd ? weekEnd : pEnd
    const cs = weekDays.findIndex(d => toDateStr(d) === clampStart)
    const ce = weekDays.findIndex(d => toDateStr(d) === clampEnd)
    return {
      promo: p,
      colStart: cs < 0 ? 0 : cs,
      colEnd:   ce < 0 ? weekDays.length - 1 : ce,
      isStart:  p.start_date >= weekStart,
      isEnd:    pEnd <= weekEnd,
    }
  })

  // First-fit lane assignment
  const lanes = []
  const result = []
  for (const item of mapped) {
    let laneIdx = lanes.findIndex(lane =>
      lane.every(placed => placed.colEnd < item.colStart || placed.colStart > item.colEnd)
    )
    if (laneIdx === -1) { laneIdx = lanes.length; lanes.push([]) }
    lanes[laneIdx].push({ colStart: item.colStart, colEnd: item.colEnd })
    result.push({ ...item, lane: laneIdx })
  }
  return { items: result, laneCount: lanes.length }
}

function promoLabel(promo) {
  if (!promo.discount_value || promo.discount_unit === 'other') return ''
  if (promo.discount_unit === 'free') return 'FREE'
  if (promo.discount_unit === '%') return `${promo.discount_value}% off`
  return `$${promo.discount_value} off`
}

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
  const [weekStart, setWeekStart] = useState(() => toDateStr(startOfWeek(new Date())))

  // Month view state
  const today = toDateStr(new Date())
  const [monthYear, setMonthYear] = useState(() => ({ month: new Date().getMonth(), year: new Date().getFullYear() }))

  const [shifts,         setShifts]         = useState([])
  const [users,          setUsers]           = useState([])
  const [timeOffReqs,    setTimeOffReqs]     = useState([])
  const [blockedDays,    setBlockedDays]     = useState([])
  const [events,         setEvents]          = useState([])
  const [promotions,     setPromotions]      = useState([])
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
      const [shiftsData, usersData, timeOffData, blockedData, eventsData, promosData] = await Promise.all([
        apiGet(`/api/schedule?weekStart=${start}&end=${end}`),
        apiGet('/api/users'),
        apiGet(`/api/schedule/timeoff-week?weekStart=${start}&end=${end}`),
        apiGet(`/api/schedule/blocked?weekStart=${start}&end=${end}`),
        apiGet(`/api/events?startDate=${start}&endDate=${end}`),
        apiGet(`/api/events/promotions?startDate=${start}&endDate=${end}`),
      ])
      setShifts(shiftsData)
      setUsers(usersData) // all roles including owner
      setTimeOffReqs(timeOffData)
      setBlockedDays(blockedData)
      setEvents(eventsData)
      setPromotions(promosData || [])
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
    if (view === 'week') setWeekStart(toDateStr(startOfWeek(new Date())))
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
            promotions={promotions}
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
          promotions={promotions}
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

      <BusinessOfMonthBanner
        events={events}
        activeMonth={view === 'month' ? monthYear.month : weekDays[0]?.getMonth()}
        activeYear={view === 'month' ? monthYear.year : weekDays[0]?.getFullYear()}
      />

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

// ─── Business of the Month banner (below the calendar) ──────────────────────────

function BusinessOfMonthBanner({ events, activeMonth, activeYear }) {
  // Only show the Business of the Month for the month currently being viewed.
  const boms = (events || []).filter(e => {
    if (e.event_type !== 'business_of_the_month' || !e.start_date) return false
    const d = new Date(e.start_date + 'T00:00:00')
    return d.getMonth() === activeMonth && d.getFullYear() === activeYear
  })
  if (!boms.length) return null

  const monthName = new Date(activeYear, activeMonth, 1).toLocaleDateString('en-US', { month: 'long' })

  return (
    <div className="mt-5 space-y-3">
      {boms.map(e => {
        const partner = (e.b2b_partners || [])[0] || null
        const name = partner?.business_name || e.title?.replace(/^business of the month:?\s*/i, '') || e.title
        const logo = partner?.logo_url
        const website = partner?.website
        return (
          <div key={e.id} className="flex items-start gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            {logo ? (
              <img src={logo} alt={name} className="w-16 h-16 rounded-lg object-contain bg-white border border-amber-100 flex-shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-7 h-7 text-amber-600" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">{monthName} Business of the Month</p>
              <p className="text-base font-bold text-gray-900 leading-tight">{name}</p>
              {e.description && <div className="rich-content text-sm text-gray-600 mt-1" dangerouslySetInnerHTML={{ __html: renderRichText(e.description) }} />}
              {website && (
                <a href={website.startsWith('http') ? website : `https://${website}`} target="_blank" rel="noreferrer"
                   className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline mt-1.5">
                  Visit website <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Week grid ────────────────────────────────────────────────────────────────

function WeekGrid({ days, shifts, timeOffReqs, blockedDays, events, promotions, loading, today, isOwnerOrManager, onAdd, onEdit, onDelete, onAddHoliday, onRemoveHoliday }) {
  const uniqueTimeOff = [...new Map(timeOffReqs.map(r => [r.requested_by, r])).values()]
  const { items: promoItems, laneCount } = layoutPromosForWeek(promotions, days)
  const [promoDetail, setPromoDetail] = useState(null)

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

      {/* ── Day-name header row ── */}
      <div className="grid grid-cols-7 gap-2 mb-1">
        {days.map((day, i) => {
          const dateStr = toDateStr(day)
          const isToday = dateStr === today
          return (
            <div key={dateStr} className="text-center py-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{DAY_LABELS[i]}</p>
              <div className={`w-8 h-8 mx-auto flex items-center justify-center rounded-full mt-0.5 ${
                isToday ? 'bg-red-600 text-white font-bold' : 'text-gray-800 font-semibold'
              } text-base`}>
                {day.getDate()}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── All-day promo banner strip ── */}
      {laneCount > 0 && (
        <div
          className="grid grid-cols-7 gap-2 mb-2"
          style={{ gridTemplateRows: `repeat(${laneCount}, 22px)` }}
        >
          {promoItems.map(({ promo, colStart, colEnd, lane, isStart, isEnd }) => {
            const c = promoColor(promo.promo_type)
            const label = promoLabel(promo)
            return (
              <div
                key={promo.id}
                onClick={() => setPromoDetail(promo)}
                style={{
                  gridColumn: `${colStart + 1} / ${colEnd + 2}`,
                  gridRow: lane + 1,
                }}
                className={`flex items-center gap-1.5 px-2 text-white text-[11px] font-semibold leading-none overflow-hidden cursor-pointer hover:brightness-110 transition-all
                  ${c.bar}
                  ${isStart ? 'rounded-l-full pl-2.5' : 'rounded-l-none pl-1'}
                  ${isEnd   ? 'rounded-r-full pr-2'   : 'rounded-r-none pr-0'}
                `}
              >
                {isStart && <Tag size={10} className="flex-shrink-0 opacity-80" />}
                <span className="truncate">{promo.title}</span>
                {isStart && label && (
                  <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${c.badge} ml-auto mr-1`}>
                    {label}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
      {promoDetail && <DetailModal item={promoDetail} type="promo" onClose={() => setPromoDetail(null)} />}

      {/* ── Day content columns ── */}
      <div className="grid grid-cols-7 gap-2">
        {days.map((day, i) => {
          const dateStr    = toDateStr(day)
          const isToday    = dateStr === today
          const dayShifts  = shifts.filter(s => s.shift_date === dateStr).sort((a, b) => a.start_time.localeCompare(b.start_time))
          const dayTimeOff = timeOffReqs.filter(r => dateInRange(dateStr, r.start_date, r.end_date))
          const dayEvents  = (events || []).filter(e => e.event_type !== 'business_of_the_month' && dateInRange(dateStr, e.start_date, e.end_date || e.start_date))
          const blocked    = blockedDays.find(b => b.block_date === dateStr)

          return (
            <div key={dateStr} className={`bg-white rounded-xl border ${isToday ? 'border-red-400' : 'border-gray-200'} overflow-hidden min-h-[120px] flex flex-col`}>
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

function MonthGrid({ monthYear, shifts, timeOffReqs, blockedDays, events, promotions, loading, today, isOwnerOrManager, onAdd, onEdit, onDelete, onAddHoliday, onRemoveHoliday }) {
  const { weeks } = getMonthGrid(monthYear.year, monthYear.month)
  const [promoDetail, setPromoDetail] = useState(null)
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

      {promoDetail && <DetailModal item={promoDetail} type="promo" onClose={() => setPromoDetail(null)} />}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        weeks.map((week, wi) => {
          const { items: promoItems, laneCount } = layoutPromosForWeek(promotions, week)

          return (
            <div key={wi} className="border-b last:border-b-0 border-gray-100">

              {/* ── Promo banner strip for this week row ── */}
              {laneCount > 0 && (
                <div
                  className="grid grid-cols-7 bg-gray-50/60 border-b border-orange-100"
                  style={{ gridTemplateRows: `repeat(${laneCount}, 20px)`, padding: '3px 0' }}
                >
                  {promoItems.map(({ promo, colStart, colEnd, lane, isStart, isEnd }) => {
                    const c = promoColor(promo.promo_type)
                    const label = promoLabel(promo)
                    return (
                      <div
                        key={promo.id}
                        onClick={() => setPromoDetail(promo)}
                        style={{
                          gridColumn: `${colStart + 1} / ${colEnd + 2}`,
                          gridRow: lane + 1,
                          marginLeft: isStart ? 4 : 0,
                          marginRight: isEnd ? 4 : 0,
                        }}
                        className={`flex items-center gap-1 px-1.5 text-white text-[10px] font-semibold leading-none overflow-hidden cursor-pointer hover:brightness-110 transition-all h-5
                          ${c.bar}
                          ${isStart ? 'rounded-l-full' : ''}
                          ${isEnd   ? 'rounded-r-full' : ''}
                        `}
                      >
                        {isStart && <Tag size={8} className="flex-shrink-0 opacity-80" />}
                        <span className="truncate">{promo.title}</span>
                        {isStart && label && (
                          <span className="flex-shrink-0 ml-auto text-[9px] font-bold opacity-90">{label}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── Day cells ── */}
              <div className="grid grid-cols-7">
                {week.map((day) => {
                  const dateStr    = toDateStr(day)
                  const isToday    = dateStr === today
                  const inMonth    = dateStr >= currentMonthStart && dateStr <= currentMonthEnd
                  const dayShifts  = shifts.filter(s => s.shift_date === dateStr).sort((a, b) => a.start_time.localeCompare(b.start_time))
                  const dayTimeOff = timeOffReqs.filter(r => dateInRange(dateStr, r.start_date, r.end_date))
                  const dayEvents  = (events || []).filter(e => e.event_type !== 'business_of_the_month' && dateInRange(dateStr, e.start_date, e.end_date || e.start_date))
                  const blocked    = blockedDays.find(b => b.block_date === dateStr)

                  return (
                    <div key={dateStr} className={`min-h-[90px] border-r last:border-r-0 border-gray-100 flex flex-col ${!inMonth ? 'bg-gray-50/50' : ''}`}>
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
                            shift={s}
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
            </div>
          )
        })
      )}
    </div>
  )
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

const EVENT_TYPE_LABELS = {
  'in-store':    'In-Store',
  'community':   'Community',
  'b2b':         'B2B',
  'corporate':   'Corporate',
  'partnership': 'Partner',
  'virtual':     'Virtual',
  'other':       'Other',
}

const PROMO_TYPE_LABELS = {
  discount:     'Discount',
  free_session: 'Free Session',
  referral:     'Referral',
  flash_sale:   'Flash Sale',
  bundle:       'Bundle',
  other:        'Other',
}

function fmtFullDate(str) {
  if (!str) return ''
  return new Date(str + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function DetailModal({ item, type, onClose, onEdit, onDelete, canEdit }) {
  // type: 'shift' | 'event' | 'promo'
  const isShift = type === 'shift'
  const isEvent = type === 'event'
  const isPromo = type === 'promo'

  const promoC = isPromo ? promoColor(item.promo_type) : null

  function handleEdit(e) { e.stopPropagation(); onEdit?.(); onClose() }
  function handleDelete(e) { e.stopPropagation(); if (window.confirm('Delete this item?')) { onDelete?.(); onClose() } }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className={`px-5 py-4 flex items-start justify-between gap-3 ${
          isShift ? 'bg-gray-800' : isEvent ? 'bg-red-700' : 'bg-gray-800'
        }`}>
          <div className="flex-1 min-w-0">
            {isPromo && (
              <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full mb-1 ${promoC.bar} text-white`}>
                {PROMO_TYPE_LABELS[item.promo_type] || 'Promo'}
              </span>
            )}
            {isEvent && (
              <span className="inline-block text-xs font-bold px-2 py-0.5 rounded-full mb-1 bg-red-600 text-white border border-red-400">
                {EVENT_TYPE_LABELS[item.event_type] || 'Event'}
              </span>
            )}
            {isShift && (
              <span className="inline-block text-xs font-bold px-2 py-0.5 rounded-full mb-1 bg-gray-600 text-white">
                Shift
              </span>
            )}
            <p className="text-white font-bold text-lg leading-snug">
              {isShift ? item.tsa_name : item.title}
            </p>
            {isShift && item.shift_type && (
              <p className="text-gray-300 text-xs mt-0.5 capitalize">{item.shift_type}</p>
            )}
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white flex-shrink-0 mt-0.5">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">

          {/* Date / time */}
          {isShift && (
            <>
              <Row label="Date" value={fmtFullDate(item.shift_date)} />
              <Row label="Time" value={`${formatTime(item.start_time)} – ${formatTime(item.end_time)}`} />
              {item.start_time && item.end_time && (
                <Row label="Duration" value={fmtHours(shiftMinutes(item.start_time, item.end_time))} />
              )}
            </>
          )}

          {isEvent && (
            <>
              <Row label="Date" value={
                item.end_date && item.end_date !== item.start_date
                  ? `${fmtFullDate(item.start_date)} – ${fmtFullDate(item.end_date)}`
                  : fmtFullDate(item.start_date)
              } />
              {(item.start_time || item.end_time) && (
                <Row label="Time" value={[formatTime(item.start_time), formatTime(item.end_time)].filter(Boolean).join(' – ')} />
              )}
              {item.location && <Row label="Location" value={item.location} />}
              {item.description && <RichRow label="Description" value={item.description} />}
              {item.b2b_partners?.length > 0 && (
                <Row label="B2B Partners" value={item.b2b_partners.map(p => p.business_name).join(', ')} />
              )}
            </>
          )}

          {isPromo && (
            <>
              <Row label="Dates" value={
                item.end_date && item.end_date !== item.start_date
                  ? `${fmtFullDate(item.start_date)} – ${fmtFullDate(item.end_date)}`
                  : fmtFullDate(item.start_date)
              } />
              {item.ongoing && (
                <div className="flex items-center gap-1.5 text-xs text-orange-600 font-semibold">
                  <Tag className="w-3 h-3" /> Ongoing — carries forward each month
                </div>
              )}
              {item.discount_value && item.discount_unit !== 'other' && (
                <Row label="Discount" value={
                  item.discount_unit === 'free' ? 'FREE'
                  : item.discount_unit === '%' ? `${item.discount_value}% off`
                  : `$${item.discount_value} off`
                } />
              )}
              {item.description && <RichRow label="Description" value={item.description} />}
            </>
          )}

          {/* Notes — always last */}
          {item.notes && <Row label="Notes" value={item.notes} multiline />}

        </div>

        {/* Footer */}
        {canEdit && (isShift || isEvent) && (
          <div className="px-5 pb-5 flex gap-2">
            <button onClick={handleEdit}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gray-800 text-white text-sm font-semibold hover:bg-gray-700 transition-colors">
              <Pencil className="w-4 h-4" /> Edit
            </button>
            <button onClick={handleDelete}
              className="px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, multiline }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{label}</p>
      <p className={`text-sm text-gray-800 ${multiline ? 'whitespace-pre-wrap' : ''}`}>{value}</p>
    </div>
  )
}

// Like Row, but renders rich-text (HTML) values — used for event descriptions.
function RichRow({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{label}</p>
      <div className="rich-content text-sm text-gray-800" dangerouslySetInnerHTML={{ __html: renderRichText(value) }} />
    </div>
  )
}

// ─── Event chips ──────────────────────────────────────────────────────────────

// Week view — full-height chip with title + optional time + type badge
function WeekEventChip({ event }) {
  const [open, setOpen] = useState(false)
  const typeLabel = EVENT_TYPE_LABELS[event.event_type] || event.event_type || 'Event'

  return (
    <>
      <div onClick={() => setOpen(true)} className="rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-800 cursor-pointer hover:bg-red-100 transition-colors">
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
      {open && <DetailModal item={event} type="event" onClose={() => setOpen(false)} />}
    </>
  )
}

// Month view — compact chip, just title + optional time
function MonthEventChip({ event }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div onClick={() => setOpen(true)} className="rounded px-1.5 py-0.5 text-xs border border-red-300 bg-red-50 text-red-800 cursor-pointer hover:bg-red-100 transition-colors">
        <span className="font-semibold truncate block">★ {event.title}</span>
        {event.start_time && (
          <span className="opacity-70 text-[10px]">{formatTime(event.start_time)}</span>
        )}
      </div>
      {open && <DetailModal item={event} type="event" onClose={() => setOpen(false)} />}
    </>
  )
}

function MonthChip({ shift, color, label, sub, canEdit, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  return (
    <>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => setOpen(true)}
        className={`relative rounded px-1.5 py-0.5 text-xs border ${color} cursor-pointer hover:brightness-95 transition-all`}
      >
        <span className="font-medium truncate block pr-8">{label}</span>
        <span className="opacity-70 text-xs">{sub}</span>
        {canEdit && hover && (
          <div className="absolute top-0.5 right-0.5 flex gap-0.5" onClick={e => e.stopPropagation()}>
            <button onClick={onEdit} className="p-0.5 rounded hover:bg-white/60"><Pencil className="w-2.5 h-2.5" /></button>
            <button onClick={onDelete} className="p-0.5 rounded hover:bg-white/60"><Trash2 className="w-2.5 h-2.5" /></button>
          </div>
        )}
      </div>
      {open && shift && (
        <DetailModal
          item={shift}
          type="shift"
          canEdit={canEdit}
          onClose={() => setOpen(false)}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </>
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
  const [open, setOpen]   = useState(false)
  return (
    <>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => setOpen(true)}
        className={`relative rounded-lg border px-2 py-1.5 text-xs cursor-pointer hover:brightness-95 transition-all ${shiftColor(shift.tsa_id)}`}
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
          <div className="absolute top-1 right-1 flex gap-0.5" onClick={e => e.stopPropagation()}>
            <button onClick={onEdit} className="p-0.5 rounded hover:bg-white/60"><Pencil className="w-3 h-3" /></button>
            <button onClick={onDelete} className="p-0.5 rounded hover:bg-white/60"><Trash2 className="w-3 h-3" /></button>
          </div>
        )}
      </div>
      {open && (
        <DetailModal
          item={shift}
          type="shift"
          canEdit={canEdit}
          onClose={() => setOpen(false)}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </>
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

// Studio operating hours by weekday (0=Sun … 6=Sat). Sunday closed.
const STUDIO_HOURS = {
  0: null,
  1: { start: '11:00', end: '20:00' }, // Mon
  2: { start: '11:00', end: '20:00' }, // Tue
  3: { start: '11:00', end: '20:00' }, // Wed
  4: { start: '11:00', end: '20:00' }, // Thu
  5: { start: '09:00', end: '18:00' }, // Fri
  6: { start: '09:00', end: '14:00' }, // Sat
}
function hoursForDate(dateStr) {
  if (!dateStr) return null
  return STUDIO_HOURS[new Date(dateStr + 'T00:00:00').getDay()]
}

function ShiftForm({ shift, defaultDate, users, onSaved, onClose }) {
  const isEdit = !!shift
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)
  const initialHours = !shift ? hoursForDate(defaultDate) : null
  const [form,   setForm]   = useState({
    tsa_id:     shift?.tsa_id     || (users[0]?.id || ''),
    shift_date: shift?.shift_date || defaultDate || '',
    start_time: shift?.start_time?.slice(0, 5) || initialHours?.start || '09:00',
    end_time:   shift?.end_time?.slice(0, 5)   || initialHours?.end   || '15:00',
    notes:      shift?.notes || '',
  })

  // When adding a shift, snap times to the studio's standard hours for that day
  useEffect(() => {
    if (isEdit) return
    const h = hoursForDate(form.shift_date)
    if (h) setForm(p => ({ ...p, start_time: h.start, end_time: h.end }))
  }, [form.shift_date])
  const [suggestions, setSuggestions] = useState([])
  const [loadingSugg, setLoadingSugg] = useState(false)

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  // Fetch ranked suggestions whenever date/times change (debounced)
  useEffect(() => {
    const { shift_date, start_time, end_time } = form
    if (!shift_date || !start_time || !end_time || end_time <= start_time) {
      setSuggestions([])
      return
    }
    let cancelled = false
    setLoadingSugg(true)
    const t = setTimeout(async () => {
      try {
        const res = await apiGet(
          `/api/schedule/suggestions?date=${shift_date}&start=${start_time}&end=${end_time}`
        )
        if (!cancelled) setSuggestions(res.candidates || [])
      } catch {
        if (!cancelled) setSuggestions([])
      } finally {
        if (!cancelled) setLoadingSugg(false)
      }
    }, 400)
    return () => { cancelled = true; clearTimeout(t) }
  }, [form.shift_date, form.start_time, form.end_time])

  const statusDot = (s) =>
    s === 'available' ? 'bg-green-500' : s === 'partial' ? 'bg-amber-500' : 'bg-gray-300'

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

          {/* Smart suggestions */}
          {form.shift_date && form.start_time && form.end_time && form.end_time > form.start_time && (
            <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-2">
                <Sparkles size={13} className="text-red-500" /> Suggested for this shift
              </div>
              {loadingSugg ? (
                <p className="text-xs text-gray-400 px-1 py-1">Finding the best matches…</p>
              ) : suggestions.length === 0 ? (
                <p className="text-xs text-gray-400 px-1 py-1">No team availability data yet — ask the team to set their availability.</p>
              ) : (
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {suggestions.slice(0, 5).map(c => {
                    const selected = form.tsa_id === c.user_id
                    return (
                      <button type="button" key={c.user_id} onClick={() => set('tsa_id', c.user_id)}
                        className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                          selected ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                        }`}>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
                            <span className={`w-2 h-2 rounded-full ${statusDot(c.status)}`} />
                            {c.name}
                          </span>
                          {selected && <Check size={14} className="text-red-600" />}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{c.reasons.join(' · ')}</p>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

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
