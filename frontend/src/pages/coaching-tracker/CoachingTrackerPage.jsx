import { MessageSquare } from 'lucide-react'
import { CoachingTracker } from '@/pages/certification/CertificationPage'

// Sales-skill coaching / role-play tracker — moved out of the Sales Certification
// tabs into its own owner/manager nav item under "Team & Coaching".
export default function CoachingTrackerPage() {
  return (
    <div className="max-w-5xl mx-auto pb-12">
      <div className="flex items-center gap-2 mb-1">
        <MessageSquare size={20} style={{ color: 'var(--studio-accent, #C8102E)' }} />
        <h1 className="text-2xl font-bold text-gray-900">Coaching</h1>
      </div>
      <p className="text-sm text-gray-500 mb-5">Sales-skill coaching &amp; role-play history — one section per team member.</p>
      <CoachingTracker />
    </div>
  )
}
