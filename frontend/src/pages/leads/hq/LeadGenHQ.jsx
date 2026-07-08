import { useState, useEffect } from 'react'
import { Zap, Megaphone, Sprout, ListChecks } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useStudio } from '@/contexts/StudioContext'
import MarketingHub   from '@/pages/marketing/MarketingHub'
import LeadGenHub     from '@/pages/leadgen/LeadGenHub'
import MyShift        from '@/pages/growth/MyShift'

// ─── Constants ────────────────────────────────────────────────────────────────
// Managers get the unified "My Tasks" execution list (same as TSAs' My Shift)
// PLUS the planning hubs (Content, Marketing). TSAs are routed straight to My
// Shift (no tabs). All progress/points live server-side in the underlying hubs;
// this shell only routes between them.
const ALL_TABS = [
  { id: 'myshift',   label: 'My Tasks',  icon: ListChecks, shortLabel: 'My Tasks'  },
  { id: 'marketing', label: 'Content',   icon: Megaphone,  shortLabel: 'Content'   },
  { id: 'leadgen',   label: 'Marketing', icon: Sprout,     shortLabel: 'Marketing' },
]

// Remembers the last tab the manager was on (UI convenience only).
const TAB_KEY = 'leadgenhq_tab'

// ─── HQ Shell ─────────────────────────────────────────────────────────────────
export default function LeadGenHQ() {
  const { role } = useAuth()
  const { currentStudio } = useStudio()
  const isTsa = role === 'tsa'
  const tabs = ALL_TABS

  // A ?tab= query param (e.g. the EOD email's "/leads?tab=marketing" links) wins
  // over the last-saved tab so deep links land on the right place.
  const urlTab = new URLSearchParams(window.location.search).get('tab')
  const savedTab = (() => { try { return localStorage.getItem(TAB_KEY) } catch { return null } })()
  const defaultTab = urlTab && tabs.find(t => t.id === urlTab)
    ? urlTab
    : (savedTab && tabs.find(t => t.id === savedTab) ? savedTab : 'myshift')

  const [activeTab, setActiveTab] = useState(defaultTab)

  useEffect(() => {
    try { localStorage.setItem(TAB_KEY, activeTab) } catch { /* ignore */ }
  }, [activeTab])

  // TSAs get the simple unified "My Shift" screen — no planning tabs.
  if (isTsa) {
    return (
      <div className="rounded-2xl border border-orange-200 overflow-hidden bg-white shadow-sm flex flex-col flex-1">
        <MyShift />
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-orange-200 overflow-hidden bg-white shadow-sm flex flex-col flex-1">

      {/* ── HQ Header ─────────────────────────────────────────────────────── */}
      <div className="bg-[#1A1A1A] px-4 pt-4 pb-0">
        <div className="flex items-start justify-between mb-3">

          {/* Brand + title */}
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Zap size={14} className="text-[#E8611A]" fill="#E8611A" />
              <span className="text-[10px] font-bold tracking-widest text-[#E8611A] uppercase">Marketing Tasks</span>
            </div>
            <p className="text-white font-bold text-lg leading-tight">{currentStudio?.name || 'HOTWORX'}</p>
          </div>
        </div>

        {/* ── Tab bar ───────────────────────────────────────────────────── */}
        <div className="flex gap-0 border-b border-white/10">
          {tabs.map(tab => {
            const Icon    = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors relative ${
                  isActive
                    ? 'text-[#E8611A]'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                <Icon size={16} strokeWidth={isActive ? 2.5 : 1.8} />
                <span>{tab.shortLabel}</span>
                {isActive && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#E8611A] rounded-full" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Tab Content ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'myshift'     && <MyShift />}
        {activeTab === 'marketing'   && <MarketingHub />}
        {activeTab === 'leadgen'     && <LeadGenHub />}
      </div>
    </div>
  )
}
