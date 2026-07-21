import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { MonthProvider } from '@/contexts/MonthContext'
import { StudioProvider } from '@/contexts/StudioContext'
import { Layout } from '@/components/Layout'
import { RoleGuard } from '@/components/RoleGuard'
import { PlatformAdminGuard } from '@/components/PlatformAdminGuard'
import AdminPortalPage from '@/pages/admin/AdminPortalPage'
import LoginPage from '@/pages/auth/LoginPage'
import Dashboard from '@/pages/Dashboard'
import CleaningPage from '@/pages/cleaning/CleaningPage'
import EodPage from '@/pages/eod/EodPage'
import GoalsPage from '@/pages/goals/GoalsPage'
import LeadsPage from '@/pages/leads/LeadsPage'
import SchedulePage from '@/pages/schedule/SchedulePage'
import TimeOffPage from '@/pages/timeoff/TimeOffPage'
import StudioTrendsPage from '@/pages/studio-trends/StudioTrendsPage'
import ScorecardPage from '@/pages/scorecard/ScorecardPage'
import B2bPage from '@/pages/b2b/B2bPage'
import SocialAnalyticsPage from '@/pages/social/SocialAnalyticsPage'
import OrdersPage from '@/pages/orders/OrdersPage'
import EventsPage from '@/pages/events/EventsPage'
import SopsPage from '@/pages/sops/SopsPage'
import TrainingPage from '@/pages/training/TrainingPage'
import CertificationPage from '@/pages/certification/CertificationPage'
import TodoPage from '@/pages/todo/TodoPage'
import CoachingPage from '@/pages/coaching/CoachingPage'
import LaborPage from '@/pages/labor/LaborPage'
import UsersPage from '@/pages/users/UsersPage'
import ProfilePage from '@/pages/profile/ProfilePage'
import OnboardingPage from '@/pages/onboarding/OnboardingPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'
import PublicCalendarPage from '@/pages/public/PublicCalendarPage'
import AdvisorPage from '@/pages/advisor/AdvisorPage'
import MaintenancePage from '@/pages/maintenance/MaintenancePage'
import EscalationsPage from '@/pages/escalations/EscalationsPage'
import CancellationsPage from '@/pages/cancellations/CancellationsPage'
import MemberActivationPage from '@/pages/member-activation/MemberActivationPage'
import CompetitorsPage from '@/pages/competitors/CompetitorsPage'
import RetailPage from '@/pages/retail/RetailPage'
import InventoryCountPage from '@/pages/retail/InventoryCountPage'
import ContestPage from '@/pages/contest/ContestPage'

function ProtectedRoute({ children }) {
  const { session, loading, profile } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />
  // Redirect to onboarding if not yet completed (skip for /onboarding and /profile)
  const skipOnboarding = ['/onboarding', '/profile'].includes(location.pathname)
  if (!skipOnboarding && profile && !profile.onboarding_completed_at) {
    return <Navigate to="/onboarding" replace />
  }
  return children
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    </div>
  )
}

function AppRoutes() {
  const { session, loading } = useAuth()

  if (loading) return <LoadingScreen />

  return (
    <Routes>
      <Route
        path="/login"
        element={session ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />

      <Route
        element={
          <ProtectedRoute>
            <StudioProvider>
              <MonthProvider>
                <Layout />
              </MonthProvider>
            </StudioProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />

        {/* Modules — built milestone by milestone */}
        <Route path="/schedule"  element={<SchedulePage />} />
        <Route path="/goals"     element={<GoalsPage />} />
        <Route path="/leads"     element={<LeadsPage />} />
        <Route
          path="/studio-trends"
          element={
            <RoleGuard allowedRoles={['owner', 'manager']}>
              <StudioTrendsPage />
            </RoleGuard>
          }
        />
        <Route
          path="/scorecard"
          element={
            <RoleGuard allowedRoles={['owner', 'manager']}>
              <ScorecardPage />
            </RoleGuard>
          }
        />
        <Route path="/events"    element={<EventsPage />} />
        <Route path="/contest"   element={<ContestPage />} />
        <Route path="/b2b"       element={<B2bPage />} />
        <Route path="/social"    element={<SocialAnalyticsPage />} />
        <Route path="/orders"    element={<OrdersPage />} />
        <Route path="/eod"       element={<EodPage />} />
        <Route path="/cleaning"  element={<CleaningPage />} />
        <Route path="/timeoff"   element={<TimeOffPage />} />
        <Route path="/sops"        element={<SopsPage />} />
        <Route path="/training"    element={<TrainingPage />} />
        <Route path="/certification" element={<CertificationPage />} />
        <Route path="/maintenance"  element={<MaintenancePage />} />
        <Route path="/escalations"  element={<EscalationsPage />} />
        <Route path="/cancellations" element={<CancellationsPage />} />
        <Route path="/member-activation" element={<MemberActivationPage />} />
        <Route path="/competitors"  element={<CompetitorsPage />} />
        <Route
          path="/retail"
          element={
            <RoleGuard allowedRoles={['owner', 'manager']}>
              <RetailPage />
            </RoleGuard>
          }
        />
        <Route
          path="/retail/count/:sessionId"
          element={
            <RoleGuard allowedRoles={['owner', 'manager']}>
              <InventoryCountPage />
            </RoleGuard>
          }
        />

        {/* AI Advisor — Owner + Manager only */}
        <Route
          path="/advisor"
          element={
            <RoleGuard allowedRoles={['owner', 'manager']}>
              <AdvisorPage />
            </RoleGuard>
          }
        />

        {/* Owner + Manager only */}
        <Route
          path="/todo"
          element={
            <RoleGuard allowedRoles={['owner', 'manager']}>
              <TodoPage />
            </RoleGuard>
          }
        />
        <Route
          path="/coaching"
          element={
            <RoleGuard allowedRoles={['owner', 'manager']}>
              <CoachingPage />
            </RoleGuard>
          }
        />
        {/* Owner only — pay data */}
        <Route
          path="/team-roi"
          element={
            <RoleGuard allowedRoles={['owner']}>
              <LaborPage />
            </RoleGuard>
          }
        />

        {/* Owner + Manager only */}
        <Route
          path="/team"
          element={
            <RoleGuard allowedRoles={['owner', 'manager']}>
              <UsersPage />
            </RoleGuard>
          }
        />
        {/* Platform super-admin — franchise provisioning */}
        <Route
          path="/admin"
          element={
            <PlatformAdminGuard>
              <AdminPortalPage />
            </PlatformAdminGuard>
          }
        />
        {/* All authenticated users */}
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      {/* Onboarding — outside Layout so it's full-page */}
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OnboardingPage />
          </ProtectedRoute>
        }
      />

      {/* Password reset — must be outside ProtectedRoute so logged-out users can reach it */}
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Public, no-auth client calendar (QR / link target) */}
      <Route path="/calendar/:studioId" element={<PublicCalendarPage />} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
