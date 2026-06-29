import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { NavLink } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { MonthNav } from './MonthNav'
import { useMonth } from '@/contexts/MonthContext'
import { useRole } from '@/hooks/useRole'
import { useAuth } from '@/contexts/AuthContext'
import {
  Menu, X,
  LayoutDashboard, CheckSquare, ClipboardCheck,
  Calendar, UserCircle, MoreHorizontal,
} from 'lucide-react'

// ─── Bottom nav items shown on mobile (most-used for TSAs) ───────────────────
const BOTTOM_NAV = [
  { to: '/dashboard', label: 'Home',    icon: LayoutDashboard },
  { to: '/cleaning',  label: 'Tasks',   icon: CheckSquare     },
  { to: '/eod',       label: 'EOD',     icon: ClipboardCheck  },
  { to: '/schedule',  label: 'Schedule',icon: Calendar        },
  { to: '/profile',   label: 'Profile', icon: UserCircle      },
]

// Only these pages read the global month/year selector; hide it everywhere else.
const MONTH_AWARE_PATHS = ['/dashboard', '/goals', '/advisor', '/studio-trends', '/events', '/scorecard']

export function Layout() {
  const { isCurrentMonth } = useMonth()
  const { role } = useRole()
  const { signOut } = useAuth()
  const { pathname } = useLocation()
  const showMonthNav = MONTH_AWARE_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* ── Desktop sidebar (hidden on mobile) ───────────────────────────── */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* ── Mobile drawer overlay ─────────────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 md:hidden transition-transform duration-200
        ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Re-use the desktop sidebar inside the drawer */}
        <div className="h-full overflow-y-auto">
          <Sidebar onNavigate={() => setDrawerOpen(false)} />
        </div>
      </div>

      {/* ── Main column ───────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">

        {/* Top bar */}
        <header className="flex items-center justify-between h-12 px-3 md:px-5 bg-gray-950 border-b border-gray-800 flex-shrink-0">

          {/* Hamburger — mobile only */}
          <button
            className="md:hidden p-1.5 text-gray-400 hover:text-white rounded-lg transition-colors"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>

          {showMonthNav && <MonthNav />}

          {showMonthNav && !isCurrentMonth && (
            <span className="hidden sm:inline text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 px-2 py-0.5 rounded-full">
              Past month — read only
            </span>
          )}
          {/* Spacer on mobile to balance the hamburger */}
          <div className="w-8 md:hidden" />
        </header>

        {/* Page content — smaller padding on mobile, pb for bottom nav */}
        <main className="flex-1 overflow-y-auto p-3 md:p-6 pb-20 md:pb-6">
          <Outlet />
        </main>

        {/* ── Mobile bottom nav ──────────────────────────────────────────── */}
        <nav className="md:hidden flex items-center justify-around border-t border-gray-200 bg-white safe-area-bottom flex-shrink-0">
          {BOTTOM_NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-2 py-3 flex-1 text-center transition-colors ${
                  isActive ? 'text-red-600' : 'text-gray-500'
                }`
              }
            >
              <Icon size={20} />
              <span className="text-[10px] font-medium leading-tight">{label}</span>
            </NavLink>
          ))}
        </nav>

      </div>
    </div>
  )
}
