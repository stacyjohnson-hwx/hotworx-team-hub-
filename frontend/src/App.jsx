import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { MonthProvider } from '@/contexts/MonthContext'
import { Layout } from '@/components/Layout'
import { RoleGuard } from '@/components/RoleGuard'
import LoginPage from '@/pages/auth/LoginPage'
import Dashboard from '@/pages/Dashboard'
import CleaningPage from '@/pages/cleaning/CleaningPage'
import EodPage from '@/pages/eod/EodPage'
import GoalsPage from '@/pages/goals/GoalsPage'
import LeadsPage from '@/pages/leads/LeadsPage'
import SchedulePage from '@/pages/schedule/SchedulePage'
import TimeOffPage from '@/pages/timeoff/TimeOffPage'
import StudioTrendsPage from '@/pages/studio-trends/StudioTrendsPage'
import B2bPage from '@/pages/b2b/B2bPage'
import OrdersPage from '@/pages/orders/OrdersPage'
import EventsPage from '@/pages/events/EventsPage'
import SopsPage from '@/pages/sops/SopsPage'
import TrainingPage from '@/pages/training/TrainingPage'
import TodoPage from '@/pages/todo/TodoPage'
import CoachingPage from '@/pages/coaching/CoachingPage'

function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />
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
            <MonthProvider>
              <Layout />
            </MonthProvider>
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
        <Route path="/events"    element={<EventsPage />} />
        <Route path="/b2b"       element={<B2bPage />} />
        <Route path="/orders"    element={<OrdersPage />} />
        <Route path="/eod"       element={<EodPage />} />
        <Route path="/cleaning"  element={<CleaningPage />} />
        <Route path="/timeoff"   element={<TimeOffPage />} />
        <Route path="/sops"      element={<SopsPage />} />
        <Route path="/training"  element={<TrainingPage />} />

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
      </Route>

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
