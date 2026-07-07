import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useStudio } from '@/contexts/StudioContext'
import { apiGet } from '@/hooks/useApi'
import { Trophy, Gift, ChevronRight } from 'lucide-react'
import { Avatar, fmtScore, countdownLabel } from '@/pages/contest/ContestPage'

const MEDALS = ['🥇', '🥈', '🥉']

// Compact dashboard card for the current active contest. Renders nothing when
// there's no live contest. Links through to the full Contests page.
export default function ContestWidget({ meId }) {
  const { currentStudio } = useStudio()
  const [contest, setContest] = useState(null)

  useEffect(() => {
    setContest(null)
    apiGet('/api/contests')
      .then(list => setContest((list || []).find(c => c.effective_status === 'active') || null))
      .catch(() => setContest(null))
  }, [currentStudio?.id])

  if (!contest) return null

  return (
    <Link to="/contest"
      className="block mt-8 rounded-2xl border border-orange-200 bg-gradient-to-br from-white to-orange-50/40 shadow-sm overflow-hidden hover:shadow-md transition-all">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#C8102E] to-[#E8611A] text-white">
        <Trophy size={15} />
        <span className="text-xs font-bold uppercase tracking-wider">Live Contest</span>
        <span className="ml-auto text-[11px] font-semibold bg-white/20 rounded-full px-2 py-0.5">⏳ {countdownLabel(contest)}</span>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-extrabold text-gray-900 leading-tight">{contest.title}</h3>
          <ChevronRight size={18} className="text-gray-300 flex-shrink-0 mt-0.5" />
        </div>
        {contest.prize && <p className="text-xs text-[#E8611A] font-semibold mt-0.5 inline-flex items-center gap-1"><Gift size={11} /> {contest.prize}</p>}

        {contest.top3?.length ? (
          <div className="mt-3 space-y-1.5">
            {contest.top3.map((r, i) => (
              <div key={r.user_id} className="flex items-center gap-2">
                <span className="w-5 text-center text-sm">{MEDALS[i]}</span>
                <Avatar name={r.name} url={r.avatar_url} size={26} />
                <span className={`flex-1 text-xs truncate ${r.user_id === meId ? 'font-bold text-[#E8611A]' : 'font-medium text-gray-700'}`}>{r.name}</span>
                <span className="text-xs font-bold text-gray-900">{fmtScore(contest, r.score)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-gray-400">No scores yet — be the first on the board!</p>
        )}

        {contest.my_rank && contest.my_rank > 3 && (
          <p className="mt-2 text-[11px] text-gray-500">You're <span className="font-bold text-[#E8611A]">#{contest.my_rank}</span> — {fmtScore(contest, contest.my_score)}</p>
        )}
      </div>
    </Link>
  )
}
