import { useAuth } from '@/contexts/AuthContext'
import { Link } from 'react-router-dom'

// Shown instead of a silent redirect so a blocked link reads as "not permitted"
// rather than a broken link that dumps you on the dashboard.
function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-6">
      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4 text-2xl">🔒</div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">You don’t have access to this page</h2>
      <p className="text-sm text-gray-500 mb-5">Ask an owner or manager if you think you should.</p>
      <Link to="/dashboard" className="text-sm font-medium text-red-600 hover:underline">Back to dashboard</Link>
    </div>
  )
}

export function RoleGuard({ allowedRoles, children, fallback = <NoAccess /> }) {
  const { role, loading } = useAuth()

  if (loading) return null

  if (!allowedRoles.includes(role)) return fallback

  return children
}
