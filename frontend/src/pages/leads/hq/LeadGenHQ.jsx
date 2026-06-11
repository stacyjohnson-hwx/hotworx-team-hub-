import { useState, useEffect } from 'react'
import { Target, BookOpen, ChevronDown, Flame, Zap, Phone, Megaphone } from 'lucide-react'
import { EMPLOYEES, getRank } from '../data/mockData'
import { useAuth } from '@/contexts/AuthContext'
import MissionsTab    from './MissionsTab'
import PlaysTab       from './PlaysTab'
import OutreachTab    from '../OutreachTab'
import MarketingHub   from '@/pages/marketing/MarketingHub'

// ─── Constants ────────────────────────────────────────────────────────────────
// TSAs: Marketing, Leads, Outreach
const TSA_TABS = [
  { id: 'marketing', label: 'Marketing', icon: Megaphone, shortLabel: 'Marketing' },
  { id: 'leads',     label: 'Leads',     icon: Target,    shortLabel: 'Leads'     },
  { id: 'outreach',  label: 'Outreach',  icon: Phone,     shortLabel: 'Outreach'  },
]

// Managers/Owners: Marketing + Campaigns + the TSA tabs
const ALL_TABS = [
  { id: 'marketing',   label: 'Marketing',   icon: Megaphone, shortLabel: 'Marketing' },
  { id: 'campaigns',   label: 'Campaigns',   icon: BookOpen,  shortLabel: 'Campaigns' },
  { id: 'leads',       label: 'Leads',       icon: Target,    shortLabel: 'Leads'     },
  { id: 'outreach',    label: 'Outreach',    icon: Phone,     shortLabel: 'Outreach'  },
]

// Derive an employee ID from the logged-in user's first name
function getEmployeeIdFromProfile(profile) {
  if (!profile?.name) return null
  const firstName = profile.name.trim().split(' ')[0].toLowerCase()
  const match = EMPLOYEES.find(e => e.id === firstName || e.name.toLowerCase() === firstName)
  return match?.id || null
}

const STORAGE_KEY   = 'leadgenhq_state'
const DATA_VERSION  = 3   // bump to wipe all stale localStorage points/missions

// All Growth HQ keys that hold employee progress — wipe them on version change
const ALL_HQ_KEYS = [
  'leadgenhq_state',
  'leadgenhq_missions',
  'leadgenhq_custom_missions',
  'leadgenhq_hidden_missions',
  'leadgenhq_mission_overrides',
  'leadgenhq_mission_order',
  'leadgenhq_map_activities',
  'leadgenhq_map_activities_version',
  'leadgenhq_weekly_challenge',
  'leadgenhq_ai_recs',
  'leadgenhq_plays',
]

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    // Version changed — wipe every Growth HQ key so no stale points survive
    if (parsed.dataVersion !== DATA_VERSION) {
      ALL_HQ_KEYS.forEach(k => localStorage.removeItem(k))
      return {}
    }
    return parsed
  } catch { return {} }
}

function saveState(patch) {
  try {
    const current = loadState()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, dataVersion: DATA_VERSION, ...patch }))
  } catch {}
}

// ─── HQ Shell ─────────────────────────────────────────────────────────────────
export default function LeadGenHQ() {
  const { role, profile } = useAuth()
  const isTsa = role === 'tsa'

  const saved = loadState()

  // TSAs are locked to their own employee profile
  const tsaEmployeeId = isTsa ? (getEmployeeIdFromProfile(profile) || 'chrissy') : null
  const tabs = isTsa ? TSA_TABS : ALL_TABS

  const defaultTab = saved.activeTab && tabs.find(t => t.id === saved.activeTab)
    ? saved.activeTab
    : 'marketing'

  const [activeTab,       setActiveTab]       = useState(defaultTab)
  const [activeEmployeeId, setActiveEmployeeId] = useState(
    isTsa ? tsaEmployeeId : (saved.activeEmployeeId || 'chrissy')
  )
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
              <span className="text-[10px] font-bold tracking-widest text-[#E8611A] uppercase">Growth HQ</span>
            </div>
            <p className="text-white font-bold text-lg leading-tight">HOTWORX Pewaukee</p>
          </div>
        </div>

        {/* ── Tab bar ───────────────────────────────────────────────────── */}
        <div className="flex gap-0 border-b border-white/10">
          {tabs.map(tab => {
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
        {activeTab === 'marketing'   && <MarketingHub />}
        {activeTab === 'leads'       && <MissionsTab    employee={employee} onPointsEarned={handlePointsEarned} onStreakUpdate={handleStreakUpdate} />}
        {activeTab === 'campaigns'   && <PlaysTab       employee={employee} />}
        {activeTab === 'outreach'    && <OutreachTab />}
      </div>
    </div>
  )
}
