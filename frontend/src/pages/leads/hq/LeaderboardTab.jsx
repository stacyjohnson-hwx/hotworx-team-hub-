import { Flame, Trophy, Zap, TrendingUp } from 'lucide-react'
import { getRank, RANKS } from '../data/mockData'

// ─── Medal colors ─────────────────────────────────────────────────────────────
const MEDALS = ['🥇', '🥈', '🥉']

// ─── Progress bar to next rank ────────────────────────────────────────────────
function RankProgress({ points }) {
  const currentRank    = getRank(points)
  const currentRankIdx = RANKS.findIndex(r => r.name === currentRank.name)
  const nextRank       = RANKS[currentRankIdx + 1]

  if (!nextRank) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-1.5 bg-orange-200 rounded-full overflow-hidden">
          <div className="h-full bg-[#E8611A] rounded-full w-full" />
        </div>
        <span className={`text-[10px] font-bold ${currentRank.color}`}>MAX</span>
      </div>
    )
  }

  const pct = Math.min(100, ((points - currentRank.min) / (nextRank.min - currentRank.min)) * 100)
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#E8611A] rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-gray-400 flex-shrink-0">
        {Math.max(0, nextRank.min - points).toLocaleString()} to {nextRank.name}
      </span>
    </div>
  )
}

// ─── Leaderboard Row ──────────────────────────────────────────────────────────
function LeaderRow({ emp, rank, position, isActive }) {
  const medal = MEDALS[position] || null

  return (
    <div className={`flex items-center gap-3 px-4 py-3 transition-colors ${
      isActive
        ? 'bg-orange-50 border-l-2 border-[#E8611A]'
        : 'hover:bg-gray-50'
    }`}>
      {/* Position */}
      <div className="w-6 text-center flex-shrink-0">
        {medal
          ? <span className="text-base">{medal}</span>
          : <span className="text-xs font-bold text-gray-400">#{position + 1}</span>
        }
      </div>

      {/* Avatar */}
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${
        isActive ? 'bg-[#E8611A]' : 'bg-gray-400'
      }`}>
        {emp.name[0]}
      </div>

      {/* Name + rank + streak */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className={`text-sm font-semibold truncate ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>
            {emp.name}
          </p>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${rank.bg} ${rank.color}`}>
            {rank.name}
          </span>
        </div>
        <div className="mt-0.5">
          <RankProgress points={emp.points} />
        </div>
      </div>

      {/* Stats */}
      <div className="flex-shrink-0 flex flex-col items-end gap-1">
        <div className="flex items-center gap-1">
          <Zap size={11} className="text-[#E8611A]" fill="#E8611A" />
          <span className="text-sm font-bold text-gray-800">{emp.points.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-1">
          <Flame size={10} className="text-orange-400" />
          <span className="text-[10px] text-gray-400">{emp.currentStreak}d</span>
        </div>
      </div>
    </div>
  )
}

// ─── This Week's Standings ────────────────────────────────────────────────────
function WeeklyStandings({ employees, activeEmployeeId }) {
  const sorted = [...employees].sort((a, b) => b.pointsThisWeek - a.pointsThisWeek)

  return (
    <div>
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">This Week</p>
        <div className="flex items-center gap-1 text-[10px] text-gray-400">
          <TrendingUp size={10} />
          Resets Sunday
        </div>
      </div>
      <div className="space-y-0 divide-y divide-gray-50">
        {sorted.map((emp, i) => (
          <div key={emp.id} className={`flex items-center gap-3 px-4 py-2.5 ${
            emp.id === activeEmployeeId ? 'bg-orange-50' : 'hover:bg-gray-50'
          }`}>
            <div className="w-6 text-center flex-shrink-0">
              {MEDALS[i]
                ? <span className="text-sm">{MEDALS[i]}</span>
                : <span className="text-xs font-bold text-gray-400">#{i + 1}</span>
              }
            </div>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
              emp.id === activeEmployeeId ? 'bg-[#E8611A]' : 'bg-gray-300'
            }`}>
              {emp.name[0]}
            </div>
            <p className="flex-1 text-sm font-medium text-gray-700 truncate">{emp.name}</p>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <Zap size={11} fill="#E8611A" className="text-[#E8611A]" />
              <span className="text-sm font-bold text-gray-800">{emp.pointsThisWeek.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Leaderboard Tab ─────────────────────────────────────────────────────
export default function LeaderboardTab({ employee, employees }) {
  const sorted = [...employees].sort((a, b) => b.points - a.points)

  return (
    <div className="pb-4">
      {/* ── All-Time Board ────────────────────────────────────────────────── */}
      <div className="pt-3 pb-2 px-4">
        <div className="flex items-center gap-2 mb-0.5">
          <Trophy size={14} className="text-[#E8611A]" />
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">All-Time Points</p>
        </div>
      </div>

      <div className="divide-y divide-gray-50">
        {sorted.map((emp, i) => (
          <LeaderRow
            key={emp.id}
            emp={emp}
            rank={getRank(emp.points)}
            position={i}
            isActive={emp.id === employee.id}
          />
        ))}
      </div>

      {/* ── This Week ─────────────────────────────────────────────────────── */}
      <div className="mt-4 border-t border-gray-100">
        <WeeklyStandings employees={employees} activeEmployeeId={employee.id} />
      </div>

      {/* ── Rank legend ───────────────────────────────────────────────────── */}
      <div className="mt-4 mx-4 border-t border-gray-100 pt-4">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Rank Tiers</p>
        <div className="space-y-1.5">
          {[...RANKS].reverse().map(r => (
            <div key={r.name} className="flex items-center gap-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.bg} ${r.color} flex-shrink-0`}>
                {r.name}
              </span>
              <span className="text-[10px] text-gray-400">{r.min.toLocaleString()}+ pts</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
