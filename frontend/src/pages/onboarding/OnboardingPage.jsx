import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { apiPut } from '@/hooks/useApi'
import { supabase } from '@/lib/supabase'
import { Camera, ArrowRight, ArrowLeft, Check, Loader2, SkipForward } from 'lucide-react'
import { MotivationQuiz } from '@/components/MotivationQuiz'

const inputCls = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500'
const labelCls = 'block text-sm font-semibold text-gray-700 mb-1.5'

function StepDot({ num, current, total }) {
  const done = num < current
  const active = num === current
  return (
    <div className="flex items-center gap-2">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
        done   ? 'bg-orange-500 border-orange-500 text-white' :
        active ? 'bg-white border-orange-500 text-orange-500' :
                 'bg-white border-gray-300 text-gray-400'
      }`}>
        {done ? <Check size={14} /> : num}
      </div>
      {num < total && (
        <div className={`w-12 h-0.5 rounded ${done ? 'bg-orange-500' : 'bg-gray-200'}`} />
      )}
    </div>
  )
}

// ─── Step 1: Photo + Basic Info ────────────────────────────────────────────────
function StepProfile({ onNext, onSkip }) {
  const { profile, refreshProfile } = useAuth()
  const { user: authUser } = useRole()
  const fileRef = useRef(null)

  const [form, setForm]       = useState({
    full_name: profile?.name || '',
    phone:     profile?.phone || '',
    birthday:  profile?.birthday ? profile.birthday.split('T')[0] : '',
  })
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !authUser) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return
    setUploading(true)
    try {
      const path = `${authUser.id}/avatar.${ext}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) return
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = `${publicUrl}?t=${Date.now()}`
      setAvatarUrl(url)
      await supabase.auth.updateUser({ data: { avatar_url: url } })
      await apiPut('/api/users/me', { avatar_url: url })
    } finally { setUploading(false); e.target.value = '' }
  }

  const handleNext = async () => {
    setSaving(true); setError('')
    try {
      await apiPut('/api/users/me', {
        full_name: form.full_name || null,
        phone:     form.phone || null,
        birthday:  form.birthday || null,
      })
      await refreshProfile()
      onNext()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-gray-500 text-sm">First, let's get your profile set up.</p>
      </div>

      {/* Avatar upload */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          {uploading ? (
            <div className="w-24 h-24 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center">
              <Loader2 size={24} className="text-orange-500 animate-spin" />
            </div>
          ) : avatarUrl ? (
            <img src={avatarUrl} alt="You" className="w-24 h-24 rounded-full object-cover border-2 border-orange-200" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center">
              <Camera size={28} className="text-gray-400" />
            </div>
          )}
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="absolute bottom-0 right-0 w-8 h-8 bg-orange-500 hover:bg-orange-600 rounded-full flex items-center justify-center shadow transition-colors">
            <Camera size={14} className="text-white" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>
        <p className="text-xs text-gray-400">Upload a photo of yourself (optional but encouraged!)</p>
      </div>

      {/* Basic info */}
      <div className="space-y-4">
        {error && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className={labelCls}>Your Name</label>
          <input className={inputCls} value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="First and last name" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Phone</label>
            <input className={inputCls} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(262) 555-0100" />
          </div>
          <div>
            <label className={labelCls}>Birthday</label>
            <input type="date" className={inputCls} value={form.birthday} onChange={e => set('birthday', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button type="button" onClick={onSkip}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
          <SkipForward size={14} /> Skip for now
        </button>
        <button onClick={handleNext} disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          {saving ? 'Saving…' : 'Continue'} <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── Step 2: Motivation Quiz ───────────────────────────────────────────────────
function StepQuiz({ onBack, onComplete, profile }) {
  const { refreshProfile } = useAuth()

  const handleSave = async (answers) => {
    await apiPut('/api/users/me/quiz', { quiz_answers: answers, complete_onboarding: true })
    await refreshProfile()
    onComplete()
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-gray-500 text-sm">
          Help us support, motivate, and reward you in ways that actually matter. 😊
        </p>
        <p className="text-xs text-gray-400 mt-1">Takes about 5 minutes — skip any questions you're not ready to answer.</p>
      </div>

      <MotivationQuiz
        initialAnswers={profile?.quiz_answers || {}}
        initialBirthday={profile?.birthday ? profile.birthday.split('T')[0] : ''}
        onSave={handleSave}
      />

      <div className="flex justify-start pt-2">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={14} /> Back
        </button>
      </div>
    </div>
  )
}

// ─── Main Onboarding Page ──────────────────────────────────────────────────────
export default function OnboardingPage() {
  const { profile, refreshProfile } = useAuth()
  const { role } = useRole()
  const navigate  = useNavigate()
  const totalSteps = (role === 'tsa' || role === 'manager') ? 2 : 1
  const [step, setStep] = useState(1)

  const handleSkip = async () => {
    // Mark onboarding complete even if skipped
    try {
      await apiPut('/api/users/me/quiz', { quiz_answers: profile?.quiz_answers || {}, complete_onboarding: true })
      await refreshProfile()
    } catch {}
    navigate('/dashboard', { replace: true })
  }

  const handleStep1Next = () => {
    if (totalSteps === 1) {
      // Owner — done after step 1
      handleSkip()
    } else {
      setStep(2)
    }
  }

  const handleComplete = () => {
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-600 mb-4 shadow-lg">
            <span className="text-white text-2xl font-bold">H</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome to HOTWORX Pewaukee! 🔥</h1>
          <p className="text-gray-500 mt-1 text-sm">Let's get your profile set up before you dive in.</p>
        </div>

        {/* Step indicator */}
        {totalSteps > 1 && (
          <div className="flex justify-center mb-8">
            <div className="flex items-center gap-0">
              {Array.from({ length: totalSteps }, (_, i) => (
                <StepDot key={i + 1} num={i + 1} current={step} total={totalSteps} />
              ))}
            </div>
          </div>
        )}

        {/* Step labels */}
        {totalSteps > 1 && (
          <div className="flex justify-around mb-6 text-xs text-gray-500 font-medium">
            <span className={step === 1 ? 'text-orange-500 font-bold' : ''}>Profile Setup</span>
            <span className={step === 2 ? 'text-orange-500 font-bold' : ''}>Motivation Quiz</span>
          </div>
        )}

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 md:p-8">
          {step === 1 && (
            <>
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                {totalSteps === 1 ? 'Set Up Your Profile 👋' : 'Step 1 — Your Profile 👋'}
              </h2>
              <StepProfile onNext={handleStep1Next} onSkip={handleSkip} />
            </>
          )}
          {step === 2 && (
            <>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Step 2 — Motivation Quiz 💥</h2>
              <p className="text-xs text-gray-400 mb-4">This helps your manager support you better!</p>
              <StepQuiz onBack={() => setStep(1)} onComplete={handleComplete} profile={profile} />
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          You can update any of this later from <strong>My Profile</strong> in the navigation.
        </p>
      </div>
    </div>
  )
}
