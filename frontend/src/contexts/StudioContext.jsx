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
      // Fetch user's studios with explicit join
      const { data: userStudios, error: userError } = await supabase
        .from('user_studios')
        .select(`
          role,
          studio_id,
          studios (
            id,
            code,
            name,
            address,
            timezone
          )
        `)

      if (userError) throw userError

      if (!userStudios || userStudios.length === 0) {
        console.warn('No studios found for user')
        setLoading(false)
        return
      }

      const studioList = userStudios
        .filter(us => us.studios) // Filter out any null studios
        .map(us => ({
          id: us.studios.id,
          code: us.studios.code,
          name: us.studios.name,
          address: us.studios.address,
          timezone: us.studios.timezone,
          userRole: us.role,
        }))
        .sort((a, b) => a.code.localeCompare(b.code))

      setStudios(studioList)

      // Restore last selected studio from localStorage or default to first
      const savedStudioId = localStorage.getItem('selectedStudioId')
      const defaultStudio = studioList.find(s => s.id === savedStudioId) || studioList[0]

      setCurrentStudio(defaultStudio || null)
      setLoading(false)
    } catch (err) {
      console.error('Failed to load studios:', err)
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
