import { useState } from 'react'
import { ChevronDown, ChevronUp, Zap, Clock, CheckCircle2, Circle, Tag, X } from 'lucide-react'
import { GROWTH_PLAYS } from '../data/mockData'

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = ['All', 'Community', 'Referrals', 'B2B', 'Guerrilla', 'Social']
const STATUS_COLORS = {
  Active:   'bg-green-100 text-green-700 border-green-200',
  Inactive: 'bg-gray-100 text-gray-500 border-gray-200',
}
const DIFFICULTY_COLORS = {
  Easy:   'bg-green-100 text-green-700',
  Medium: 'bg-yellow-100 text-yellow-700',
  Hard:   'bg-red-100 text-red-700',
}

// ─── Play Detail Modal ────────────────────────────────────────────────────────
function PlayDetailModal({ play, onClose }) {
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
              <p className="text-lg font-black text-gray-800">{play.timesRun}</p>
              <p className="text-[10px] text-gray-500">times run</p>
            </div>
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-center">
              <p className="text-lg font-black text-gray-800">{play.totalLeadsGenerated}</p>
              <p className="text-[10px] text-gray-500">leads total</p>
            </div>
          </div>

          {/* Description */}
          <div>
            <p className="text-xs font-bold text-gray-600 mb-1">Overview</p>
            <p className="text-xs text-gray-500 leading-relaxed">{play.description}</p>
          </div>

          {/* Steps */}
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

          {/* Script */}
          <div>
            <p className="text-xs font-bold text-gray-600 mb-1.5">Suggested Script</p>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-xs text-blue-800 leading-relaxed italic">"{play.suggestedScript}"</p>
            </div>
          </div>

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
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ['Est. Duration', play.estimatedDuration],
              ['Est. Cost', play.estimatedCost],
              ['Expected Outcome', play.expectedOutcome],
              ['Success Metrics', play.successMetrics],
            ].map(([label, val]) => (
              <div key={label} className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-gray-400 font-medium text-[10px] mb-0.5">{label}</p>
                <p className="text-gray-700 font-medium leading-tight">{val}</p>
              </div>
            ))}
          </div>

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

        <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-[#1A1A1A] text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Play Card ────────────────────────────────────────────────────────────────
function PlayCard({ play, onView }) {
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
            <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
              <Clock size={10} />
              {play.estimatedDuration}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            {play.timesRun > 0 && (
              <span className="text-[10px] text-gray-400">{play.totalLeadsGenerated} leads</span>
            )}
            <span className="flex items-center gap-0.5 text-xs font-bold text-[#E8611A]">
              <Zap size={11} fill="#E8611A" />
              {play.points}
            </span>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mt-2">
          {play.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main Plays Tab ───────────────────────────────────────────────────────────
export default function PlaysTab({ employee }) {
  const [category,  setCategory]  = useState('All')
  const [detailPlay, setDetailPlay] = useState(null)

  const active   = GROWTH_PLAYS.filter(p => p.status === 'Active')
  const inactive = GROWTH_PLAYS.filter(p => p.status !== 'Active')

  const filtered = category === 'All'
    ? GROWTH_PLAYS
    : GROWTH_PLAYS.filter(p => p.category === category || p.tags.includes(category))

  const filteredActive   = filtered.filter(p => p.status === 'Active')
  const filteredInactive = filtered.filter(p => p.status !== 'Active')

  return (
    <div className="pb-4">
      {detailPlay && (
        <PlayDetailModal play={detailPlay} onClose={() => setDetailPlay(null)} />
      )}

      {/* ── Summary strip ─────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center gap-4">
        <div className="text-center">
          <p className="text-xl font-black text-green-600 leading-none">{active.length}</p>
          <p className="text-[10px] text-gray-400 leading-none mt-0.5">active</p>
        </div>
        <div className="w-px h-7 bg-gray-200" />
        <div className="text-center">
          <p className="text-xl font-black text-gray-400 leading-none">{inactive.length}</p>
          <p className="text-[10px] text-gray-400 leading-none mt-0.5">available</p>
        </div>
        <div className="w-px h-7 bg-gray-200" />
        <div className="text-center">
          <p className="text-xl font-black text-gray-800 leading-none">
            {GROWTH_PLAYS.reduce((s, p) => s + p.totalLeadsGenerated, 0)}
          </p>
          <p className="text-[10px] text-gray-400 leading-none mt-0.5">leads total</p>
        </div>
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
              <PlayCard key={p.id} play={p} onView={setDetailPlay} />
            ))}
          </>
        )}

        {filteredInactive.length > 0 && (
          <>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-4">
              Playbook ({filteredInactive.length})
            </p>
            {filteredInactive.map(p => (
              <PlayCard key={p.id} play={p} onView={setDetailPlay} />
            ))}
          </>
        )}

        {filtered.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">
            No plays in this category.
          </div>
        )}
      </div>

      <p className="px-4 mt-4 text-[10px] text-gray-400 text-center">
        Tap any play to view the full runbook, script, and supplies.
      </p>
    </div>
  )
}
