import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const StudioContext = createContext(null)

// Per-studio accent so you can tell at a glance which studio is active.
// Pewaukee (WI0009) = brand red; Madison (WI0021) = orange.
const STUDIO_ACCENTS = {
  WI0021: { accent: '#E8611A', soft: 'rgba(232,97,26,0.18)' }, // Madison — orange
}
const DEFAULT_ACCENT = { accent: '#C8102E', soft: 'rgba(200,16,46,0.16)' } // Pewaukee — red
export const studioAccent = (code) => STUDIO_ACCENTS[code] || DEFAULT_ACCENT

export function StudioProvider({ children }) {
  const { session } = useAuth()
  const [studios, setStudios] = useState([])
  const [currentStudio, setCurrentStudio] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (session) {
      loadStudios()
    } else {
      setLoading(false)
    }
  }, [session])

  async function loadStudios() {
    try {
      const userId = session?.user?.id
      if (!userId) { setLoading(false); return }

      // THIS user's memberships only. Filter by user_id explicitly — a platform admin
      // can read other users' memberships, which would otherwise leak franchisee studios
      // into the switcher and could even auto-select one this user can't access, making
      // every studio-scoped API call 403 (looks like all their data vanished).
      const { data: userStudios, error: userError } = await supabase
        .from('user_studios')
        .select('role, studio_id')
        .eq('user_id', userId)
      if (userError) throw userError

      if (!userStudios || userStudios.length === 0) {
        localStorage.removeItem('selectedStudioId')   // never keep an inaccessible studio selected
        setStudios([]); setCurrentStudio(null); setLoading(false)
        return
      }

      const studioIds = userStudios.map(us => us.studio_id)
      const { data: studios, error: studiosError } = await supabase
        .from('studios')
        .select('*')
        .in('id', studioIds)
      if (studiosError) throw studiosError

      if (!studios || studios.length === 0) {
        localStorage.removeItem('selectedStudioId')
        setStudios([]); setCurrentStudio(null); setLoading(false)
        return
      }

      // Merge role with studio data
      const studioList = studios.map(studio => {
        const userStudio = userStudios.find(us => us.studio_id === studio.id)
        return {
          id: studio.id,
          code: studio.code,
          name: studio.name,
          address: studio.address,
          timezone: studio.timezone,
          latitude: studio.latitude,
          longitude: studio.longitude,
          userRole: userStudio?.role,
          color: studioAccent(studio.code).accent,
        }
      }).sort((a, b) => a.code.localeCompare(b.code))

      console.log('[StudioContext] Final studio list:', studioList)

      setStudios(studioList)

      // Restore last selected studio from localStorage or default to first
      const savedStudioId = localStorage.getItem('selectedStudioId')
      const defaultStudio = studioList.find(s => s.id === savedStudioId) || studioList[0]

      console.log('[StudioContext] Selected studio:', defaultStudio)

      if (defaultStudio) {
        setCurrentStudio(defaultStudio)
        // Always save to localStorage to ensure it's set
        localStorage.setItem('selectedStudioId', defaultStudio.id)
      }
      setLoading(false)
    } catch (err) {
      console.error('[StudioContext] Failed to load studios:', err)
      setLoading(false)
    }
  }

  // Paint the active studio's accent onto CSS variables so the sidebar/switcher
  // visibly flip color (Pewaukee red ↔ Madison orange).
  useEffect(() => {
    const { accent, soft } = studioAccent(currentStudio?.code)
    const root = document.documentElement
    root.style.setProperty('--studio-accent', accent)
    root.style.setProperty('--studio-accent-soft', soft)
  }, [currentStudio])

  function switchStudio(studioId) {
    const studio = studios.find(s => s.id === studioId)
    if (studio) {
      setCurrentStudio(studio)
      localStorage.setItem('selectedStudioId', studioId)
    }
  }

  return (
    <StudioContext.Provider value={{
      studios,
      currentStudio,
      switchStudio,
      loading,
    }}>
      {children}
    </StudioContext.Provider>
  )
}

export function useStudio() {
  const ctx = useContext(StudioContext)
  if (!ctx) throw new Error('useStudio must be used inside StudioProvider')
  return ctx
}
