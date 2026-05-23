import { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, Circle, Zap, Clock, RotateCcw, ChevronDown, ChevronUp, Flame, Star, Trophy, X } from 'lucide-react'
import { STANDING_MISSIONS, GROWTH_PLAYS, WEEKLY_CHALLENGE, AI_RECOMMENDATIONS, getRank, RANKS } from '../data/mockData'

// ─── localStorage helpers ─────────────────────────────────────────────────────
const MISSIONS_KEY = 'leadgenhq_missions'

function loadMissionsState() {
  try { return JSON.parse(localStorage.getItem(MISSIONS_KEY) || '{}') } catch { return {} }
}
function saveMissionsState(s) {
  try { localStorage.setItem(MISSIONS_KEY, JSON.stringify(s)) } catch {}
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = ['All', 'Social', 'Referrals', 'B2B', 'Community']
const DIFFICULTY_COLORS = {
  'Quick Win': 'bg-green-100 text-green-700',
  'Medium':    'bg-yellow-100 text-yellow-700',
  'Big Lift':  'bg-red-100 text-red-700',
  'Easy':      'bg-green-100 text-green-700',
  'Hard':      'bg-purple-100 text-purple-700',
}

function timeUntil(isoStr) {
  if (!isoStr) return null
  const diff = new Date(isoStr) - Date.now()
  if (diff <= 0) return 'Expired'
  const days = Math.floor(diff / 86400000)
  if (days > 0) return `${days}d left`
  const hours = Math.floor(diff / 3600000)
  return `${hours}h left`
}

// ─── Points Flash ─────────────────────────────────────────────────────────────
function PointsFlash({ points, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1400)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
      <div
        className="bg-[#E8611A] text-white text-3xl font-black px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-2"
        style={{ animation: 'bounceIn 0.4s ease-out' }}
      >
        <Zap size={28} fill="white" />
        +{points} pts!
      </div>
    </div>
  )
}

