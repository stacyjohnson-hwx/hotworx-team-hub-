import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { Navigate } from 'react-router-dom'

// Gate a route to platform (SaaS) super-admins only — the cross-studio provisioning portal.
export function PlatformAdminGuard({ children, fallback = <Navigate to="/dashboard" replace /> }) {
  const { loading } = useAuth()
  const { isPlatformAdmin } = useRole()
  if (loading) return null
  if (!isPlatformAdmin) return fallback
  return children
}
