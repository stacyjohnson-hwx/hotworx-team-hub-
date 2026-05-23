import { useState, useEffect } from 'react'
import { Target, BookOpen, Map, Trophy, ChevronDown, Flame, Zap } from 'lucide-react'
import { EMPLOYEES, getRank } from '../data/mockData'
import MissionsTab    from './MissionsTab'
import PlaysTab       from './PlaysTab'
import MapTab         from './MapTab'
import LeaderboardTab from './LeaderboardTab'

// ─── Constants ────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'missions',     label: 'Missions',    icon: Target,    shortLabel: 'Missions'    },
  { id: 'plays',        label: 'Plays',       icon: BookOpen,  shortLabel: 'Plays'       },
  { id: 'map',          label: 'Map',         icon: Map,       shortLabel: 'Map'         },
  { id: 'leaderboard',  label: 'Leaderboard', icon: Trophy,    shortLabel: 'Board'       },
]

const STORAGE_KEY = 'leadgenhq_state'

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveState(patch) {
  try {
    const current = loadState()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }))
  } catch {}
}

// ─── HQ Shell ─────────────────────────────────────────────────────────────────
export default function LeadGenHQ() {
  const saved = loadState()

  const [activeTab,       setActiveTab]       = useState(saved.activeTab || 'missions')
  const [activeEmployeeId, setActiveEmployeeId] = useState(saved.activeEmployeeId || 'chrissy')
  const [employees,       setEmployees]       = useState(() => {
    // Merge localStorage point/streak overrides onto base mock data
    const overrides = saved.employeeOverrides || {}
    return EMPLOYEES.map(e => ({ ...e, ...(overrides[e.id] || {}) }))
  })
  const [showEmployeePicker, setShowEmployeePicker] = useState(false)

  const employee = employees.find(e => e.id === activeEmployeeId) || employees[0]
  const rank     = getRank(employee.points)

  useEffect(() => {
    saveState({ activeTab, activeEmployeeId })
  }, [activeTab, activeEmployeeId])

  function handlePointsEarned(employeeId, pointsDelta) {
    setEmployees(prev => {
      const updated = prev.map(e => {
        if (e.id !== employeeId) return e
        const newPoints         = e.points + pointsDelta
        const newPointsThisWeek = e.pointsThisWeek + pointsDelta
        const newRank           = getRank(newPoints).name
        return { ...e, points: newPoints, pointsThisWeek: newPointsThisWeek, rank: newRank }
      })
      // Persist overrides
      const overrides = {}
      updated.forEach(e => {
        overrides[e.id] = { points: e.points, pointsThisWeek: e.pointsThisWeek, rank: e.rank,
          currentStreak: e.currentStreak, missionsCompleted: e.missionsCompleted }
      })
      saveState({ employeeOverrides: overrides })
      return updated
    })
  }

  function handleStreakUpdate(employeeId, newStreak) {
    setEmployees(prev => {
      const updated = prev.map(e =>
        e.id === employeeId
          ? { ...e, currentStreak: newStreak, longestStreak: Math.max(e.longestStreak, newStreak) }
          : e
      )
      const overrides = {}
      updated.forEach(e => { overrides[e.id] = { currentStreak: e.currentStreak, longestStreak: e.longestStreak } })
      saveState({ employeeOverrides: overrides })
      return updated
    })
  }

  return (
    <div className="rounded-2xl border border-orange-200 overflow-hidden bg-white shadow-sm flex flex-col flex-1">

      {/* ── HQ Header ─────────────────────────────────────────────────────── */}
      <div className="bg-[#1A1A1A] px-4 pt-4 pb-0">
        <div className="flex items-start justify-between mb-3">

          {/* Brand + title */}
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Zap size={14} className="text-[#E8611A]" fill="#E8611A" />
              <span className="text-[10px] font-bold tracking-widest text-[#E8611A] uppercase">Lead Gen HQ</span>
            </div>
            <p className="text-white font-bold text-lg leading-tight">HOTWORX Pewaukee</p>
          </div>

          {/* Employee switcher */}
          <div className="relative">
            <button
              onClick={() => setShowEmployeePicker(p => !p)}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 transition-colors rounded-xl px-3 py-2"
            >
              {/* Avatar circle */}
              <div className="w-7 h-7 rounded-full bg-[#E8611A] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {employee.name[0]}
              </div>
              <div className="text-left">
                <p className="text-white text-xs font-semibold leading-tight">{employee.name}</p>
                <p className="text-white/50 text-[10px] leading-tight capitalize">{employee.role}</p>
              </div>
              <ChevronDown size={12} className={`text-white/60 transition-transform ${showEmployeePicker ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {showEmployeePicker && (
              <div className="absolute right-0 top-full mt-1.5 z-50 bg-white rounded-xl shadow-xl border border-gray-100 w-48 overflow-hidden">
                {employees.map(emp => {
                  const r = getRank(emp.points)
                  return (
                    <button
                      key={emp.id}
                      onClick={() => { setActiveEmployeeId(emp.id); setShowEmployeePicker(false) }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left ${emp.id === activeEmployeeId ? 'bg-orange-50' : ''}`}
                    >
                      <div className="w-7 h-7 rounded-full bg-[#E8611A] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {emp.name[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-gray-900 text-sm font-medium leading-tight truncate">{emp.name}</p>
                        <p className={`text-[10px] font-medium leading-tight ${r.color}`}>{r.name}</p>
                      </div>
                      {emp.id === activeEmployeeId && (
                        <div className="w-1.5 h-1.5 rounded-full bg-[#E8611A] flex-shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Stats bar ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 mb-3">
          {/* Points */}
          <div className="flex items-center gap-1.5">
            <span className="text-[#E8611A] font-bold text-lg leading-none">{employee.points.toLocaleString()}</span>
            <span className="text-white/40 text-xs">pts</span>
          </div>
          <div className="w-px h-4 bg-white/20" />
          {/* Streak */}
          <div className="flex items-center gap-1">
            <Flame size={14} className="text-[#E8611A]" />
            <span className="text-white font-semibold text-sm">{employee.currentStreak}</span>
            <span className="text-white/40 text-xs">day{employee.currentStreak !== 1 ? 's' : ''}</span>
          </div>
          <div className="w-px h-4 bg-white/20" />
          {/* Rank */}
          <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${rank.bg} ${rank.color}`}>
            {rank.name}
          </div>
        </div>

        {/* ── Tab bar ───────────────────────────────────────────────────── */}
        <div className="flex gap-0 border-b border-white/10">
          {TABS.map(tab => {
            const Icon    = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setShowEmployeePicker(false) }}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors relative ${
                  isActive
                    ? 'text-[#E8611A]'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                <Icon size={16} strokeWidth={isActive ? 2.5 : 1.8} />
                <span>{tab.shortLabel}</span>
                {isActive && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#E8611A] rounded-full" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Tab Content ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" onClick={() => setShowEmployeePicker(false)}>
        {activeTab === 'missions'    && <MissionsTab    employee={employee} onPointsEarned={handlePointsEarned} onStreakUpdate={handleStreakUpdate} />}
        {activeTab === 'plays'       && <PlaysTab       employee={employee} />}
        {activeTab === 'map'         && <MapTab         employee={employee} />}
        {activeTab === 'leaderboard' && <LeaderboardTab employee={employee} employees={employees} />}
      </div>
    </div>
  )
}
