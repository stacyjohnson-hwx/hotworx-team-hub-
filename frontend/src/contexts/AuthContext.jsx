import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const AuthContext = createContext(null)

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

async function fetchProfile(token) {
  try {
    const r = await fetch(`${API_URL}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [session, setSession]               = useState(undefined)  // undefined = loading
  const [user, setUser]                     = useState(null)
  const [role, setRole]                     = useState(null)
  const [profile, setProfile]               = useState(undefined)  // undefined = not yet loaded
  const [profileLoading, setProfileLoading] = useState(false)

  const loadProfile = useCallback(async (token) => {
    if (!token) { setProfile(null); return }
    setProfileLoading(true)
    const p = await fetchProfile(token)
    setProfile(p)
    setProfileLoading(false)
  }, [])

  // Refresh profile from outside (e.g. after onboarding saves)
  const refreshProfile = useCallback(async () => {
    const { data: { session: s } } = await supabase.auth.getSession()
    if (s?.access_token) await loadProfile(s.access_token)
  }, [loadProfile])

  useEffect(() => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    if (!supabaseUrl) {
      setSession(null)
      setProfile(null)
      return
    }

    const timeout = setTimeout(() => { setSession(null); setProfile(null) }, 5000)

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout)
      setSession(session)
      setUser(session?.user ?? null)
      setRole(session?.user?.app_metadata?.role ?? null)
      loadProfile(session?.access_token ?? null)
    }).catch(() => {
      clearTimeout(timeout)
      setSession(null)
      setProfile(null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setRole(session?.user?.app_metadata?.role ?? null)
      loadProfile(session?.access_token ?? null)
    })

    return () => subscription.unsubscribe()
  }, [loadProfile])

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }

  const loading = session === undefined || (session !== null && profile === undefined)

  return (
    <AuthContext.Provider value={{
      session, user, role, loading, profileLoading,
      profile, refreshProfile,
      signIn, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
