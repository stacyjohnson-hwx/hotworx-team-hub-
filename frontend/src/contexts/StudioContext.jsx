import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const StudioContext = createContext(null)

export function StudioProvider({ children }) {
  const [studios, setStudios] = useState([])
  const [currentStudio, setCurrentStudio] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStudios()
  }, [])

  async function loadStudios() {
    try {
      // First get user-studio relationships
      const { data: userStudios, error: userError } = await supabase
        .from('user_studios')
        .select('role, studio_id')

      console.log('[StudioContext] user_studios query:', { userStudios, userError })

      if (userError) {
        console.error('[StudioContext] Error loading user_studios:', userError)
        throw userError
      }

      if (!userStudios || userStudios.length === 0) {
        console.warn('[StudioContext] No studios found for user')
        setLoading(false)
        return
      }

      // Then get studio details
      const studioIds = userStudios.map(us => us.studio_id)
      const { data: studios, error: studiosError } = await supabase
        .from('studios')
        .select('*')
        .in('id', studioIds)

      console.log('[StudioContext] studios query:', { studios, studiosError })

      if (studiosError) {
        console.error('[StudioContext] Error loading studios:', studiosError)
        throw studiosError
      }

      if (!studios || studios.length === 0) {
        console.warn('[StudioContext] No studio details found')
        setLoading(false)
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
          userRole: userStudio?.role,
        }
      }).sort((a, b) => a.code.localeCompare(b.code))

      console.log('[StudioContext] Final studio list:', studioList)

      setStudios(studioList)

      // Restore last selected studio from localStorage or default to first
      const savedStudioId = localStorage.getItem('selectedStudioId')
      const defaultStudio = studioList.find(s => s.id === savedStudioId) || studioList[0]

      console.log('[StudioContext] Selected studio:', defaultStudio)

      setCurrentStudio(defaultStudio || null)
      setLoading(false)
    } catch (err) {
      console.error('[StudioContext] Failed to load studios:', err)
      setLoading(false)
    }
  }

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
