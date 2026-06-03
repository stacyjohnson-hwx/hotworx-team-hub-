import { useState, useRef, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { apiPut, apiPost } from '@/hooks/useApi'
import { supabase } from '@/lib/supabase'
import { Camera, Save, Check, Loader2, User, Phone, Mail, Calendar, ChevronDown, ChevronUp, KeyRound } from 'lucide-react'
import { MotivationQuiz } from '@/components/MotivationQuiz'

const inputCls = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500'
const labelCls = 'block text-xs font-semibold text-gray-700 mb-1'

function Avatar({ user, size = 24 }) {
  const s = `w-${size} h-${size}`
  if (user.avatar_url) {
    return <img src={user.avatar_url} alt={user.name} className={`${s} rounded-full object-cover`} />
  }
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-purple-500', 'bg-blue-500', 'bg-teal-500']
  const idx = user.name?.charCodeAt(0) % colors.length || 0
  return (
    <div className={`${s} rounded-full ${colors[idx]} flex items-center justify-center`}>
      <span className="text-white font-bold text-3xl">{(user.name?.[0] || '?').toUpperCase()}</span>
    </div>
  )
}

function RoleBadge({ role }) {
  const map = { owner: 'bg-orange-100 text-orange-800 border-orange-300', manager: 'bg-purple-100 text-purple-800 border-purple-300', tsa: 'bg-blue-100 text-blue-800 border-blue-300' }
  const labels = { owner: 'Owner', manager: 'Manager', tsa: 'TSA' }
  return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${map[role] || map.tsa}`}>{labels[role] || role}</span>
}

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth()
  const { role, user: authUser } = useRole()

  const [info, setInfo]               = useState({
    full_name: profile?.name || '',
    phone:     profile?.phone || '',
    birthday:  profile?.birthday ? profile.birthday.split('T')[0] : '',
  })
  const [infoSaved, setInfoSaved]     = useState(false)
  const [infoSaving, setInfoSaving]   = useState(false)
  const [infoError, setInfoError]     = useState('')

  const [quizOpen, setQuizOpen]       = useState(false)
  const [avatarUrl, setAvatarUrl]     = useState(profile?.avatar_url || null)
  const [uploading, setUploading]     = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const fileRef                       = useRef(null)

  const setI = (k, v) => setInfo(f => ({ ...f, [k]: v }))

  const handleSaveInfo = async () => {
    setInfoSaving(true); setInfoError('')
    try {
      await apiPut('/api/users/me', {
        full_name: info.full_name || null,
        phone:     info.phone || null,
        birthday:  info.birthday || null,
      })
      await refreshProfile()
      setInfoSaved(true)
      setTimeout(() => setInfoSaved(false), 2500)
    } catch (err) { setInfoError(err.message) }
    finally { setInfoSaving(false) }
  }

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !authUser) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      setAvatarError('Please upload a JPG, PNG, or WebP image.')
      return
    }

    setUploading(true)
    setAvatarError('')
    try {
      const path = `${authUser.id}/avatar.${ext}`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw new Error(upErr.message)

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = `${publicUrl}?t=${Date.now()}`
      setAvatarUrl(url)

      // Sync to profile table + user_metadata
      await supabase.auth.updateUser({ data: { avatar_url: url } })
      await apiPut('/api/users/me', { avatar_url: url })
      await refreshProfile()
    } catch (err) {
      setAvatarError(err.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleQuizSave = useCallback(async (answers) => {
    await apiPut('/api/users/me/quiz', { quiz_answers: answers, complete_onboarding: true })
    await refreshProfile()
  }, [refreshProfile])

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
        <User size={24} className="text-orange-500" /> My Profile
      </h1>

      {/* Avatar card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 flex items-center gap-6">
        <div className="relative flex-shrink-0">
          {uploading ? (
            <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center">
              <Loader2 size={24} className="text-orange-500 animate-spin" />
            </div>
          ) : (
            <Avatar user={{ ...profile, avatar_url: avatarUrl }} size={24} />
          )}
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="absolute bottom-0 right-0 w-8 h-8 bg-orange-500 hover:bg-orange-600 rounded-full flex items-center justify-center shadow-md transition-colors disabled:opacity-50">
            <Camera size={14} className="text-white" />
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarChange} />
        </div>
        <div>
          <p className="text-xl font-bold text-gray-900">{profile?.name || 'Your Name'}</p>
          <p className="text-gray-500 text-sm mt-0.5">{profile?.email}</p>
          <div className="flex items-center gap-2 mt-2">
            <RoleBadge role={role} />
            {profile?.onboarding_completed_at && (
              <span className="text-xs text-teal-600 font-medium">✓ Onboarding complete</span>
            )}
          </div>
          {avatarError
            ? <p className="text-xs text-red-500 mt-2">{avatarError}</p>
            : <p className="text-xs text-gray-400 mt-2">Click the camera to update your photo</p>
          }
        </div>
      </div>

      {/* Basic info */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-sm font-bold text-gray-700">My Info</h2>
        </div>
        <div className="px-5 py-5 space-y-4">
          {infoError && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-lg px-3 py-2">{infoError}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Display Name</label>
              <input className={inputCls} value={info.full_name} onChange={e => setI('full_name', e.target.value)} placeholder="Your name" />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500">
                <Mail size={13} className="text-gray-400" />{profile?.email}
              </div>
              <p className="text-xs text-gray-400 mt-1">Contact owner to change your email</p>
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input className={inputCls} value={info.phone} onChange={e => setI('phone', e.target.value)} placeholder="(262) 555-0100" />
            </div>
            <div>
              <label className={labelCls}>Birthday</label>
              <input type="date" className={inputCls} value={info.birthday} onChange={e => setI('birthday', e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Also updatable in your quiz below</p>
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={handleSaveInfo} disabled={infoSaving}
              className="flex items-center gap-2 px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50">
              {infoSaving ? <Loader2 size={14} className="animate-spin" /> : infoSaved ? <Check size={14} /> : <Save size={14} />}
              {infoSaving ? 'Saving…' : infoSaved ? 'Saved!' : 'Save Info'}
            </button>
          </div>
        </div>
      </div>

      {/* Motivation Quiz — TSA + Manager */}
      {(role === 'tsa' || role === 'manager') && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setQuizOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
            <div>
              <h2 className="text-sm font-bold text-gray-700">My Motivation Quiz 💥</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {profile?.onboarding_completed_at ? 'Update your answers anytime' : 'Not yet completed — take a few minutes to fill this out!'}
              </p>
            </div>
            {quizOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </button>
          {quizOpen && (
            <div className="px-5 py-5">
              <MotivationQuiz
                initialAnswers={profile?.quiz_answers || {}}
                initialBirthday={info.birthday}
                onSave={handleQuizSave}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Change Password ─────────────────────────────────────────────────── */}
      <ChangePasswordSection />
    </div>
  )
}

function ChangePasswordSection() {
  const [open,       setOpen]       = useState(false)
  const [pw,         setPw]         = useState('')
  const [confirm,    setConfirm]    = useState('')
  const [showPw,     setShowPw]     = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [done,       setDone]       = useState(false)
  const [error,      setError]      = useState('')

  const handleSave = async (e) => {
    e.preventDefault()
    if (pw.length < 8)    { setError('Password must be at least 8 characters.'); return }
    if (pw !== confirm)   { setError('Passwords do not match.'); return }
    setSaving(true); setError('')
    try {
      await apiPost('/api/users/me/change-password', { password: pw })
      setDone(true)
      setPw(''); setConfirm('')
      setTimeout(() => { setDone(false); setOpen(false) }, 2500)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => { setOpen(o => !o); setError(''); setDone(false) }}
        className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <KeyRound size={15} className="text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Change Password</span>
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      {open && (
        <form onSubmit={handleSave} className="px-5 py-5 space-y-4">
          {done && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-3 py-2">
              <Check size={14} /> Password updated!
            </div>
          )}
          {error && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">New Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={pw} onChange={e => setPw(e.target.value)}
                placeholder="At least 8 characters"
                className={inputCls}
              />
              <button type="button" onClick={() => setShowPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600">
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Confirm Password</label>
            <input
              type={showPw ? 'text' : 'password'}
              value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat new password"
              className={`${inputCls} ${confirm && confirm !== pw ? 'border-red-300' : ''}`}
            />
            {confirm && confirm !== pw && <p className="text-xs text-red-500 mt-1">Passwords don't match</p>}
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={saving || !pw || !confirm}
              className="flex items-center gap-2 px-5 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? 'Saving…' : 'Update Password'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
