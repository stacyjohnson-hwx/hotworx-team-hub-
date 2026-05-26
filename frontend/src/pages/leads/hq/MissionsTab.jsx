import { useState, useEffect, useCallback, useRef } from 'react'
import { CheckCircle2, Circle, Zap, Clock, RotateCcw, ChevronDown, ChevronUp,
         Flame, Star, Trophy, X, Plus, Pencil, Trash2, Settings, Eye, EyeOff, GripVertical } from 'lucide-react'
import { STANDING_MISSIONS, GROWTH_PLAYS, WEEKLY_CHALLENGE, AI_RECOMMENDATIONS, getRank, RANKS } from '../data/mockData'
import { useAuth } from '@/contexts/AuthContext'
import RatingModal from '@/components/RatingModal'
import ThumbsWidget, { useFeedbackSignals } from '@/components/ThumbsWidget'

// ─── localStorage helpers ─────────────────────────────────────────────────────
const MISSIONS_KEY        = 'leadgenhq_missions'
const CUSTOM_MISSIONS_KEY = 'leadgenhq_custom_missions'
const HIDDEN_MISSIONS_KEY = 'leadgenhq_hidden_missions'
const OVERRIDES_KEY       = 'leadgenhq_mission_overrides'
const CHALLENGE_KEY       = 'leadgenhq_weekly_challenge'
const AI_RECS_KEY         = 'leadgenhq_ai_recs'
const PLAYS_KEY           = 'leadgenhq_plays'

function loadMissionsState()    { try { return JSON.parse(localStorage.getItem(MISSIONS_KEY) || '{}') } catch { return {} } }
function saveMissionsState(s)   { try { localStorage.setItem(MISSIONS_KEY, JSON.stringify(s)) } catch {} }
function loadCustomMissions()   { try { return JSON.parse(localStorage.getItem(CUSTOM_MISSIONS_KEY) || '[]') } catch { return [] } }
function saveCustomMissions(a)  { try { localStorage.setItem(CUSTOM_MISSIONS_KEY, JSON.stringify(a)) } catch {} }
function loadHiddenMissions()   { try { return JSON.parse(localStorage.getItem(HIDDEN_MISSIONS_KEY) || '[]') } catch { return [] } }
function saveHiddenMissions(a)  { try { localStorage.setItem(HIDDEN_MISSIONS_KEY, JSON.stringify(a)) } catch {} }
function loadOverrides()        { try { return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}') } catch { return {} } }
function saveOverrides(o)       { try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(o)) } catch {} }
const ORDER_KEY = 'leadgenhq_mission_order'
function loadOrder()            { try { return JSON.parse(localStorage.getItem(ORDER_KEY) || '[]') } catch { return [] } }
function saveOrder(o)           { try { localStorage.setItem(ORDER_KEY, JSON.stringify(o)) } catch {} }
function loadChallenge()       { try { return JSON.parse(localStorage.getItem(CHALLENGE_KEY)) || WEEKLY_CHALLENGE } catch { return WEEKLY_CHALLENGE } }
function saveChallenge(c)      { try { localStorage.setItem(CHALLENGE_KEY, JSON.stringify(c)) } catch {} }
function loadAiRecs()          { try { const s = JSON.parse(localStorage.getItem(AI_RECS_KEY)); return s ?? AI_RECOMMENDATIONS } catch { return AI_RECOMMENDATIONS } }
function saveAiRecs(r)         { try { localStorage.setItem(AI_RECS_KEY, JSON.stringify(r)) } catch {} }
function loadStoredPlays()     { try { const s = JSON.parse(localStorage.getItem(PLAYS_KEY)); return (s && s.length) ? s : GROWTH_PLAYS } catch { return GROWTH_PLAYS } }

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES   = ['All', 'Social', 'Referrals', 'B2B', 'Community']
const CAT_OPTIONS  = ['Social', 'Referrals', 'B2B', 'Community']
const DIFF_OPTIONS = ['Quick Win', 'Medium', 'Big Lift']
const PROOF_OPTIONS  = ['none', 'note']
const REC_TYPE_OPTIONS = [
  { value: 'bg-purple-100 text-purple-700', label: 'Social Media' },
  { value: 'bg-blue-100 text-blue-700',     label: 'Referral' },
  { value: 'bg-teal-100 text-teal-700',     label: 'B2B' },
  { value: 'bg-orange-100 text-orange-700', label: 'Community' },
  { value: 'bg-green-100 text-green-700',   label: 'Quick Win' },
]

const DIFFICULTY_COLORS = {
  'Quick Win': 'bg-green-100 text-green-700',
  'Medium':    'bg-yellow-100 text-yellow-700',
  'Big Lift':  'bg-red-100 text-red-700',
}

