import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { useMonth } from '@/contexts/MonthContext'
import { formatMonthYear } from '@/lib/utils'

export default function Dashboard() {
  const { user } = useAuth()
  const { role, isOwnerOrManager } = useRole()
  const { selectedMonth, isCurrentMonth } = useMonth()

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there'
  const roleLabel = role === 'owner' ? 'Owner' : role === 'manager' ? 'Manager' : 'TSA'

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {displayName} 👋
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {roleLabel} · {formatMonthYear(selectedMonth.month, selectedMonth.year)}
          {!isCurrentMonth && ' · Read-only view'}
        </p>
      </div>

      {/* Quick-access cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <QuickCard
          title="Cleaning"
          description="View today's cleaning tasks"
          href="/cleaning"
          color="bg-blue-50 border-blue-200"
          iconColor="text-blue-600"
        />
        <QuickCard
          title="EOD Checkout"
          description="Submit your end-of-shift report"
          href="/eod"
          color="bg-green-50 border-green-200"
          iconColor="text-green-600"
        />
        <QuickCard
          title="Goals"
          description="Check studio & personal goals"
          href="/goals"
          color="bg-red-50 border-red-200"
          iconColor="text-red-600"
        />
        <QuickCard
          title="Schedule"
          description="View the weekly shift schedule"
          href="/schedule"
          color="bg-purple-50 border-purple-200"
          iconColor="text-purple-600"
        />
        <QuickCard
          title="Lead Generation"
          description="Log daily lead activity"
          href="/leads"
          color="bg-orange-50 border-orange-200"
          iconColor="text-orange-600"
        />
        <QuickCard
          title="SOPs"
          description="Reference studio procedures"
          href="/sops"
          color="bg-gray-50 border-gray-200"
          iconColor="text-gray-600"
        />
        <QuickCard
          title="Training"
          description="Browse training resources"
          href="/training"
          color="bg-indigo-50 border-indigo-200"
          iconColor="text-indigo-600"
        />
        {isOwnerOrManager && (
          <QuickCard
            title="To-Do List"
            description="Your private task list"
            href="/todo"
            color="bg-yellow-50 border-yellow-200"
            iconColor="text-yellow-600"
          />
        )}
        {isOwnerOrManager && (
          <QuickCard
            title="Coaching"
            description="Session notes & action items"
            href="/coaching"
            color="bg-teal-50 border-teal-200"
            iconColor="text-teal-600"
          />
        )}
      </div>


    </div>
  )
}

function QuickCard({ title, description, href, color, iconColor }) {
  return (
    <a
      href={href}
      className={`block p-4 rounded-xl border ${color} hover:shadow-sm transition-shadow`}
    >
      <p className={`text-sm font-semibold ${iconColor}`}>{title}</p>
      <p className="text-xs text-gray-500 mt-0.5">{description}</p>
    </a>
  )
}
