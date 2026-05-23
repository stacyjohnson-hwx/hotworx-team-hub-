import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { MonthNav } from './MonthNav'
import { useMonth } from '@/contexts/MonthContext'

export function Layout() {
  const { isCurrentMonth } = useMonth()

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between h-12 px-5 bg-gray-950 border-b border-gray-800 flex-shrink-0">
          <MonthNav />

          {!isCurrentMonth && (
            <span className="text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 px-2 py-0.5 rounded-full">
              Viewing past month — read only for TSAs
            </span>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
