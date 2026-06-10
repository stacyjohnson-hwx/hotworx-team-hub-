import { useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { supabase } from '@/lib/supabase'
import { StudioSwitcher } from '@/components/StudioSwitcher'
import {
  LayoutDashboard,
  Calendar,
  Target,
  TrendingUp,
  BarChart2,
  Megaphone,
  Building2,
  ShoppingCart,
  ClipboardCheck,
  CheckSquare,
  ListTodo,
  MessageSquare,
  CalendarOff,
  BookOpen,
  GraduationCap,
  LogOut,
  Camera,
  Users,
  UserCircle,
  Sparkles,
  Wrench,
  ShieldAlert,
  Swords,
  Package,
} from 'lucide-react'

// Sidebar organized into sections. Dashboard is pinned (no header); the footer
// button covers "My Profile". Sections with no role-visible items are hidden.
const NAV_SECTIONS = [
  {
    title: null,
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['owner', 'manager', 'tsa'] },
    ],
  },
  {
    title: 'Daily Operations',
    items: [
      { to: '/schedule',    label: 'Schedule',                icon: Calendar,       roles: ['owner', 'manager', 'tsa'] },
      { to: '/timeoff',     label: 'Time Off & Availability', icon: CalendarOff,    roles: ['owner', 'manager', 'tsa'] },
      { to: '/cleaning',    label: 'Tasks',                   icon: CheckSquare,    roles: ['owner', 'manager', 'tsa'] },
      { to: '/eod',         label: 'EOD Checkout',            icon: ClipboardCheck, roles: ['owner', 'manager', 'tsa'] },
      { to: '/orders',      label: 'Orders',                  icon: ShoppingCart,   roles: ['owner', 'manager', 'tsa'] },
      { to: '/maintenance', label: 'Maintenance',             icon: Wrench,         roles: ['owner', 'manager', 'tsa'] },
      { to: '/escalations', label: 'Escalations',             icon: ShieldAlert,    roles: ['owner', 'manager', 'tsa'] },
    ],
  },
  {
    title: 'Sales & Growth',
    items: [
      { to: '/goals',       label: 'Goals',           icon: Target,     roles: ['owner', 'manager', 'tsa'] },
      { to: '/leads',       label: 'Growth',          icon: TrendingUp, roles: ['owner', 'manager', 'tsa'] },
      { to: '/events',      label: 'Events & Promos', icon: Megaphone,  roles: ['owner', 'manager', 'tsa'] },
      { to: '/b2b',         label: 'B2B Outreach',    icon: Building2,  roles: ['owner', 'manager', 'tsa'] },
      { to: '/competitors', label: 'Competitors',     icon: Swords,     roles: ['owner', 'manager', 'tsa'] },
      { to: '/retail',      label: 'Retail',          icon: Package,    roles: ['owner', 'manager'] },
    ],
  },
  {
    title: 'Resources',
    items: [
      { to: '/sops',     label: 'SOPs',     icon: BookOpen,      roles: ['owner', 'manager', 'tsa'] },
      { to: '/training', label: 'Training', icon: GraduationCap, roles: ['owner', 'manager', 'tsa'] },
    ],
  },
  {
    title: 'Team & Coaching',
    items: [
      { to: '/team',     label: 'Team',     icon: Users,         roles: ['owner', 'manager'] },
      { to: '/coaching', label: 'Coaching', icon: MessageSquare, roles: ['owner', 'manager'] },
      { to: '/todo',     label: 'To-Do',    icon: ListTodo,      roles: ['owner', 'manager'] },
    ],
  },
  {
    title: 'Insights',
    items: [
      { to: '/studio-trends', label: 'Studio Trends', icon: BarChart2, roles: ['owner', 'manager'] },
      { to: '/advisor',       label: 'AI Advisor',    icon: Sparkles,  roles: ['owner', 'manager'] },
    ],
  },
]

function Avatar({ name, avatarUrl, size = 7 }) {
  const sizeClass = `w-${size} h-${size}`
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0`}
      />
    )
  }
  return (
    <div className={`${sizeClass} rounded-full bg-red-600 flex items-center justify-center flex-shrink-0`}>
      <span className="text-white text-xs font-bold">{name.charAt(0).toUpperCase()}</span>
    </div>
  )
}

export function Sidebar({ onNavigate }) {
  const { user, signOut, profile } = useAuth()
  const { role } = useRole()
  const navigate = useNavigate()

  const roleLabel = role === 'owner' ? 'Owner' : role === 'manager' ? 'Manager' : 'TSA'
  const displayName = profile?.name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Team Member'
  const avatarUrl   = profile?.avatar_url || user?.user_metadata?.avatar_url || null

  return (
    <aside className="flex flex-col w-56 h-full bg-gray-950 border-r border-gray-800">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-800">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-600 flex items-center justify-center">
          <span className="text-white text-sm font-bold">H</span>
        </div>
        <div className="overflow-hidden">
          <p className="text-white text-sm font-semibold leading-tight truncate">HOTWORX</p>
          <p className="text-gray-500 text-xs leading-tight">Team Hub</p>
        </div>
      </div>

      {/* Studio Switcher */}
      <div className="px-3 py-3 border-b border-gray-800">
        <StudioSwitcher />
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto relative min-h-0">
        <nav className="py-3 px-2">
          {NAV_SECTIONS.map((section, si) => {
            const items = section.items.filter(item => item.roles.includes(role))
            if (!items.length) return null
            return (
              <div key={si} className={section.title ? 'mt-4 first:mt-0' : ''}>
                {section.title && (
                  <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                    {section.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {items.map(({ to, label, icon: Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActive
                            ? 'bg-red-950 text-red-600 font-medium'
                            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                        }`
                      }
                    >
                      <Icon size={16} className="flex-shrink-0" />
                      <span className="truncate">{label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>
      </div>

      {/* User footer */}
      <div className="border-t border-gray-800 px-3 py-3">
        <button
          onClick={() => { navigate('/profile'); onNavigate?.() }}
          title="My Profile"
          className="flex items-center gap-2 w-full mb-2 px-1 rounded-lg hover:bg-gray-800 py-1.5 transition-colors group"
        >
          <div className="relative flex-shrink-0">
            <Avatar name={displayName} avatarUrl={avatarUrl} size={7} />
            <span className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <UserCircle size={10} className="text-white" />
            </span>
          </div>
          <div className="overflow-hidden text-left">
            <p className="text-gray-200 text-xs font-medium truncate">{displayName}</p>
            <p className="text-gray-500 text-xs">{roleLabel}</p>
          </div>
        </button>
        <button
          onClick={signOut}
          className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 text-xs transition-colors"
        >
          <LogOut size={13} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