function timeUntil(isoStr) {
  if (!isoStr) return null
  const diff = new Date(isoStr) - Date.now()
  if (diff <= 0) return 'Expired'
  const days = Math.floor(diff / 86400000)
  if (days > 0) return `${days}d left`
  const hours = Math.floor(diff / 3600000)
  return `${hours}h left`
}

function newId() { return 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) }

const BLANK_FORM = {
  title: '', category: 'Social', difficulty: 'Quick Win', points: 15,
  estimatedTime: '20 min', description: '', proofRequired: 'note', repeatable: true,
}

// ─── Edit Top Items Modal (Weekly Challenge + AI Recs) ───────────────────────
function EditTopItemsModal({ challenge, aiRecs, onSaveChallenge, onSaveAiRecs, onClose }) {
  const [tab, setTab]   = useState('challenge')  // 'challenge' | 'recs'
  const [ch, setCh]     = useState({ ...challenge })
  const [recs, setRecs] = useState(aiRecs.map(r => ({ ...r })))
  const [newRec, setNewRec] = useState({ headline: '', reason: '', type: 'Quick Win', typeColor: 'bg-green-100 text-green-700' })

  function setChField(k, v) { setCh(f => ({ ...f, [k]: v })) }
  function updateRec(id, k, v) { setRecs(prev => prev.map(r => r.id === id ? { ...r, [k]: v } : r)) }
  function removeRec(id) { setRecs(prev => prev.filter(r => r.id !== id)) }
  function addRec() {
    if (!newRec.headline.trim()) return
    const selected = REC_TYPE_OPTIONS.find(o => o.label === newRec.type) || REC_TYPE_OPTIONS[4]
    setRecs(prev => [...prev, {
      id: 'rec-' + Date.now(),
      headline: newRec.headline.trim(),
      reason: newRec.reason.trim(),
      type: newRec.type,
      typeColor: selected.value,
    }])
    setNewRec({ headline: '', reason: '', type: 'Quick Win', typeColor: 'bg-green-100 text-green-700' })
  }

  function handleSave() {
    onSaveChallenge(ch)
    onSaveAiRecs(recs)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-[#1A1A1A] px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-[#E8611A] text-xs font-bold uppercase tracking-wider mb-0.5">Growth HQ</p>
            <p className="text-white font-bold text-base">Edit Top Items</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors"><X size={20} /></button>
        </div>

        {/* Sub-tabs */}
        <div className="flex border-b border-gray-200 flex-shrink-0">
          {[['challenge', '🏆 Weekly Challenge'], ['recs', '⭐ AI Recommendations']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                tab === key ? 'border-b-2 border-[#E8611A] text-[#E8611A]' : 'text-gray-500 hover:text-gray-700'
              }`}>{label}</button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-5">

          {/* ── Weekly Challenge editor ── */}
          {tab === 'challenge' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">This banner appears at the top of the Missions tab for all TSAs.</p>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Challenge title *</label>
                <input value={ch.title} onChange={e => setChField('title', e.target.value)}
                  placeholder="e.g. Neighborhood Blitz Week"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
                <textarea rows={2} value={ch.description} onChange={e => setChField('description', e.target.value)}
                  placeholder="Short description of the challenge goal"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Target count</label>
                  <input type="number" min={1} value={ch.targetCount} onChange={e => setChField('targetCount', parseInt(e.target.value) || 1)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Bonus points</label>
                  <input type="number" min={0} value={ch.bonusPoints} onChange={e => setChField('bonusPoints', parseInt(e.target.value) || 0)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Current count</label>
                  <input type="number" min={0} value={ch.currentCount} onChange={e => setChField('currentCount', parseInt(e.target.value) || 0)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">End date</label>
                  <input type="date" value={ch.endsAt?.slice(0, 10) || ''} onChange={e => setChField('endsAt', e.target.value + 'T23:59:59Z')}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
                </div>
              </div>
            </div>
          )}

          {/* ── AI Recs editor ── */}
          {tab === 'recs' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">These tip cards appear below the Weekly Challenge. TSAs can dismiss them.</p>

              {/* Existing recs */}
              {recs.length === 0 && (
                <p className="text-xs text-gray-400 italic py-2 text-center">No recommendations yet.</p>
              )}
              {recs.map(rec => (
                <div key={rec.id} className="border border-blue-200 bg-blue-50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <select value={rec.type} onChange={e => {
                        const opt = REC_TYPE_OPTIONS.find(o => o.label === e.target.value) || REC_TYPE_OPTIONS[4]
                        updateRec(rec.id, 'type', opt.label)
                        updateRec(rec.id, 'typeColor', opt.value)
                      }}
                      className="text-xs border border-blue-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                      {REC_TYPE_OPTIONS.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                    </select>
                    <button onClick={() => removeRec(rec.id)} className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"><Trash2 size={14} /></button>
                  </div>
                  <input value={rec.headline} onChange={e => updateRec(rec.id, 'headline', e.target.value)}
                    placeholder="Headline (e.g. Post a member spotlight)"
                    className="w-full border border-blue-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
                  <input value={rec.reason} onChange={e => updateRec(rec.id, 'reason', e.target.value)}
                    placeholder="Reason (e.g. engagement is down this week)"
                    className="w-full border border-blue-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
                </div>
              ))}

              {/* Add new rec */}
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-500">Add new recommendation</p>
                <select value={newRec.type} onChange={e => setNewRec(r => ({ ...r, type: e.target.value }))}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400">
                  {REC_TYPE_OPTIONS.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                </select>
                <input value={newRec.headline} onChange={e => setNewRec(r => ({ ...r, headline: e.target.value }))}
                  placeholder="Headline *"
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400" />
                <input value={newRec.reason} onChange={e => setNewRec(r => ({ ...r, reason: e.target.value }))}
                  placeholder="Reason (why now?)"
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400" />
                <button onClick={addRec} disabled={!newRec.headline.trim()}
                  className="flex items-center gap-1 text-xs font-semibold text-[#E8611A] hover:text-orange-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  <Plus size={13} /> Add Recommendation
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-[#E8611A] text-white text-sm font-bold hover:bg-orange-600 transition-colors">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Points Flash ─────────────────────────────────────────────────────────────
function PointsFlash({ points, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 1400); return () => clearTimeout(t) }, [onDone])
  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
      <div className="bg-[#E8611A] text-white text-3xl font-black px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-2"
           style={{ animation: 'bounceIn 0.4s ease-out' }}>
        <Zap size={28} fill="white" />+{points} pts!
      </div>
    </div>
  )
}

// ─── Proof Modal ──────────────────────────────────────────────────────────────
function ProofModal({ mission, onConfirm, onCancel }) {
  const [note, setNote] = useState('')
  const needsNote = mission.proofRequired === 'note'
  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        <div className="bg-[#1A1A1A] px-5 py-4 flex items-start justify-between">
          <div>
            <p className="text-[#E8611A] text-xs font-bold uppercase tracking-wider mb-0.5">Complete Mission</p>
            <p className="text-white font-bold text-sm leading-tight">{mission.title}</p>
          </div>
          <button onClick={onCancel} className="text-white/40 hover:text-white/70 transition-colors mt-0.5 flex-shrink-0 ml-3"><X size={18} /></button>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-center gap-2 bg-orange-50 border border-orange-200 rounded-xl p-3 mb-4">
            <Zap size={18} className="text-[#E8611A]" fill="#E8611A" />
            <span className="font-bold text-[#E8611A] text-lg">+{mission.points} points</span>
          </div>
          {needsNote && (
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Add a quick note <span className="text-gray-400 font-normal">(what did you do?)</span>
              </label>
              <textarea rows={3} value={note} onChange={e => setNote(e.target.value)}
                placeholder="e.g. Left 20 flyers at Pewaukee Square Apartments…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]"
                autoFocus />
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={() => onConfirm(note)} disabled={needsNote && note.trim().length === 0}
              className="flex-1 py-2.5 rounded-xl bg-[#E8611A] text-white text-sm font-bold hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              Complete It!
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Mission Form (add / edit) ────────────────────────────────────────────────
function MissionForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || BLANK_FORM)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const valid = form.title.trim().length > 0 && form.points > 0

  return (
    <div className="space-y-3">
      {/* Title */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Mission title *</label>
        <input value={form.title} onChange={e => set('title', e.target.value)}
          placeholder="e.g. Hand out flyers at farmers market"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
        <textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)}
          placeholder="What should the TSA do?"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
      </div>

      {/* Row: Category + Difficulty */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Category</label>
          <select value={form.category} onChange={e => set('category', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]">
            {CAT_OPTIONS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Difficulty</label>
          <select value={form.difficulty} onChange={e => set('difficulty', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]">
            {DIFF_OPTIONS.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* Row: Points + Time */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Points *</label>
          <input type="number" min={1} value={form.points} onChange={e => set('points', parseInt(e.target.value) || 0)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Est. time</label>
          <input value={form.estimatedTime} onChange={e => set('estimatedTime', e.target.value)}
            placeholder="e.g. 30 min"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
        </div>
      </div>

      {/* Row: Proof + Repeatable */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Proof required</label>
          <select value={form.proofRequired} onChange={e => set('proofRequired', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]">
            {PROOF_OPTIONS.map(p => <option key={p} value={p}>{p === 'note' ? 'Require note' : 'No proof needed'}</option>)}
          </select>
        </div>
        <div className="flex flex-col justify-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.repeatable} onChange={e => set('repeatable', e.target.checked)}
              className="w-4 h-4 accent-[#E8611A]" />
            <span className="text-xs font-semibold text-gray-600">Repeatable</span>
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
        <button onClick={() => valid && onSave(form)} disabled={!valid}
          className="flex-1 py-2 rounded-lg bg-[#E8611A] text-white text-sm font-bold hover:bg-orange-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          Save Mission
        </button>
      </div>
    </div>
  )
}

// ─── Manage Missions Modal ────────────────────────────────────────────────────
function ManageMissionsModal({ customMissions, hiddenMissions, overrides, onClose, onAddCustom, onEditCustom, onDeleteCustom, onToggleHide, onEditBuiltIn, onResetBuiltIn }) {
  const [mode, setMode]       = useState('list')   // 'list' | 'add' | 'edit-custom' | 'edit-builtin'
  const [editing, setEditing] = useState(null)

  function startEditCustom(m)  { setEditing(m); setMode('edit-custom') }
  function startEditBuiltIn(m) {
    // Pre-fill with any existing override, otherwise use original
    setEditing({ ...m, ...(overrides[m.id] || {}) })
    setMode('edit-builtin')
  }

  function handleSaveNew(form) {
    onAddCustom({ ...form, id: newId(), type: 'standing', expiresAt: null, playId: null })
    setMode('list')
  }

  function handleSaveEditCustom(form) {
    onEditCustom({ ...editing, ...form })
    setEditing(null); setMode('list')
  }

  function handleSaveEditBuiltIn(form) {
    onEditBuiltIn(editing.id, form)
    setEditing(null); setMode('list')
  }

  function cancelEdit() { setEditing(null); setMode('list') }

  const headerLabel = {
    'list':         'Manage Missions',
    'add':          'Add Mission',
    'edit-custom':  'Edit Mission',
    'edit-builtin': 'Edit Mission',
  }[mode]

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-[#1A1A1A] px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-[#E8611A] text-xs font-bold uppercase tracking-wider mb-0.5">Growth HQ</p>
            <p className="text-white font-bold text-base">{headerLabel}</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5">

          {/* ── Forms ── */}
          {mode === 'add' && (
            <MissionForm onSave={handleSaveNew} onCancel={cancelEdit} />
          )}
          {mode === 'edit-custom' && editing && (
            <MissionForm initial={editing} onSave={handleSaveEditCustom} onCancel={cancelEdit} />
          )}
          {mode === 'edit-builtin' && editing && (
            <MissionForm initial={editing} onSave={handleSaveEditBuiltIn} onCancel={cancelEdit} />
          )}

          {/* ── Mission list ── */}
          {mode === 'list' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] text-gray-400">Edit or hide any mission. Edited missions show a dot.</p>
                <button onClick={() => setMode('add')}
                  className="flex items-center gap-1 text-xs font-semibold text-[#E8611A] hover:text-orange-700 transition-colors flex-shrink-0 ml-3">
                  <Plus size={13} /> Add
                </button>
              </div>

              {/* All missions in one unified list: custom first, then built-ins */}
              {[...customMissions, ...STANDING_MISSIONS.map(m => ({ ...m, ...(overrides[m.id] || {}), _isBuiltIn: true, _originalId: m.id, _modified: !!overrides[m.id] }))].map(m => {
                const isCustom = !m._isBuiltIn
                const hidden   = hiddenMissions.includes(m._originalId || m.id)
                return (
                  <div key={m.id}
                    className={`flex items-center gap-2 border rounded-lg px-3 py-2.5 transition-colors ${hidden ? 'bg-gray-50 border-gray-100 opacity-50' : 'bg-white border-gray-200'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-sm font-medium truncate ${hidden ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{m.title}</p>
                        {m._modified && <span className="w-1.5 h-1.5 rounded-full bg-[#E8611A] flex-shrink-0" title="Edited" />}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-gray-400">{m.category}</span>
                        <span className="text-[10px] text-gray-300">·</span>
                        <span className="text-[10px] font-semibold text-[#E8611A]">{m.points} pts</span>
                      </div>
                    </div>
                    <button
                      onClick={() => isCustom ? startEditCustom(m) : startEditBuiltIn(STANDING_MISSIONS.find(s => s.id === m._originalId))}
                      className="p-1 text-gray-400 hover:text-gray-700 transition-colors" title="Edit">
                      <Pencil size={13} />
                    </button>
                    {isCustom ? (
                      <button onClick={() => onDeleteCustom(m.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors" title="Delete"><Trash2 size={13} /></button>
                    ) : (
                      <>
                        {m._modified && (
                          <button onClick={() => onResetBuiltIn(m._originalId)} className="p-1 text-gray-300 hover:text-orange-500 transition-colors" title="Reset to original"><RotateCcw size={13} /></button>
                        )}
                        <button onClick={() => onToggleHide(m._originalId)}
                          className={`p-1 transition-colors ${hidden ? 'text-gray-300 hover:text-gray-500' : 'text-gray-400 hover:text-gray-700'}`}
                          title={hidden ? 'Show' : 'Hide'}>
                          {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {mode === 'list' && (
          <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
            <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-[#1A1A1A] text-white text-sm font-semibold hover:bg-gray-800 transition-colors">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Mission Card ─────────────────────────────────────────────────────────────
function MissionCard({ mission, completions, onComplete, isPlayMission, canDrag,
                       onDragStart, onDragOver, onDrop, onDragEnd, isDragOver, signal }) {
  const [expanded,    setExpanded]    = useState(false)
  const [showProof,   setShowProof]   = useState(false)
  const [showRating,  setShowRating]  = useState(false)

  const todayStr       = new Date().toLocaleDateString('en-CA')
  const completedToday = completions?.some(c => c.date === todayStr) ?? false
  const completionCount = completions?.length ?? 0
  const expiryLabel = timeUntil(mission.expiresAt)
  const isExpired   = expiryLabel === 'Expired'

  function handleConfirm(note) {
    setShowProof(false)
    onComplete(mission, note)
    setShowRating(true)
  }

  const now = new Date()

  return (
    <>
      {showProof && <ProofModal mission={mission} onConfirm={handleConfirm} onCancel={() => setShowProof(false)} />}
      {showRating && (
        <RatingModal
          itemType="mission"
          itemId={mission.id}
          itemTitle={mission.title}
          month={now.getMonth() + 1}
          year={now.getFullYear()}
          existing={null}
          onSaved={() => {}}
          onClose={() => setShowRating(false)}
        />
      )}
      <div
        draggable={canDrag}
        onDragStart={canDrag ? () => onDragStart(mission.id) : undefined}
        onDragOver={canDrag ? (e) => { e.preventDefault(); onDragOver(mission.id) } : undefined}
        onDrop={canDrag ? (e) => { e.preventDefault(); onDrop(mission.id) } : undefined}
        onDragEnd={canDrag ? onDragEnd : undefined}
        className={`border rounded-xl overflow-hidden transition-all ${
          isDragOver      ? 'border-[#E8611A] border-2 scale-[1.01] shadow-md'
          : completedToday ? 'border-green-200 bg-green-50'
          : isExpired    ? 'border-gray-100 bg-gray-50 opacity-60'
          : 'border-gray-200 bg-white hover:border-orange-200'
        } ${canDrag ? 'cursor-default' : ''}`}
      >
        <div className="p-3.5">
          <div className="flex items-start gap-2">
            {/* Drag handle — manager/owner only */}
            {canDrag && (
              <div className="mt-1 flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors">
                <GripVertical size={16} />
              </div>
            )}

            <button
              onClick={() => !completedToday && !isExpired && setShowProof(true)}
              disabled={completedToday || isExpired}
              className={`mt-0.5 flex-shrink-0 transition-colors ${
                completedToday  ? 'text-green-500 cursor-default'
                : isExpired     ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-300 hover:text-[#E8611A] cursor-pointer'
              }`}
            >
              {completedToday ? <CheckCircle2 size={22} /> : <Circle size={22} />}
            </button>

            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold leading-snug ${completedToday ? 'text-green-700 line-through decoration-green-400' : 'text-gray-900'}`}>
                {mission.title}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${DIFFICULTY_COLORS[mission.difficulty] || 'bg-gray-100 text-gray-600'}`}>
                  {mission.difficulty}
                </span>
                <span className="flex items-center gap-0.5 text-[10px] text-gray-400"><Clock size={10} />{mission.estimatedTime}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                  mission.category === 'Social'    ? 'bg-purple-50 text-purple-600 border-purple-200' :
                  mission.category === 'Referrals' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                  mission.category === 'B2B'       ? 'bg-teal-50 text-teal-600 border-teal-200' :
                  'bg-orange-50 text-orange-600 border-orange-200'
                }`}>{mission.category}</span>
                {isPlayMission && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-yellow-50 text-yellow-700 border-yellow-200">Active Play</span>}
                {expiryLabel && expiryLabel !== 'Expired' && <span className="text-[10px] font-medium text-amber-600">⏰ {expiryLabel}</span>}
                {isExpired && <span className="text-[10px] font-medium text-gray-400">Expired</span>}
                {completionCount > 0 && !completedToday && <span className="flex items-center gap-0.5 text-[10px] text-gray-400"><RotateCcw size={9} />{completionCount}×</span>}
                {completedToday && <span className="text-[10px] font-semibold text-green-600">✓ Done today</span>}
              </div>
              {expanded && <p className="text-xs text-gray-500 mt-2 leading-relaxed">{mission.description}</p>}
            </div>

            <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
              <span className="flex items-center gap-0.5 text-xs font-bold text-[#E8611A] bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-md">
                <Zap size={10} fill="#E8611A" />{mission.points}
              </span>
              <ThumbsWidget
                entityType="mission"
                entityId={mission.id}
                entityLabel={mission.title}
                initialUp={signal?.up ?? 0}
                initialDown={signal?.down ?? 0}
                initialMine={signal?.mine ?? null}
              />
              <button onClick={() => setExpanded(e => !e)} className="text-gray-300 hover:text-gray-500 transition-colors">
                {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Weekly Challenge ─────────────────────────────────────────────────────────
function WeeklyChallenge({ challenge }) {
  const pct      = Math.min(100, (challenge.currentCount / challenge.targetCount) * 100)
  const daysLeft = Math.max(0, Math.ceil((new Date(challenge.endsAt) - Date.now()) / 86400000))
  return (
    <div className="mx-4 mb-3 rounded-xl border border-[#E8611A]/30 bg-gradient-to-r from-orange-50 to-amber-50 p-3.5">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Trophy size={16} className="text-[#E8611A]" />
          <div>
            <p className="text-xs font-bold text-gray-800">{challenge.title}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">{challenge.description}</p>
          </div>
        </div>
        <div className="text-right flex-shrink-0 ml-3">
          <p className="text-xs font-bold text-[#E8611A]">+{challenge.bonusPoints} pts</p>
          <p className="text-[10px] text-gray-400">{daysLeft}d left</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-orange-200 rounded-full overflow-hidden">
          <div className="h-full bg-[#E8611A] rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-semibold text-[#E8611A] flex-shrink-0">{challenge.currentCount}/{challenge.targetCount}</span>
      </div>
    </div>
  )
}

// ─── AI Recommender ───────────────────────────────────────────────────────────
function AIRecommender({ recommendations }) {
  const [dismissed, setDismissed] = useState([])
  const visible = recommendations.filter(r => !dismissed.includes(r.id))
  if (visible.length === 0) return null
  return (
    <div className="mx-4 mb-3 space-y-2">
      {visible.map(rec => (
        <div key={rec.id} className="rounded-xl border border-blue-200 bg-blue-50 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <Star size={13} className="text-blue-500 flex-shrink-0 mt-0.5" fill="#3b82f6" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${rec.typeColor}`}>{rec.type}</span>
                </div>
                <p className="text-xs font-semibold text-gray-800 leading-snug">{rec.headline}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{rec.reason}</p>
              </div>
            </div>
            <button onClick={() => setDismissed(d => [...d, rec.id])} className="text-gray-300 hover:text-gray-500 flex-shrink-0"><X size={14} /></button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Missions Tab ────────────────────────────────────────────────────────
export default function MissionsTab({ employee, onPointsEarned, onStreakUpdate }) {
  const { role } = useAuth()
  const canManage = role === 'owner' || role === 'manager'

  const [missionsState,  setMissionsState]  = useState(() => loadMissionsState())
  const [customMissions, setCustomMissions] = useState(() => loadCustomMissions())
  const [hiddenMissions, setHiddenMissions] = useState(() => loadHiddenMissions())
  const [overrides,      setOverrides]      = useState(() => loadOverrides())
  const [missionOrder,   setMissionOrder]   = useState(() => loadOrder())
  const [challenge,      setChallenge]      = useState(() => loadChallenge())
  const [aiRecs,         setAiRecs]         = useState(() => loadAiRecs())
  const [plays,          setPlays]          = useState(() => loadStoredPlays())
  const [category,       setCategory]       = useState('All')
  const [flashPts,       setFlashPts]       = useState(null)
  const [showManage,     setShowManage]     = useState(false)
  const [showTopEdit,    setShowTopEdit]    = useState(false)
  const [dragOverId,     setDragOverId]     = useState(null)
  const dragIdRef = useRef(null)

  // Persist to localStorage
  useEffect(() => { saveMissionsState(missionsState) }, [missionsState])
  useEffect(() => { saveCustomMissions(customMissions) }, [customMissions])
  useEffect(() => { saveHiddenMissions(hiddenMissions) }, [hiddenMissions])
  useEffect(() => { saveOverrides(overrides) }, [overrides])
  useEffect(() => { saveOrder(missionOrder) }, [missionOrder])
  useEffect(() => { saveChallenge(challenge) }, [challenge])
  useEffect(() => { saveAiRecs(aiRecs) }, [aiRecs])

  // Completions for this employee
  const empCompletions = missionsState[employee.id] || {}

  // Build full mission list: play missions (from localStorage plays) + visible built-ins (with overrides applied) + custom
  const playMissions   = plays.filter(p => p.status === 'Active').flatMap(p => p.generatedMissions || [])
  const visibleBuiltIn = STANDING_MISSIONS
    .filter(m => !hiddenMissions.includes(m.id))
    .map(m => overrides[m.id] ? { ...m, ...overrides[m.id] } : m)
  const unorderedAll   = [...playMissions, ...visibleBuiltIn, ...customMissions]
  // Apply saved order; missions not yet in the order list go at the end
  const allMissions = missionOrder.length > 0
    ? [...unorderedAll].sort((a, b) => {
        const ai = missionOrder.indexOf(a.id)
        const bi = missionOrder.indexOf(b.id)
        if (ai === -1 && bi === -1) return 0
        if (ai === -1) return 1
        if (bi === -1) return -1
        return ai - bi
      })
    : unorderedAll
  const filtered       = category === 'All' ? allMissions : allMissions.filter(m => m.category === category)

  // ─── Drag handlers ──────────────────────────────────────────────────────────
  function handleDragStart(id) { dragIdRef.current = id }
  function handleDragOver(id)  { if (id !== dragIdRef.current) setDragOverId(id) }
  function handleDrop(targetId) {
    const fromId = dragIdRef.current
    if (!fromId || fromId === targetId) { dragIdRef.current = null; setDragOverId(null); return }
    const ids     = allMissions.map(m => m.id)
    const fromIdx = ids.indexOf(fromId)
    const toIdx   = ids.indexOf(targetId)
    if (fromIdx === -1 || toIdx === -1) { dragIdRef.current = null; setDragOverId(null); return }
    const next = [...ids]
    next.splice(fromIdx, 1)
    next.splice(toIdx, 0, fromId)
    setMissionOrder(next)
    dragIdRef.current = null
    setDragOverId(null)
  }
  function handleDragEnd() { dragIdRef.current = null; setDragOverId(null) }

  const todayStr      = new Date().toLocaleDateString('en-CA')
  const doneToday     = filtered.filter(m => empCompletions[m.id]?.some(c => c.date === todayStr))
  const remaining     = filtered.filter(m => !empCompletions[m.id]?.some(c => c.date === todayStr))

  const handleComplete = useCallback((mission, note) => {
    const empId     = employee.id
    const today     = new Date().toLocaleDateString('en-CA')
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA')
    const currentEmpData = missionsState[empId] || {}
    const alreadyToday   = Object.values(currentEmpData).some(cs => cs.some(c => c.date === today))
    const didYesterday   = Object.values(currentEmpData).some(cs => cs.some(c => c.date === yesterday))

    setMissionsState(prev => {
      const empData  = { ...(prev[empId] || {}) }
      empData[mission.id] = [...(empData[mission.id] || []), { date: today, note, title: mission.title }]
      return { ...prev, [empId]: empData }
    })
    onPointsEarned(empId, mission.points)
    if (!alreadyToday) {
      const newStreak = didYesterday ? employee.currentStreak + 1 : 1
      onStreakUpdate(empId, newStreak)
    }
    setFlashPts(mission.points)
  }, [employee, missionsState, onPointsEarned, onStreakUpdate])

  // Manage handlers
  function handleAddCustom(mission)          { setCustomMissions(prev => [...prev, mission]) }
  function handleEditCustom(mission)         { setCustomMissions(prev => prev.map(m => m.id === mission.id ? mission : m)) }
  function handleDeleteCustom(id)            { setCustomMissions(prev => prev.filter(m => m.id !== id)) }
  function handleToggleHide(id)              { setHiddenMissions(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }
  function handleEditBuiltIn(id, form)       { setOverrides(prev => ({ ...prev, [id]: form })) }
  function handleResetBuiltIn(id)            { setOverrides(prev => { const n = { ...prev }; delete n[id]; return n }) }

  // Feedback signals for missions
  const missionIds      = allMissions.map(m => String(m.id))
  const missionSignals  = useFeedbackSignals('mission', missionIds)

  // Next rank
  const currentRank    = getRank(employee.points)
  const currentRankIdx = RANKS.findIndex(r => r.name === currentRank.name)
  const nextRank       = RANKS[currentRankIdx + 1] || null
  const ptsToNext      = nextRank ? Math.max(0, nextRank.min - employee.points) : 0
  const totalTodayCount = Object.values(empCompletions).filter(cs => cs.some(c => c.date === todayStr)).length

  return (
    <div className="pb-4">
      {flashPts !== null && <PointsFlash points={flashPts} onDone={() => setFlashPts(null)} />}
      {showManage && (
        <ManageMissionsModal
          customMissions={customMissions}
          hiddenMissions={hiddenMissions}
          overrides={overrides}
          onClose={() => setShowManage(false)}
          onAddCustom={handleAddCustom}
          onEditCustom={handleEditCustom}
          onDeleteCustom={handleDeleteCustom}
          onToggleHide={handleToggleHide}
          onEditBuiltIn={handleEditBuiltIn}
          onResetBuiltIn={handleResetBuiltIn}
        />
      )}
      {showTopEdit && (
        <EditTopItemsModal
          challenge={challenge}
          aiRecs={aiRecs}
          onSaveChallenge={setChallenge}
          onSaveAiRecs={setAiRecs}
          onClose={() => setShowTopEdit(false)}
        />
      )}

      {/* ── Today's summary strip ─────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-xl font-black text-[#E8611A] leading-none">{totalTodayCount}</p>
            <p className="text-[10px] text-gray-400 leading-none mt-0.5">done today</p>
          </div>
          <div className="w-px h-7 bg-gray-200" />
          <div className="text-center">
            <p className="text-xl font-black text-gray-800 leading-none">{employee.pointsThisWeek.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 leading-none mt-0.5">pts this week</p>
          </div>
          <div className="w-px h-7 bg-gray-200" />
          <div className="flex items-center gap-1.5">
            <Flame size={15} className="text-[#E8611A]" />
            <div>
              <p className="text-xl font-black text-gray-800 leading-none">{employee.currentStreak}</p>
              <p className="text-[10px] text-gray-400 leading-none mt-0.5">day streak</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ptsToNext > 0 && nextRank && (
            <div className="text-right">
              <p className="text-[10px] text-gray-400 leading-none">{ptsToNext.toLocaleString()} pts to</p>
              <p className={`text-xs font-bold leading-tight mt-0.5 ${nextRank.color}`}>{nextRank.name}</p>
            </div>
          )}
          {canManage && (
            <div className="flex items-center gap-1 ml-2">
              <button onClick={() => setShowTopEdit(true)}
                className="flex items-center gap-1 bg-blue-50 hover:bg-blue-100 transition-colors rounded-lg px-2.5 py-1.5 text-blue-600"
                title="Edit Weekly Challenge & AI Recs">
                <Pencil size={12} />
                <span className="text-[11px] font-semibold">Top</span>
              </button>
              <button onClick={() => setShowManage(true)}
                className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 transition-colors rounded-lg px-2.5 py-1.5 text-gray-600">
                <Settings size={13} />
                <span className="text-[11px] font-semibold">Missions</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Weekly Challenge ─────────────────────────────────────────────── */}
      <div className="pt-3"><WeeklyChallenge challenge={challenge} /></div>

      {/* ── AI Recommender ───────────────────────────────────────────────── */}
      <AIRecommender recommendations={aiRecs} />

      {/* ── Category Filter ──────────────────────────────────────────────── */}
      <div className="px-4 mb-3">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)}
              className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                category === cat ? 'bg-[#E8611A] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>{cat}</button>
          ))}
        </div>
      </div>

      {/* ── Mission List ─────────────────────────────────────────────────── */}
      <div className="px-4 space-y-2">
        {remaining.length > 0 && (
          <>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              {remaining.length} available
              {canManage && <span className="ml-1.5 normal-case font-normal text-gray-300">· drag to reorder</span>}
            </p>
            {remaining.map(m => (
              <MissionCard key={m.id} mission={m} completions={empCompletions[m.id] || []}
                onComplete={handleComplete} isPlayMission={m.type === 'play-generated'}
                canDrag={canManage}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                isDragOver={dragOverId === m.id}
                signal={missionSignals[String(m.id)] ?? null}
              />
            ))}
          </>
        )}
        {doneToday.length > 0 && (
          <>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-4">Completed today ({doneToday.length})</p>
            {doneToday.map(m => (
              <MissionCard key={m.id} mission={m} completions={empCompletions[m.id] || []}
                onComplete={handleComplete} isPlayMission={m.type === 'play-generated'}
                canDrag={canManage}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                isDragOver={dragOverId === m.id}
                signal={missionSignals[String(m.id)] ?? null}
              />
            ))}
          </>
        )}
        {filtered.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">No missions in this category.</div>
        )}
      </div>
    </div>
  )
}