// ─── Proof Modal ──────────────────────────────────────────────────────────────
function ProofModal({ mission, onConfirm, onCancel }) {
  const [note, setNote] = useState('')
  const needsNote = mission.proofRequired === 'note'

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="bg-[#1A1A1A] px-5 py-4 flex items-start justify-between">
          <div>
            <p className="text-[#E8611A] text-xs font-bold uppercase tracking-wider mb-0.5">Complete Mission</p>
            <p className="text-white font-bold text-sm leading-tight">{mission.title}</p>
          </div>
          <button onClick={onCancel} className="text-white/40 hover:text-white/70 transition-colors mt-0.5 flex-shrink-0 ml-3">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {/* Points reward */}
          <div className="flex items-center justify-center gap-2 bg-orange-50 border border-orange-200 rounded-xl p-3 mb-4">
            <Zap size={18} className="text-[#E8611A]" fill="#E8611A" />
            <span className="font-bold text-[#E8611A] text-lg">+{mission.points} points</span>
          </div>

          {needsNote && (
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Add a quick note <span className="text-gray-400 font-normal">(what did you do?)</span>
              </label>
              <textarea
                rows={3}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. Left 20 flyers at Pewaukee Square Apartments…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]"
                autoFocus
              />
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(note)}
              disabled={needsNote && note.trim().length === 0}
              className="flex-1 py-2.5 rounded-xl bg-[#E8611A] text-white text-sm font-bold hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Complete It!
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Mission Card ─────────────────────────────────────────────────────────────
function MissionCard({ mission, completions, onComplete, isPlayMission }) {
  const [expanded,  setExpanded]  = useState(false)
  const [showProof, setShowProof] = useState(false)

  const todayStr       = new Date().toLocaleDateString('en-CA')
  const completedToday = completions?.some(c => c.date === todayStr) ?? false
  const completionCount = completions?.length ?? 0

  const expiryLabel = timeUntil(mission.expiresAt)
  const isExpired   = expiryLabel === 'Expired'

  function handleConfirm(note) {
    setShowProof(false)
    onComplete(mission, note)
  }

  return (
    <>
      {showProof && (
        <ProofModal
          mission={mission}
          onConfirm={handleConfirm}
          onCancel={() => setShowProof(false)}
        />
      )}

      <div className={`border rounded-xl overflow-hidden transition-all ${
        completedToday
          ? 'border-green-200 bg-green-50'
          : isExpired
          ? 'border-gray-100 bg-gray-50 opacity-60'
          : 'border-gray-200 bg-white hover:border-orange-200'
      }`}>
        <div className="p-3.5">
          <div className="flex items-start gap-3">
            {/* Complete button */}
            <button
              onClick={() => !completedToday && !isExpired && setShowProof(true)}
              disabled={completedToday || isExpired}
              className={`mt-0.5 flex-shrink-0 transition-colors ${
                completedToday
                  ? 'text-green-500 cursor-default'
                  : isExpired
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-300 hover:text-[#E8611A] cursor-pointer'
              }`}
            >
              {completedToday
                ? <CheckCircle2 size={22} />
                : <Circle size={22} />
              }
            </button>

            <div className="flex-1 min-w-0">
              {/* Title row */}
              <p className={`text-sm font-semibold leading-snug ${
                completedToday ? 'text-green-700 line-through decoration-green-400' : 'text-gray-900'
              }`}>
                {mission.title}
              </p>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${DIFFICULTY_COLORS[mission.difficulty] || 'bg-gray-100 text-gray-600'}`}>
                  {mission.difficulty}
                </span>
                <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                  <Clock size={10} />
                  {mission.estimatedTime}
                </span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                  mission.category === 'Social'     ? 'bg-purple-50 text-purple-600 border-purple-200' :
                  mission.category === 'Referrals'  ? 'bg-blue-50 text-blue-600 border-blue-200' :
                  mission.category === 'B2B'        ? 'bg-teal-50 text-teal-600 border-teal-200' :
                                                      'bg-orange-50 text-orange-600 border-orange-200'
                }`}>
                  {mission.category}
                </span>
                {isPlayMission && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-yellow-50 text-yellow-700 border-yellow-200">
                    Active Play
                  </span>
                )}
                {expiryLabel && expiryLabel !== 'Expired' && (
                  <span className="text-[10px] font-medium text-amber-600">⏰ {expiryLabel}</span>
                )}
                {isExpired && (
                  <span className="text-[10px] font-medium text-gray-400">Expired</span>
                )}
                {completionCount > 0 && !completedToday && (
                  <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                    <RotateCcw size={9} />
                    {completionCount}×
                  </span>
                )}
                {completedToday && (
                  <span className="text-[10px] font-semibold text-green-600">✓ Done today</span>
                )}
              </div>

              {/* Expandable description */}
              {expanded && (
                <p className="text-xs text-gray-500 mt-2 leading-relaxed">{mission.description}</p>
              )}
            </div>

            {/* Points + expand */}
            <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
              <span className="flex items-center gap-0.5 text-xs font-bold text-[#E8611A] bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-md">
                <Zap size={10} fill="#E8611A" />
                {mission.points}
              </span>
              <button
                onClick={() => setExpanded(e => !e)}
                className="text-gray-300 hover:text-gray-500 transition-colors"
              >
                {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Weekly Challenge Card ────────────────────────────────────────────────────
function WeeklyChallenge({ challenge }) {
  const pct      = Math.min(100, (challenge.currentCount / challenge.targetCount) * 100)
  const daysLeft = Math.max(0, Math.ceil((new Date(challenge.endsAt) - Date.now()) / 86400000))

  return (
    <div className="mx-4 mb-3 rounded-xl border border-[#E8611A]/30 bg-gradient-to-r from-orange-50 to-amber-50 p-3.5">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Trophy size={16} className="text-[#E8611A]" />
          <div>
            <p className="text-xs font-bold text-gray-800">{challenge.title}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">{challenge.description}</p>
          </div>
        </div>
        <div className="text-right flex-shrink-0 ml-3">
          <p className="text-xs font-bold text-[#E8611A]">+{challenge.bonusPoints} pts</p>
          <p className="text-[10px] text-gray-400">{daysLeft}d left</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-orange-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#E8611A] rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-[#E8611A] flex-shrink-0">
          {challenge.currentCount}/{challenge.targetCount}
        </span>
      </div>
    </div>
  )
}

// ─── AI Recommender Banner ────────────────────────────────────────────────────
function AIRecommender({ recommendations }) {
  const [dismissed, setDismissed] = useState([])
  const visible = recommendations.filter(r => !dismissed.includes(r.id))
  if (visible.length === 0) return null

  return (
    <div className="mx-4 mb-3 space-y-2">
      {visible.map(rec => (
        <div key={rec.id} className="rounded-xl border border-blue-200 bg-blue-50 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <Star size={13} className="text-blue-500 flex-shrink-0 mt-0.5" fill="#3b82f6" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${rec.typeColor}`}>
                    {rec.type}
                  </span>
                </div>
                <p className="text-xs font-semibold text-gray-800 leading-snug">{rec.headline}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{rec.reason}</p>
              </div>
            </div>
            <button
              onClick={() => setDismissed(d => [...d, rec.id])}
              className="text-gray-300 hover:text-gray-500 flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Missions Tab ────────────────────────────────────────────────────────
export default function MissionsTab({ employee, onPointsEarned, onStreakUpdate }) {
  const [missionsState, setMissionsState] = useState(() => loadMissionsState())
  const [category,      setCategory]      = useState('All')
  const [flashPts,      setFlashPts]      = useState(null)

  // Completions for this employee
  const empCompletions = missionsState[employee.id] || {}

  // Play-generated missions from active plays
  const playMissions = GROWTH_PLAYS
    .filter(p => p.status === 'Active')
    .flatMap(p => p.generatedMissions)

  const allMissions = [...playMissions, ...STANDING_MISSIONS]
  const filtered    = category === 'All'
    ? allMissions
    : allMissions.filter(m => m.category === category)

  const todayStr   = new Date().toLocaleDateString('en-CA')
  const doneToday  = filtered.filter(m => empCompletions[m.id]?.some(c => c.date === todayStr))
  const remaining  = filtered.filter(m => !empCompletions[m.id]?.some(c => c.date === todayStr))

  // Persist to localStorage
  useEffect(() => { saveMissionsState(missionsState) }, [missionsState])

  const handleComplete = useCallback((mission, note) => {
    const empId    = employee.id
    const today    = new Date().toLocaleDateString('en-CA')
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA')

    // Check streak logic before updating state
    const currentEmpData = missionsState[empId] || {}
    const alreadyToday   = Object.values(currentEmpData).some(cs => cs.some(c => c.date === today))
    const didYesterday   = Object.values(currentEmpData).some(cs => cs.some(c => c.date === yesterday))

    // Update completions
    setMissionsState(prev => {
      const empData   = { ...(prev[empId] || {}) }
      const existing  = empData[mission.id] || []
      empData[mission.id] = [...existing, { date: today, note }]
      return { ...prev, [empId]: empData }
    })

    // Award points
    onPointsEarned(empId, mission.points)

    // Update streak (only first mission of the day counts)
    if (!alreadyToday) {
      const newStreak = didYesterday ? employee.currentStreak + 1 : 1
      onStreakUpdate(empId, newStreak)
    }

    // Flash
    setFlashPts(mission.points)
  }, [employee, missionsState, onPointsEarned, onStreakUpdate])

  // Next rank info
  const currentRank    = getRank(employee.points)
  const currentRankIdx = RANKS.findIndex(r => r.name === currentRank.name)
  const nextRank       = RANKS[currentRankIdx + 1] || null
  const ptsToNext      = nextRank ? Math.max(0, nextRank.min - employee.points) : 0

  // Today's total completions count (all categories)
  const totalTodayCount = Object.values(empCompletions).filter(cs => cs.some(c => c.date === todayStr)).length

  return (
    <div className="pb-4">
      {/* Points flash overlay */}
      {flashPts !== null && (
        <PointsFlash points={flashPts} onDone={() => setFlashPts(null)} />
      )}

      {/* ── Today's summary strip ─────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-xl font-black text-[#E8611A] leading-none">{totalTodayCount}</p>
            <p className="text-[10px] text-gray-400 leading-none mt-0.5">done today</p>
          </div>
          <div className="w-px h-7 bg-gray-200" />
          <div className="text-center">
            <p className="text-xl font-black text-gray-800 leading-none">{employee.pointsThisWeek.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 leading-none mt-0.5">pts this week</p>
          </div>
          <div className="w-px h-7 bg-gray-200" />
          <div className="flex items-center gap-1.5">
            <Flame size={15} className="text-[#E8611A]" />
            <div>
              <p className="text-xl font-black text-gray-800 leading-none">{employee.currentStreak}</p>
              <p className="text-[10px] text-gray-400 leading-none mt-0.5">day streak</p>
            </div>
          </div>
        </div>
        {ptsToNext > 0 && nextRank && (
          <div className="text-right">
            <p className="text-[10px] text-gray-400 leading-none">{ptsToNext.toLocaleString()} pts to</p>
            <p className={`text-xs font-bold leading-tight mt-0.5 ${nextRank.color}`}>{nextRank.name}</p>
          </div>
        )}
      </div>

      {/* ── Weekly Challenge ──────────────────────────────────────────────── */}
      <div className="pt-3">
        <WeeklyChallenge challenge={WEEKLY_CHALLENGE} />
      </div>

      {/* ── AI Recommender ────────────────────────────────────────────────── */}
      <AIRecommender recommendations={AI_RECOMMENDATIONS} />

      {/* ── Category Filter ───────────────────────────────────────────────── */}
      <div className="px-4 mb-3">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                category === cat
                  ? 'bg-[#E8611A] text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Mission List ──────────────────────────────────────────────────── */}
      <div className="px-4 space-y-2">
        {/* Remaining missions */}
        {remaining.length > 0 && (
          <>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              {remaining.length} available
            </p>
            {remaining.map(m => (
              <MissionCard
                key={m.id}
                mission={m}
                completions={empCompletions[m.id] || []}
                onComplete={handleComplete}
                isPlayMission={m.type === 'play-generated'}
              />
            ))}
          </>
        )}

        {/* Completed today */}
        {doneToday.length > 0 && (
          <>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-4">
              Completed today ({doneToday.length})
            </p>
            {doneToday.map(m => (
              <MissionCard
                key={m.id}
                mission={m}
                completions={empCompletions[m.id] || []}
                onComplete={handleComplete}
                isPlayMission={m.type === 'play-generated'}
              />
            ))}
          </>
        )}

        {filtered.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">
            No missions in this category.
          </div>
        )}
      </div>
    </div>
  )
}
