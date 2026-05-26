import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Zap, Clock, CheckCircle2, Circle, Tag, X, Plus,
         Pencil, Trash2, Settings, ToggleLeft, ToggleRight, Star } from 'lucide-react'
import { GROWTH_PLAYS } from '../data/mockData'
import { useAuth } from '@/contexts/AuthContext'
import RatingModal, { StarDisplay } from '@/components/RatingModal'
import { apiGet } from '@/hooks/useApi'
import ThumbsWidget, { useFeedbackSignals } from '@/components/ThumbsWidget'

// ─── localStorage helpers ─────────────────────────────────────────────────────
const PLAYS_KEY = 'leadgenhq_plays'

function loadPlays() {
  try {
    const saved = JSON.parse(localStorage.getItem(PLAYS_KEY))
    if (saved && Array.isArray(saved) && saved.length > 0) return saved
  } catch {}
  // Fall back to mockData on first load
  return GROWTH_PLAYS
}

function savePlays(plays) {
  try { localStorage.setItem(PLAYS_KEY, JSON.stringify(plays)) } catch {}
}

function newPlayId() { return 'play-custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) }

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES   = ['All', 'Community', 'Referrals', 'B2B', 'Guerrilla', 'Social']
const CAT_OPTIONS  = ['Community', 'Referrals', 'B2B', 'Guerrilla', 'Social']
const DIFF_OPTIONS = ['Easy', 'Medium', 'Hard']

const STATUS_COLORS = {
  Active:   'bg-green-100 text-green-700 border-green-200',
  Inactive: 'bg-gray-100 text-gray-500 border-gray-200',
}
const DIFFICULTY_COLORS = {
  Easy:   'bg-green-100 text-green-700',
  Medium: 'bg-yellow-100 text-yellow-700',
  Hard:   'bg-red-100 text-red-700',
}

const BLANK_PLAY = {
  name: '', category: 'Community', status: 'Active', difficulty: 'Medium',
  points: 50, description: '', estimatedDuration: '1-2 hours', estimatedCost: '$0–$20',
  expectedOutcome: '', successMetrics: '', suggestedScript: '',
  stepsText: '', suppliesText: '', tagsText: '',
}

// ─── Play Form ────────────────────────────────────────────────────────────────
function PlayForm({ initial, onSave, onCancel }) {
  const initForm = initial
    ? {
        ...initial,
        stepsText: (initial.steps || []).join('\n'),
        suppliesText: (initial.suppliesNeeded || []).join('\n'),
        tagsText: (initial.tags || []).join(', '),
      }
    : { ...BLANK_PLAY }

  const [form, setForm] = useState(initForm)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const valid = form.name.trim().length > 0

  function handleSave() {
    if (!valid) return
    const play = {
      ...form,
      name: form.name.trim(),
      description: form.description.trim(),
      steps: form.stepsText.split('\n').map(s => s.trim()).filter(Boolean),
      suppliesNeeded: form.suppliesText.split('\n').map(s => s.trim()).filter(Boolean),
      tags: form.tagsText.split(',').map(s => s.trim()).filter(Boolean),
      suggestedScript: form.suggestedScript.trim(),
      points: parseInt(form.points) || 0,
      timesRun: form.timesRun ?? 0,
      totalLeadsGenerated: form.totalLeadsGenerated ?? 0,
      generatedMissions: form.generatedMissions ?? [],
    }
    // Remove form-only fields
    delete play.stepsText
    delete play.suppliesText
    delete play.tagsText
    onSave(play)
  }

  return (
    <div className="overflow-y-auto flex-1 p-5">
      <div className="space-y-3">

        {/* Name */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Play name *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)}
            placeholder="e.g. Apartment Complex Blitz"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
          <textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="What is this play and who is it for?"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
        </div>

        {/* Row: Category + Status */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Category</label>
            <select value={form.category} onChange={e => set('category', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]">
              {CAT_OPTIONS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]">
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>

        {/* Row: Difficulty + Points */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Difficulty</label>
            <select value={form.difficulty} onChange={e => set('difficulty', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]">
              {DIFF_OPTIONS.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Points on complete</label>
            <input type="number" min={0} value={form.points} onChange={e => set('points', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
          </div>
        </div>

        {/* Row: Duration + Cost */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Est. duration</label>
            <input value={form.estimatedDuration} onChange={e => set('estimatedDuration', e.target.value)}
              placeholder="e.g. 1-2 hours"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Est. cost</label>
            <input value={form.estimatedCost} onChange={e => set('estimatedCost', e.target.value)}
              placeholder="e.g. $0–$20"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
          </div>
        </div>

        {/* Steps */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Step-by-step instructions <span className="font-normal text-gray-400">(one per line)</span>
          </label>
          <textarea rows={4} value={form.stepsText} onChange={e => set('stepsText', e.target.value)}
            placeholder={"Step 1: Research apartment complexes within 5 miles\nStep 2: Visit leasing office\nStep 3: Leave flyers and guest passes"}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none font-mono focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
        </div>

        {/* Script */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Suggested script</label>
          <textarea rows={2} value={form.suggestedScript} onChange={e => set('suggestedScript', e.target.value)}
            placeholder="Hi, I'm from HOTWORX Pewaukee…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
        </div>

        {/* Supplies */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Supplies needed <span className="font-normal text-gray-400">(one per line)</span>
          </label>
          <textarea rows={2} value={form.suppliesText} onChange={e => set('suppliesText', e.target.value)}
            placeholder={"Flyers\nGuest passes\nBusiness cards"}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none font-mono focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
        </div>

        {/* Row: Expected outcome + Success metrics */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Expected outcome</label>
            <input value={form.expectedOutcome} onChange={e => set('expectedOutcome', e.target.value)}
              placeholder="e.g. 5–10 new leads"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Success metrics</label>
            <input value={form.successMetrics} onChange={e => set('successMetrics', e.target.value)}
              placeholder="e.g. Leads entered in tracker"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Tags <span className="font-normal text-gray-400">(comma separated)</span>
          </label>
          <input value={form.tagsText} onChange={e => set('tagsText', e.target.value)}
            placeholder="apartments, flyers, bulk outreach"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={!valid}
            className="flex-1 py-2.5 rounded-xl bg-[#E8611A] text-white text-sm font-bold hover:bg-orange-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            Save Play
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Manage Plays Modal ───────────────────────────────────────────────────────
function ManagePlaysModal({ plays, onClose, onAdd, onEdit, onDelete, onToggleStatus }) {
  const [mode, setMode]     = useState('list')   // 'list' | 'add' | 'edit'
  const [editing, setEditing] = useState(null)

  function startEdit(p) { setEditing(p); setMode('edit') }

  function handleSaveNew(play) {
    onAdd({ ...play, id: newPlayId() })
    setMode('list')
  }

  function handleSaveEdit(play) {
    onEdit(play)
    setEditing(null); setMode('list')
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-[#1A1A1A] px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-[#E8611A] text-xs font-bold uppercase tracking-wider mb-0.5">Growth HQ</p>
            <p className="text-white font-bold text-base">
              {mode === 'add' ? 'Add Play' : mode === 'edit' ? 'Edit Play' : 'Manage Plays'}
            </p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors"><X size={20} /></button>
        </div>

        {mode === 'add' && (
          <PlayForm onSave={handleSaveNew} onCancel={() => setMode('list')} />
        )}
        {mode === 'edit' && editing && (
          <PlayForm initial={editing} onSave={handleSaveEdit} onCancel={() => { setEditing(null); setMode('list') }} />
        )}

        {mode === 'list' && (
          <>
            <div className="overflow-y-auto flex-1 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{plays.length} Plays</p>
                <button onClick={() => setMode('add')}
                  className="flex items-center gap-1 text-xs font-semibold text-[#E8611A] hover:text-orange-700 transition-colors">
                  <Plus size={13} /> Add Play
                </button>
              </div>

              {plays.length === 0 ? (
                <p className="text-xs text-gray-400 italic py-4 text-center">No plays yet. Add one above.</p>
              ) : (
                <div className="space-y-2">
                  {plays.map(p => (
                    <div key={p.id} className={`flex items-start gap-2 border rounded-xl px-3 py-2.5 transition-colors ${
                      p.status === 'Active' ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200 opacity-70'
                    }`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <p className={`text-sm font-semibold truncate ${p.status !== 'Active' ? 'text-gray-500' : 'text-gray-800'}`}>{p.name}</p>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${STATUS_COLORS[p.status]}`}>{p.status}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-400">{p.category}</span>
                          <span className="text-[10px] text-gray-300">·</span>
                          <span className="text-[10px] font-semibold text-[#E8611A]">{p.points} pts</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                        <button onClick={() => onToggleStatus(p.id)}
                          className="p-1 text-gray-400 hover:text-gray-700 transition-colors" title="Toggle active">
                          {p.status === 'Active' ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} />}
                        </button>
                        <button onClick={() => startEdit(p)} className="p-1 text-gray-400 hover:text-gray-700 transition-colors"><Pencil size={13} /></button>
                        <button onClick={() => onDelete(p.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
              <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-[#1A1A1A] text-white text-sm font-semibold hover:bg-gray-800 transition-colors">
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Play Detail Modal ────────────────────────────────────────────────────────
function PlayDetailModal({ play, onClose, rating, onRate }) {
  const [stepsDone, setStepsDone] = useState([])

  function toggleStep(i) {
    setStepsDone(prev => prev.includes(i) ? prev.filter(s => s !== i) : [...prev, i])
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 px-3 pb-3">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-[#1A1A1A] px-5 py-4 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold text-[#E8611A] uppercase tracking-wider">Growth Play</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${STATUS_COLORS[play.status]}`}>
                  {play.status}
                </span>
              </div>
              <p className="text-white font-bold text-base leading-tight">{play.name}</p>
            </div>
            <button onClick={onClose} className="text-white/40 hover:text-white/70 mt-1 flex-shrink-0">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Stats row */}
          <div className="flex gap-3">
            <div className="flex-1 bg-orange-50 border border-orange-200 rounded-xl p-2.5 text-center">
              <p className="text-lg font-black text-[#E8611A]">{play.points}</p>
              <p className="text-[10px] text-gray-500">pts on complete</p>
            </div>
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-center">
              <p className="text-lg font-black text-gray-800">{play.timesRun ?? 0}</p>
              <p className="text-[10px] text-gray-500">times run</p>
            </div>
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-center">
              <p className="text-lg font-black text-gray-800">{play.totalLeadsGenerated ?? 0}</p>
              <p className="text-[10px] text-gray-500">leads total</p>
            </div>
          </div>

          {/* Description */}
          {play.description && (
            <div>
              <p className="text-xs font-bold text-gray-600 mb-1">Overview</p>
              <p className="text-xs text-gray-500 leading-relaxed">{play.description}</p>
            </div>
          )}

          {/* Steps */}
          {play.steps?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-600 mb-2">Step-by-Step</p>
              <div className="space-y-2">
                {play.steps.map((step, i) => (
                  <button
                    key={i}
                    onClick={() => toggleStep(i)}
                    className="w-full flex items-start gap-2.5 text-left"
                  >
                    <div className={`flex-shrink-0 mt-0.5 ${stepsDone.includes(i) ? 'text-green-500' : 'text-gray-300'}`}>
                      {stepsDone.includes(i) ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                    </div>
                    <p className={`text-xs leading-relaxed ${stepsDone.includes(i) ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                      {step}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Script */}
          {play.suggestedScript && (
            <div>
              <p className="text-xs font-bold text-gray-600 mb-1.5">Suggested Script</p>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-xs text-blue-800 leading-relaxed italic">"{play.suggestedScript}"</p>
              </div>
            </div>
          )}

          {/* Supplies */}
          {play.suppliesNeeded?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-600 mb-1.5">Supplies Needed</p>
              <div className="flex flex-wrap gap-1.5">
                {play.suppliesNeeded.map((s, i) => (
                  <span key={i} className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Details grid */}
          {(play.estimatedDuration || play.estimatedCost || play.expectedOutcome || play.successMetrics) && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                ['Est. Duration', play.estimatedDuration],
                ['Est. Cost', play.estimatedCost],
                ['Expected Outcome', play.expectedOutcome],
                ['Success Metrics', play.successMetrics],
              ].filter(([, val]) => val).map(([label, val]) => (
                <div key={label} className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-gray-400 font-medium text-[10px] mb-0.5">{label}</p>
                  <p className="text-gray-700 font-medium leading-tight">{val}</p>
                </div>
              ))}
            </div>
          )}

          {/* Generated missions */}
          {play.generatedMissions?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-600 mb-1.5">
                Play Missions ({play.generatedMissions.length})
              </p>
              <div className="space-y-1.5">
                {play.generatedMissions.map(m => (
                  <div key={m.id} className="flex items-center justify-between gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                    <p className="text-xs font-medium text-gray-700 leading-tight flex-1">{m.title}</p>
                    <span className="flex items-center gap-0.5 text-xs font-bold text-[#E8611A] flex-shrink-0">
                      <Zap size={10} fill="#E8611A" />
                      {m.points}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">
                These missions appear automatically in the Missions tab when this play is Active.
              </p>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0 flex gap-2">
          <button
            onClick={() => onRate(play)}
            className={`flex items-center justify-center gap-1.5 flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
              rating
                ? 'border-amber-300 text-amber-600 hover:bg-amber-50'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Star size={14} fill={rating ? '#fbbf24' : 'none'} strokeWidth={1.5} className={rating ? 'text-amber-400' : 'text-gray-400'} />
            {rating ? 'Update Rating' : 'Rate This Play'}
            {rating && <StarDisplay rating={rating.rating} size={12} />}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-[#1A1A1A] text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Play Card ────────────────────────────────────────────────────────────────
function PlayCard({ play, onView, signal }) {
  return (
    <div
      className={`border rounded-xl overflow-hidden cursor-pointer hover:shadow-md transition-all ${
        play.status === 'Active'
          ? 'border-green-200 hover:border-green-400'
          : 'border-gray-200 hover:border-orange-200'
      }`}
      onClick={() => onView(play)}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-sm font-bold text-gray-900 leading-snug flex-1">{play.name}</p>
          <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border ${STATUS_COLORS[play.status]}`}>
            {play.status}
          </span>
        </div>

        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mb-3">{play.description}</p>

        {/* Stats + meta */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${DIFFICULTY_COLORS[play.difficulty] || 'bg-gray-100 text-gray-600'}`}>
              {play.difficulty}
            </span>
            {play.estimatedDuration && (
              <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                <Clock size={10} />
                {play.estimatedDuration}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            {(play.totalLeadsGenerated ?? 0) > 0 && (
              <span className="text-[10px] text-gray-400">{play.totalLeadsGenerated} leads</span>
            )}
            <span className="flex items-center gap-0.5 text-xs font-bold text-[#E8611A]">
              <Zap size={11} fill="#E8611A" />
              {play.points}
            </span>
            <ThumbsWidget
              entityType="play"
              entityId={play.id}
              entityLabel={play.name}
              initialUp={signal?.up ?? 0}
              initialNeutral={signal?.neutral ?? 0}
              initialDown={signal?.down ?? 0}
              initialMine={signal?.mine ?? null}
            />
          </div>
        </div>

        {/* Tags */}
        {play.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {play.tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Plays Tab ───────────────────────────────────────────────────────────
export default function PlaysTab() {
  const { role } = useAuth()
  const canManage = role === 'owner' || role === 'manager'

  const [plays,       setPlays]       = useState(() => loadPlays())
  const [category,    setCategory]    = useState('All')
  const [detailPlay,  setDetailPlay]  = useState(null)
  const [showManage,  setShowManage]  = useState(false)
  const [ratings,     setRatings]     = useState({})   // keyed by play.id
  const [ratingPlay,  setRatingPlay]  = useState(null) // play being rated

  const playIds     = plays.map(p => String(p.id))
  const playSignals = useFeedbackSignals('play', playIds)

  useEffect(() => {
    apiGet('/api/feedback?item_type=play')
      .then(data => {
        const map = {}
        data.forEach(f => { map[f.item_id] = f })
        setRatings(map)
      })
      .catch(() => {})
  }, [])

  // Persist plays
  function updatePlays(next) { setPlays(next); savePlays(next) }

  function handleAdd(play)         { updatePlays([...plays, play]) }
  function handleEdit(play)        { updatePlays(plays.map(p => p.id === play.id ? play : p)) }
  function handleDelete(id)        {
    if (!window.confirm('Delete this play? This cannot be undone.')) return
    updatePlays(plays.filter(p => p.id !== id))
  }
  function handleToggleStatus(id)  {
    updatePlays(plays.map(p => p.id === id ? { ...p, status: p.status === 'Active' ? 'Inactive' : 'Active' } : p))
  }

  const filtered = category === 'All'
    ? plays
    : plays.filter(p => p.category === category || p.tags?.includes(category))

  const filteredActive   = filtered.filter(p => p.status === 'Active')
  const filteredInactive = filtered.filter(p => p.status !== 'Active')
  const allActive        = plays.filter(p => p.status === 'Active')
  const allInactive      = plays.filter(p => p.status !== 'Active')

  const now = new Date()

  return (
    <div className="pb-4">
      {detailPlay && (
        <PlayDetailModal
          play={detailPlay}
          onClose={() => setDetailPlay(null)}
          rating={ratings[detailPlay.id] || null}
          onRate={p => { setRatingPlay(p); setDetailPlay(null) }}
        />
      )}
      {ratingPlay && (
        <RatingModal
          itemType="play"
          itemId={ratingPlay.id}
          itemTitle={ratingPlay.name}
          month={now.getMonth() + 1}
          year={now.getFullYear()}
          existing={ratings[ratingPlay.id] || null}
          onSaved={result => setRatings(prev => ({ ...prev, [ratingPlay.id]: result }))}
          onClose={() => setRatingPlay(null)}
        />
      )}
      {showManage && (
        <ManagePlaysModal
          plays={plays}
          onClose={() => setShowManage(false)}
          onAdd={handleAdd}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggleStatus={handleToggleStatus}
        />
      )}

      {/* ── Summary strip ─────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center gap-4">
        <div className="text-center">
          <p className="text-xl font-black text-green-600 leading-none">{allActive.length}</p>
          <p className="text-[10px] text-gray-400 leading-none mt-0.5">active</p>
        </div>
        <div className="w-px h-7 bg-gray-200" />
        <div className="text-center">
          <p className="text-xl font-black text-gray-400 leading-none">{allInactive.length}</p>
          <p className="text-[10px] text-gray-400 leading-none mt-0.5">available</p>
        </div>
        <div className="w-px h-7 bg-gray-200" />
        <div className="text-center">
          <p className="text-xl font-black text-gray-800 leading-none">
            {plays.reduce((s, p) => s + (p.totalLeadsGenerated ?? 0), 0)}
          </p>
          <p className="text-[10px] text-gray-400 leading-none mt-0.5">leads total</p>
        </div>

        {canManage && (
          <div className="ml-auto">
            <button onClick={() => setShowManage(true)}
              className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 transition-colors rounded-lg px-2.5 py-1.5 text-gray-600">
              <Settings size={13} />
              <span className="text-[11px] font-semibold">Manage</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Category filter ───────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                category === cat
                  ? 'bg-[#E8611A] text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Play cards ────────────────────────────────────────────────────── */}
      <div className="px-4 space-y-3">
        {filteredActive.length > 0 && (
          <>
            <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider">
              ▶ Active Plays ({filteredActive.length})
            </p>
            {filteredActive.map(p => (
              <PlayCard key={p.id} play={p} onView={setDetailPlay} signal={playSignals[String(p.id)] ?? null} />
            ))}
          </>
        )}

        {filteredInactive.length > 0 && (
          <>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-4">
              Playbook ({filteredInactive.length})
            </p>
            {filteredInactive.map(p => (
              <PlayCard key={p.id} play={p} onView={setDetailPlay} signal={playSignals[String(p.id)] ?? null} />
            ))}
          </>
        )}

        {filtered.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">
            {plays.length === 0
              ? 'No plays yet. Use the Manage button to add your first play.'
              : 'No plays in this category.'}
          </div>
        )}
      </div>

      <p className="px-4 mt-4 text-[10px] text-gray-400 text-center">
        Tap any play to view the full runbook, script, and supplies.
      </p>
    </div>
  )
}
