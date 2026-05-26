import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Eye, EyeOff, CheckCircle, Zap } from 'lucide-react'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [ready,     setReady]     = useState(false)  // Supabase fired PASSWORD_RECOVERY
  const [saving,    setSaving]    = useState(false)
  const [done,      setDone]      = useState(false)
  const [error,     setError]     = useState('')

  // Supabase fires PASSWORD_RECOVERY when the recovery token in the URL is valid.
  // We must wait for this event before allowing the password update.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm)  { setError('Passwords do not match.'); return }

    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSaving(false)

    if (updateError) {
      setError(updateError.message)
    } else {
      setDone(true)
      // Sign out so they log in fresh with the new password
      await supabase.auth.signOut()
      setTimeout(() => navigate('/login'), 3000)
    }
  }

  const strength = password.length === 0 ? null
    : password.length < 8  ? 'weak'
    : password.length < 12 ? 'ok'
    : 'strong'

  const strengthColor = { weak: 'bg-red-400', ok: 'bg-yellow-400', strong: 'bg-green-500' }
  const strengthLabel = { weak: 'Too short', ok: 'Good', strong: 'Strong' }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <Zap size={18} className="text-[#E8611A]" fill="#E8611A" />
          <span className="text-white font-bold text-lg tracking-tight">HOTWORX Pewaukee</span>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-[#1A1A1A] px-6 py-5">
            <h1 className="text-white font-bold text-xl">Set New Password</h1>
            <p className="text-white/50 text-sm mt-1">Choose a strong password for your account.</p>
          </div>

          <div className="px-6 py-6">
            {done ? (
              <div className="text-center py-4 space-y-3">
                <CheckCircle size={44} className="text-green-500 mx-auto" />
                <p className="font-bold text-gray-900">Password updated!</p>
                <p className="text-sm text-gray-500">You've been signed out. Redirecting to login…</p>
              </div>
            ) : !ready ? (
              <div className="text-center py-6 space-y-3">
                <div className="w-8 h-8 border-2 border-[#E8611A] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-gray-500">Verifying your reset link…</p>
                <p className="text-xs text-gray-400">If this takes more than a few seconds, the link may have expired. Request a new one from the Team page.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">New Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      autoFocus
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]"
                    />
                    <button type="button" onClick={() => setShowPw(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {strength && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${strengthColor[strength]} ${
                          strength === 'weak' ? 'w-1/3' : strength === 'ok' ? 'w-2/3' : 'w-full'
                        }`} />
                      </div>
                      <span className={`text-[11px] font-semibold ${
                        strength === 'weak' ? 'text-red-500' : strength === 'ok' ? 'text-yellow-600' : 'text-green-600'
                      }`}>{strengthLabel[strength]}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Confirm Password</label>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat your new password"
                    className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A] ${
                      confirm && confirm !== password ? 'border-red-300' : 'border-gray-300'
                    }`}
                  />
                  {confirm && confirm !== password && (
                    <p className="text-[11px] text-red-500 mt-1">Passwords don't match yet</p>
                  )}
                </div>

                <button type="submit" disabled={saving || !password || !confirm}
                  className="w-full py-3 bg-[#E8611A] hover:bg-orange-600 text-white font-bold rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {saving ? 'Updating…' : 'Set New Password'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
