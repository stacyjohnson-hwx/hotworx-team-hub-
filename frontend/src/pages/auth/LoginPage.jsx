import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate   = useNavigate()

  // ── Login state ──────────────────────────────────────────────────────────────
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  // ── Forgot-password state ─────────────────────────────────────────────────
  const [showReset,   setShowReset]   = useState(false)
  const [resetEmail,  setResetEmail]  = useState('')
  const [resetSent,   setResetSent]   = useState(false)
  const [resetError,  setResetError]  = useState('')
  const [resetLoading,setResetLoading]= useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) setError('Invalid email or password. Please try again.')
    else navigate('/dashboard')
  }

  const handleReset = async (e) => {
    e.preventDefault()
    if (!resetEmail.trim()) { setResetError('Please enter your email address.'); return }
    setResetLoading(true); setResetError('')
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setResetLoading(false)
    if (error) setResetError(error.message)
    else setResetSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm px-6">

        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-600 mb-4">
            <span className="text-white text-2xl font-bold">H</span>
          </div>
          <h1 className="text-white text-2xl font-bold tracking-tight">HOTWORX Pewaukee</h1>
          <p className="text-gray-400 text-sm mt-1">Team Hub</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">

          {!showReset ? (
            /* ── Sign-in form ── */
            <>
              <h2 className="text-gray-900 text-xl font-semibold mb-6">Sign in</h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    id="email" type="email" autoComplete="email" required
                    value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => { setShowReset(true); setResetEmail(email); setResetError(''); setResetSent(false) }}
                      className="text-xs text-red-600 hover:text-red-700 font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    id="password" type="password" autoComplete="current-password" required
                    value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
                    placeholder="••••••••"
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit" disabled={loading}
                  className="w-full bg-red-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            </>
          ) : (
            /* ── Forgot-password form ── */
            <>
              <button
                type="button"
                onClick={() => setShowReset(false)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-4 transition-colors"
              >
                ← Back to sign in
              </button>

              <h2 className="text-gray-900 text-xl font-semibold mb-2">Reset password</h2>
              <p className="text-gray-500 text-sm mb-6">
                Enter your email and we'll send you a link to set a new password.
              </p>

              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <p className="text-sm font-semibold text-amber-800 mb-1">Can't remember your password?</p>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Ask <strong>Stacy</strong> or <strong>Bailey</strong> to set a new password for you from the Team page. You'll get a temporary password to use, then change it in your Profile.
                  </p>
                </div>
                <button
                  onClick={() => setShowReset(false)}
                  className="w-full border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Back to sign in
                </button>
              </div>
            </>
          )}

          <p className="text-xs text-gray-400 text-center mt-6">
            Account issues? Contact your studio manager.
          </p>
        </div>
      </div>
    </div>
  )
}
