import { useState, useEffect, useCallback } from 'react'
import { Calendar, Clock, Check, Save, Users, Ban } from 'lucide-react'
import { apiGet, apiPut } from '@/hooks/useApi'
import { useRole } from '@/hooks/useRole'
import { useStudio } from '@/contexts/StudioContext'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// "06:00:00" -> "06:00" for <input type="time">; null-safe
const toInputTime = (t) => (t ? t.slice(0, 5) : '')
// Human label for a day's availability
function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h < 12 ? 'AM' : 'PM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

function dayLabel(d) {
  if (!d.available) return 'Unavailable'
  if (d.all_day) return 'Available all day'
  if (d.start_time && d.end_time) return `${fmtTime(d.start_time)} – ${fmtTime(d.end_time)}`
  return 'Available (hours not set)'
}

// ─── My Availability editor ───────────────────────────────────────────────────
function MyAvailability({ studioId }) {
  const [days, setDays] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!studioId) return
    setLoading(true)
    try {
      const data = await apiGet('/api/availability/me', studioId)
      setDays(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [studioId])

  useEffect(() => { load() }, [load])

  const updateDay = (dow, patch) => {
    setSaved(false)
    setDays(prev => prev.map(d => d.day_of_week === dow ? { ...d, ...patch } : d))
  }

  // Three-state mode selector: unavailable | all_day | hours
  const setMode = (dow, mode) => {
    if (mode === 'unavailable') updateDay(dow, { available: false })
    else if (mode === 'all_day') updateDay(dow, { available: true, all_day: true })
    else updateDay(dow, { available: true, all_day: false })
  }

  const modeOf = (d) => (!d.available ? 'unavailable' : d.all_day ? 'all_day' : 'hours')

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await apiPut('/api/availability/me', { days }, studioId)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading your availability…</div>
  if (!days) return null

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Set the hours you can typically work each week. Your manager uses this to build the schedule.
        Need a specific day off? Submit a <span className="font-medium text-gray-700">Time Off</span> request instead.
      </p>

      {error && <div className="mb-4 bg-red-50 border border-red-300 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="space-y-2">
        {days.map(d => {
          const mode = modeOf(d)
          return (
            <div key={d.day_of_week} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="w-28 font-semibold text-gray-900 flex items-center gap-2">
                <Calendar size={15} className="text-red-500" /> {DAY_NAMES[d.day_of_week]}
              </div>

              {/* Mode selector */}
              <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
                {[
                  { key: 'unavailable', label: 'Unavailable' },
                  { key: 'all_day', label: 'All day' },
                  { key: 'hours', label: 'Set hours' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setMode(d.day_of_week, opt.key)}
                    className={`px-3 py-1.5 font-medium transition-colors border-l first:border-l-0 border-gray-300 ${
                      mode === opt.key
                        ? (opt.key === 'unavailable' ? 'bg-gray-700 text-white' : 'bg-red-600 text-white')
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Hours inputs */}
              {mode === 'hours' && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock size={14} className="text-gray-400" />
                  <input
                    type="time"
                    value={toInputTime(d.start_time)}
                    onChange={e => updateDay(d.day_of_week, { start_time: e.target.value || null })}
                    className="px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/30"
                  />
                  <span className="text-gray-400">to</span>
                  <input
                    type="time"
                    value={toInputTime(d.end_time)}
                    onChange={e => updateDay(d.day_of_week, { end_time: e.target.value || null })}
                    className="px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/30"
                  />
                </div>
              )}

              {mode === 'unavailable' && (
                <span className="flex items-center gap-1.5 text-sm text-gray-400"><Ban size={13} /> Can't work this day</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Save bar */}
      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-lg transition-colors shadow-sm"
        >
          <Save size={16} /> {saving ? 'Saving…' : 'Save Availability'}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-green-600 text-sm font-semibold">
            <Check size={16} /> Saved
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Team availability (read-only, owner/manager) ────────────────────────────
function TeamAvailability({ studioId }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!studioId) return
    setLoading(true)
    apiGet('/api/availability', studioId)
      .then(setMembers)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [studioId])

  if (loading) return <div className="p-8 text-center text-gray-400">Loading team availability…</div>
  if (error) return <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
  if (!members.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
        <Users size={40} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500">No one has set their availability yet.</p>
        <p className="text-sm text-gray-400 mt-1">Ask the team to fill it out under the “My Availability” tab.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2">Team Member</th>
            {DAY_SHORT.map((d, i) => (
              <th key={i} className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 py-2">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map(m => (
            <tr key={m.user_id} className="border-t border-gray-100">
              <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{m.name}</td>
              {m.days.map(d => (
                <td key={d.day_of_week} className="px-2 py-2 text-center">
                  {!d.available ? (
                    <span className="inline-block text-[11px] px-2 py-1 rounded-md bg-gray-100 text-gray-400">Off</span>
                  ) : d.all_day ? (
                    <span className="inline-block text-[11px] px-2 py-1 rounded-md bg-green-100 text-green-700 font-medium">All day</span>
                  ) : (
                    <span className="inline-block text-[11px] px-2 py-1 rounded-md bg-red-50 text-red-700 font-medium whitespace-nowrap">
                      {d.start_time ? fmtTime(d.start_time) : '?'}–{d.end_time ? fmtTime(d.end_time) : '?'}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AvailabilityPage() {
  const { isOwnerOrManager } = useRole()
  const { currentStudio } = useStudio()
  const [tab, setTab] = useState('mine')
  const studioId = currentStudio?.id

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
          <Clock size={24} className="text-red-500" /> Availability
        </h1>
        <p className="text-gray-500 text-sm mt-1">When you’re able to work each week.</p>
      </div>

      {isOwnerOrManager && (
        <div className="flex gap-1 mb-5 border-b border-gray-200">
          {[{ key: 'mine', label: 'My Availability' }, { key: 'team', label: 'Team' }].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                tab === t.key ? 'border-red-500 text-red-500' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'team' && isOwnerOrManager
        ? <TeamAvailability studioId={studioId} />
        : <MyAvailability studioId={studioId} />}
    </div>
  )
}
