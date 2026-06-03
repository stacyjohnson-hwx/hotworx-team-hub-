import { useState, useEffect, useCallback } from 'react'
import { useRole } from '@/hooks/useRole'
import { apiGet, apiPost, apiPut, apiPatch } from '@/hooks/useApi'
import {
  Users, Plus, Edit2, UserX, UserCheck, X, Eye, EyeOff,
  Mail, Phone, Calendar, Shield, RefreshCw, Copy, Check,
  Building2, ChevronDown, ClipboardList, GraduationCap,
} from 'lucide-react'

const ROLES = [
  { value: 'tsa',     label: 'TSA',     color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'manager', label: 'Manager', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { value: 'owner',   label: 'Owner',   color: 'bg-orange-100 text-orange-800 border-orange-300' },
]

function roleMeta(r) { return ROLES.find(x => x.value === r) || ROLES[0] }

function RoleBadge({ role }) {
  const m = roleMeta(role)
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${m.color}`}>{m.label}</span>
}

function Avatar({ user, size = 10 }) {
  const s = `w-${size} h-${size}`
  if (user.avatar_url) {
    return <img src={user.avatar_url} alt={user.name} className={`${s} rounded-full object-cover flex-shrink-0`} />
  }
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-purple-500', 'bg-blue-500', 'bg-teal-500']
  const idx = user.name?.charCodeAt(0) % colors.length || 0
  return (
    <div className={`${s} rounded-full ${colors[idx]} flex items-center justify-center flex-shrink-0`}>
      <span className="text-white font-bold text-sm">{(user.name?.[0] || '?').toUpperCase()}</span>
    </div>
  )
}

function fmtBirthday(str) {
  if (!str) return null
  const d = new Date(str + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const inputCls = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500'
const labelCls = 'block text-xs font-semibold text-gray-700 mb-1'

// ─── Add / Edit User Modal ─────────────────────────────────────────────────────
function UserModal({ user, currentRole, onSave, onClose }) {
  const isEdit = !!user
  const [form, setForm] = useState({
    email:      user?.email || '',
    full_name:  user?.name || '',
    role:       user?.role || 'tsa',
    phone:      user?.phone || '',
    birthday:   user?.birthday ? user.birthday.split('T')[0] : '',
  })
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [tempPwd, setTempPwd]       = useState(null)
  const [copied, setCopied]         = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const availableRoles = currentRole === 'owner'
    ? ROLES
    : ROLES.filter(r => r.value === 'tsa')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.full_name.trim()) { setError('Name is required'); return }
    if (!isEdit && !form.email.trim()) { setError('Email is required'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        full_name: form.full_name,
        role:      form.role,
        phone:     form.phone || null,
        birthday:  form.birthday || null,
        // Only send email when editing and it actually changed
        ...(isEdit && form.email && form.email !== user.email ? { email: form.email } : {}),
        ...(!isEdit ? { email: form.email } : {}),
      }
      const saved = isEdit
        ? await apiPut(`/api/users/${user.id}`, payload)
        : await apiPost('/api/users', payload)

      if (!isEdit && saved.temp_password) {
        setTempPwd(saved.temp_password)
      } else {
        onSave(saved)
      }
    } catch (err) { setError(err.message || 'Save failed') }
    finally { setSaving(false) }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(tempPwd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // After creating — show temp password screen
  if (tempPwd) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-xl w-full max-w-md shadow-2xl border border-gray-200">
          <div className="px-6 py-5 border-b border-gray-200 bg-gray-800 rounded-t-xl">
            <h2 className="text-white font-bold text-lg">User Created! 🎉</h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            <p className="text-gray-700 text-sm">
              <strong>{form.full_name}</strong> has been added. Share their temporary password below — they'll be prompted to change it on first login.
            </p>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Temporary Password</p>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                <code className="flex-1 text-gray-900 font-mono text-base tracking-widest">{tempPwd}</code>
                <button onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors">
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400">This password is shown only once. If they lose it, use "Reset Password" from the team page.</p>
          </div>
          <div className="flex justify-end px-6 py-4 border-t border-gray-200">
            <button onClick={() => onSave({})} className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg">Done</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form className="bg-white rounded-xl w-full max-w-lg shadow-2xl border border-gray-200"
        onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-800 rounded-t-xl">
          <h2 className="text-white font-bold text-lg">{isEdit ? 'Edit Team Member' : 'Add Team Member'}</h2>
          <button type="button" onClick={onClose} className="text-gray-300 hover:text-white"><X size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Full Name *</label>
              <input className={inputCls} value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Jane Smith" />
            </div>
            <div>
              <label className={labelCls}>Role</label>
              <select className={inputCls} value={form.role} onChange={e => set('role', e.target.value)}>
                {availableRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Email {isEdit ? '' : '*'}</label>
              <input type="email" className={inputCls} value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@example.com" />
              {isEdit && <p className="text-[11px] text-gray-400 mt-1">Changing this updates their login email address.</p>}
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input className={inputCls} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(262) 555-0100" />
            </div>
            <div>
              <label className={labelCls}>Birthday</label>
              <input type="date" className={inputCls} value={form.birthday} onChange={e => set('birthday', e.target.value)} />
            </div>
          </div>

          {!isEdit && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700">
              <strong>A temporary password will be generated.</strong> You'll be able to copy it and share with the new team member. They can change it after logging in.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Account'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Reset Password Modal ──────────────────────────────────────────────────────
function ResetPasswordModal({ user, onClose }) {
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [done,      setDone]      = useState(false)
  const [error,     setError]     = useState('')

  const handleSave = async (e) => {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true); setError('')
    try {
      await apiPost(`/api/users/${user.id}/set-password`, { password })
      setDone(true)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl border border-gray-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-800 rounded-t-xl">
          <h2 className="text-white font-bold">Set Password — {user.name}</h2>
          <button onClick={onClose} className="text-gray-300 hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {done ? (
            <div className="text-center py-4 space-y-3">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <Check size={22} className="text-green-600" />
              </div>
              <p className="font-semibold text-gray-900">Password updated!</p>
              <p className="text-sm text-gray-500">
                Share the new password with <strong>{user.name}</strong> in person or via text.<br />
                They can change it anytime from their Profile page.
              </p>
              <button onClick={onClose}
                className="w-full mt-2 bg-gray-800 text-white py-2 rounded-lg text-sm font-semibold">
                Done
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Set a temporary password for <strong>{user.name}</strong>. No email needed — just share it with them directly, then they can change it from their Profile.
              </p>
              {error && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
              <form onSubmit={handleSave} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">New Password</label>
                  <div className="relative">
                    <input type={showPw ? 'text' : 'password'} className={inputCls} value={password}
                      onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" autoFocus />
                    <button type="button" onClick={() => setShowPw(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
                      {showPw ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Confirm Password</label>
                  <input type={showPw ? 'text' : 'password'} className={`${inputCls} ${confirm && confirm !== password ? 'border-red-300' : ''}`}
                    value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" />
                  {confirm && confirm !== password && <p className="text-xs text-red-500 mt-1">Passwords don't match</p>}
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={onClose}
                    className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={loading || !password || !confirm}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50 transition-colors">
                    {loading ? 'Saving…' : 'Set Password'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Quiz Viewer Modal ─────────────────────────────────────────────────────────
const QUIZ_SECTIONS = [
  {
    emoji: '✨', title: 'Dreaming Bigger',
    fields: [
      { key: 'saving_for',        label: 'What are you saving up for?' },
      { key: 'motivation_types',  label: 'What motivates you?', array: true },
      { key: 'motivation_other',  label: 'Other motivation details' },
      { key: 'appreciation_style',label: 'How do you like to be appreciated?' },
    ],
  },
  {
    emoji: '🍓', title: 'Favorites',
    fields: [
      { key: 'fav_snack',      label: 'Favorite snack' },
      { key: 'fav_smoothie',   label: 'Favorite smoothie' },
      { key: 'fav_coffee',     label: 'Favorite coffee drink' },
      { key: 'fav_restaurant', label: 'Favorite restaurant' },
      { key: 'fav_shop',       label: 'Favorite place to shop' },
      { key: 'fav_gift_card',  label: 'Favorite gift card' },
    ],
  },
  {
    emoji: '🎉', title: 'Fun Stuff',
    fields: [
      { key: 'fav_color',  label: 'Favorite color' },
      { key: 'fav_music',  label: 'Favorite music' },
      { key: 'fav_relax',  label: 'How do you like to relax?' },
      { key: 'fun_fact',   label: 'Fun fact about you' },
    ],
  },
  {
    emoji: '🔥', title: 'Motivation Style',
    fields: [
      { key: 'motivation_styles',   label: 'Motivation styles', array: true },
      { key: 'contest_excitement',  label: 'What excites you most about contests?' },
      { key: 'personal_goal',       label: 'Personal goal this month' },
      { key: 'anything_else',       label: 'Anything else we should know?' },
    ],
  },
]

function QuizModal({ user, onClose }) {
  const q = user.quiz_answers || {}
  const hasAnswers = Object.keys(q).length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl border border-gray-200 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-800 rounded-t-xl flex-shrink-0">
          <div className="flex items-center gap-3">
            <Avatar user={user} size={8} />
            <div>
              <h2 className="text-white font-bold">{user.name}'s Motivation Quiz</h2>
              <p className="text-gray-400 text-xs">Read-only view</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-white"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-6 flex-1">
          {!hasAnswers ? (
            <div className="text-center py-10 text-gray-400">
              <ClipboardList size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">{user.name} hasn't completed the quiz yet.</p>
            </div>
          ) : (
            QUIZ_SECTIONS.map(section => {
              const sectionAnswers = section.fields.filter(f => q[f.key] && (Array.isArray(q[f.key]) ? q[f.key].length > 0 : true))
              if (sectionAnswers.length === 0) return null
              return (
                <div key={section.title}>
                  <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <span>{section.emoji}</span> {section.title}
                  </h3>
                  <div className="space-y-2">
                    {section.fields.map(f => {
                      const val = q[f.key]
                      if (!val || (Array.isArray(val) && val.length === 0)) return null
                      return (
                        <div key={f.key} className="bg-gray-50 rounded-lg px-3 py-2.5">
                          <p className="text-xs font-semibold text-gray-500 mb-0.5">{f.label}</p>
                          <p className="text-sm text-gray-900">
                            {f.array ? (Array.isArray(val) ? val.join(', ') : val) : val}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <button onClick={onClose} className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg transition-colors">Close</button>
        </div>
      </div>
    </div>
  )
}

// ─── User Card ─────────────────────────────────────────────────────────────────
function UserCard({ user, currentUserId, currentRole, onEdit, onToggleActive, onResetPassword, onViewQuiz, trainingCompleted, trainingTotal }) {
  const [confirm, setConfirm] = useState(false)
  const isSelf = user.id === currentUserId
  const canDeactivate = !isSelf && (currentRole === 'owner' || (currentRole === 'manager' && user.role === 'tsa'))

  return (
    <div className={`bg-white border rounded-xl overflow-hidden shadow-sm transition-all ${!user.is_active ? 'opacity-60 border-gray-200' : 'border-gray-200 hover:shadow-md'}`}>
      <div className="h-1 bg-orange-500" />
      <div className="p-4">
        <div className="flex items-start gap-3">
          <Avatar user={user} size={12} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-gray-900 font-bold text-sm">{user.name}</h3>
              {isSelf && <span className="text-xs text-gray-400 italic">(you)</span>}
              {!user.is_active && <span className="text-xs bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded-full font-semibold">Inactive</span>}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <RoleBadge role={user.role} />
              {user.onboarding_completed_at && (
                <span className="text-xs text-teal-600 font-medium">✓ Onboarded</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <a href={`mailto:${user.email}`} className="flex items-center gap-2 text-xs text-gray-500 hover:text-orange-500 transition-colors">
            <Mail size={11} className="flex-shrink-0" /> {user.email}
          </a>
          {user.phone && (
            <a href={`tel:${user.phone}`} className="flex items-center gap-2 text-xs text-gray-500 hover:text-orange-500 transition-colors">
              <Phone size={11} className="flex-shrink-0" /> {user.phone}
            </a>
          )}
          {user.birthday && (
            <p className="flex items-center gap-2 text-xs text-gray-500">
              <Calendar size={11} className="flex-shrink-0" /> {fmtBirthday(user.birthday)}
            </p>
          )}
        </div>

        {/* Training progress */}
        {trainingTotal > 0 && (
          <div className="mt-3 bg-gray-50 rounded-xl px-3 py-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <GraduationCap size={12} className="text-indigo-500" />
                <span className="text-xs font-semibold text-gray-600">Training</span>
              </div>
              <span className="text-xs font-bold text-gray-800">
                {trainingCompleted} <span className="text-gray-400 font-normal">/ {trainingTotal}</span>
              </span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${Math.round((trainingCompleted / trainingTotal) * 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              {trainingTotal - trainingCompleted === 0
                ? '🎉 All complete!'
                : `${trainingTotal - trainingCompleted} remaining`}
            </p>
          </div>
        )}

        <div className="flex items-center gap-1.5 mt-4 flex-wrap">
          <button onClick={() => onEdit(user)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-50 border border-gray-200 hover:border-orange-300 hover:text-orange-600 text-gray-600 rounded-lg transition-colors">
            <Edit2 size={11} /> Edit
          </button>
          {(user.role === 'tsa' || user.role === 'manager') && (
            <button onClick={() => onViewQuiz(user)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-50 border border-gray-200 hover:border-purple-300 hover:text-purple-600 text-gray-600 rounded-lg transition-colors">
              <ClipboardList size={11} /> {user.quiz_answers && Object.keys(user.quiz_answers).length > 0 ? 'View Quiz' : 'No Quiz Yet'}
            </button>
          )}
          <button onClick={() => onResetPassword(user)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-50 border border-gray-200 hover:border-blue-300 hover:text-blue-600 text-gray-600 rounded-lg transition-colors">
            <RefreshCw size={11} /> Reset PW
          </button>
          {canDeactivate && !confirm && (
            <button onClick={() => setConfirm(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-lg transition-colors ${
                user.is_active
                  ? 'bg-gray-50 border-gray-200 hover:border-red-300 hover:text-red-600 text-gray-600'
                  : 'bg-teal-50 border-teal-200 hover:bg-teal-100 text-teal-700'
              }`}>
              {user.is_active ? <><UserX size={11} /> Deactivate</> : <><UserCheck size={11} /> Reactivate</>}
            </button>
          )}
          {confirm && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">Sure?</span>
              <button onClick={() => { onToggleActive(user); setConfirm(false) }}
                className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded font-semibold">Yes</button>
              <button onClick={() => setConfirm(false)}
                className="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs font-medium">No</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const { role, user: currentUser } = useRole()
  const [users, setUsers]                   = useState([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState('')
  const [showModal, setShowModal]           = useState(false)
  const [editUser, setEditUser]             = useState(null)
  const [resetUser, setResetUser]           = useState(null)
  const [quizUser, setQuizUser]             = useState(null)
  const [filter, setFilter]                 = useState('active')
  const [trainingStats, setTrainingStats]   = useState({ totalResources: 0, countsByUser: {} })

  const load = useCallback(async () => {
    try {
      const [data, stats] = await Promise.all([
        apiGet('/api/users'),
        apiGet('/api/training/stats').catch(() => ({ totalResources: 0, countsByUser: {} })),
      ])
      setUsers(data)
      setTrainingStats(stats)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = () => { load(); setShowModal(false); setEditUser(null) }

  const handleToggleActive = async (user) => {
    try {
      if (user.is_active) {
        await apiPatch(`/api/users/${user.id}/deactivate`, {})
      } else {
        await apiPatch(`/api/users/${user.id}/reactivate`, {})
      }
      load()
    } catch (err) { setError(err.message) }
  }

  const displayed = users.filter(u => {
    if (filter === 'active')   return u.is_active
    if (filter === 'inactive') return !u.is_active
    return true
  })

  const roleGroups = [
    { label: 'Owner',   items: displayed.filter(u => u.role === 'owner')   },
    { label: 'Manager', items: displayed.filter(u => u.role === 'manager') },
    { label: 'TSA',     items: displayed.filter(u => u.role === 'tsa')     },
  ].filter(g => g.items.length > 0)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <Users size={24} className="text-orange-500" /> Team
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            <span className="font-semibold text-gray-900">{users.filter(u => u.is_active).length}</span> active members
          </p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg shadow-sm transition-colors">
          <Plus size={16} /> Add Team Member
        </button>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-300 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {[{ key: 'active', label: 'Active' }, { key: 'inactive', label: 'Inactive' }, { key: 'all', label: 'All' }].map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              filter === t.key ? 'border-orange-500 text-orange-500' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-8">
        {roleGroups.map(group => (
          <div key={group.label}>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{group.label}s</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map(u => (
                <UserCard
                  key={u.id}
                  user={u}
                  currentUserId={currentUser?.id}
                  currentRole={role}
                  onEdit={setEditUser}
                  onToggleActive={handleToggleActive}
                  onResetPassword={setResetUser}
                  onViewQuiz={setQuizUser}
                  trainingCompleted={trainingStats.countsByUser[u.id] || 0}
                  trainingTotal={trainingStats.totalResources}
                />
              ))}
            </div>
          </div>
        ))}
        {displayed.length === 0 && (
          <div className="text-center py-16 text-gray-400">No team members found.</div>
        )}
      </div>

      {showModal && (
        <UserModal currentRole={role} onSave={handleSave} onClose={() => setShowModal(false)} />
      )}
      {editUser && (
        <UserModal user={editUser} currentRole={role} onSave={handleSave} onClose={() => setEditUser(null)} />
      )}
      {quizUser && (
        <QuizModal user={quizUser} onClose={() => setQuizUser(null)} />
      )}
      {resetUser && (
        <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />
      )}
    </div>
  )
}
