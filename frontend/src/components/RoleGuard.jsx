import { useAuth } from '@/contexts/AuthContext'
import { Navigate } from 'react-router-dom'

export function RoleGuard({ allowedRoles, children, fallback = <Navigate to="/dashboard" replace /> }) {
  const { role, loading } = useAuth()

  if (loading) return null

  if (!allowedRoles.includes(role)) return fallback

  return children
}
