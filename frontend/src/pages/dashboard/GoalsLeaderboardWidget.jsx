import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useStudio } from '@/contexts/StudioContext'
import { apiGet } from '@/hooks/useApi'
import { Trophy, ChevronRight } from 'lucide-react'
import { Avatar } from '@/pages/contest/ContestPage'

const MEDALS = ['🥇', '🥈', '🥉']

const METRICS = [
  { key: 'members',  label: '👥 Members', pick: r => r.total_memberships || 0, goal: r => r.memberships_goal_computed || 0, fmt: v => String(v) },
  { key: 'retail',   label: '💰 Retail',  pick: r => r.retail_actual || 0,     goal: r => r.retail_goal_computed || 0,      fmt: v => '$' + Math.round(v).toLocaleString() },
  { key: 'outreach', label: '📞 Outreach', pick: r => (r.calls_made || 0) + (r.texts_made || 0), goal: r => r.outreach_goal || 0, fmt: v => String(v) },
]

// Compact dashboard card ranking the team on a chosen goal metric for the selected
// month. Mirrors the full Team Performance page (/goals) to spark daily competition.
export default function GoalsLeaderboardWidget({ meId, month, year }) {
  const { currentStudio } = useStudio()
  const [rows, setRows] = useState(null)
  const [metric, setMetric] = useState('members')

  useEffect(() => {
    setRows(null)
    apiGet(`/api/goals/leaderboard?month=${month}&year=${year}`)
      .then(list => setRows(Array.isArray(list) ? list : []))
      .catch(() => setRows([]))
  }, [currentStudio?.id, month, year])

  // Nothing to compete over until at least two people are on the board with hours.
  if (!rows || rows.length < 2) return null

  const M = METRICS.find(m => m.key === metric) || METRICS[0]
  const sorted = [...rows].sort((a, b) => M.pick(b) - M.pick(a))

  // Dense ranking — ties share a rank.
  const ranks = []
  sorted.forEach((r, i) => {
    if (i === 0) { ranks.push(1); return }
    ranks.push(M.pick(r) === M.pick(sorted[i - 1]) ? ranks[i - 1] : ranks[i - 1] + 1)
  })

  const topScore = Math.max(1, M.pick(sorted[0]))
  const anyScore = M.pick(sorted[0]) > 0

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-white to-amber-50/40 shadow-sm overflow-hidden">
      <Link to="/goals"
        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#C8102E] to-[#E8611A] text-white hover:brightness-105 transition">
        <Trophy size={15} />
        <span className="text-xs font-bold uppercase tracking-wider">Goal Leaderboard</span>
        <ChevronRight size={16} className="ml-auto text-white/80" />
      </Link>

      <div className="p-4">
        {/* Metric toggle */}
        <div className="flex gap-1 mb-3 bg-gray-100 rounded-lg p-0.5">
          {METRICS.map(opt => (
            <button key={opt.key} onClick={() => setMetric(opt.key)}
              className={`flex-1 px-2 py-1 text-[11px] font-semibold rounded-md transition-all ${
                metric === opt.key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>

        {anyScore ? (
          <div className="space-y-1.5">
            {sorted.map((r, i) => {
              const val = M.pick(r)
              const goal = M.goal(r)
              const isMe = r.tsa_id === meId
              const rank = ranks[i]
              const pct = Math.max(4, Math.round((val / topScore) * 100))
              return (
                <div key={r.tsa_id} className="flex items-center gap-2">
                  <span className="w-5 text-center text-sm flex-shrink-0">
                    {rank <= 3 ? MEDALS[rank - 1] : <span className="text-[11px] font-bold text-gray-400">{rank}</span>}
                  </span>
                  <Avatar name={r.tsa_name} url={r.avatar_url} size={26} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs truncate ${isMe ? 'font-bold text-[#E8611A]' : 'font-medium text-gray-700'}`}>
                        {r.tsa_name}{isMe ? ' (you)' : ''}
                      </span>
                      <span className="text-xs font-bold text-gray-900 flex-shrink-0">
                        {M.fmt(val)}{goal > 0 && <span className="text-[10px] font-normal text-gray-400"> / {M.fmt(goal)}</span>}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className={`h-full rounded-full ${rank === 1 ? 'bg-gradient-to-r from-[#C8102E] to-[#E8611A]' : 'bg-amber-300'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-400 py-2 text-center">No {M.label.replace(/^\S+\s/, '').toLowerCase()} logged yet this month — get on the board!</p>
        )}
      </div>
    </div>
  )
}
