import { GraduationCap } from 'lucide-react'
import TeamCoachingSection from './TeamCoachingSection'

// Team Coaching — per-employee results, month-over-month trends, and insights.
// (Replaced the old sales-skill role-play tracker, which wasn't being used.)
export default function CoachingTrackerPage() {
  return (
    <div className="max-w-5xl mx-auto pb-12">
      <div className="flex items-center gap-2 mb-1">
        <GraduationCap size={20} style={{ color: 'var(--studio-accent, #C8102E)' }} />
        <h1 className="text-2xl font-bold text-gray-900">Coaching</h1>
      </div>
      <p className="text-sm text-gray-500 mb-5">Each team member's results vs. cost, month-over-month trends, and coaching insights.</p>
      <TeamCoachingSection />
    </div>
  )
}
