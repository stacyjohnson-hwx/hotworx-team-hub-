import { useState } from 'react'
import { X, Star } from 'lucide-react'
import { apiPost } from '@/hooks/useApi'

const LABELS = { 1: 'Didn\'t work', 2: 'Meh', 3: 'Okay', 4: 'Good', 5: 'Excellent!' }

const TYPE_CONFIG = {
  event:   { accent: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200',    label: 'Event'   },
  promo:   { accent: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200',  label: 'Promo'   },
  mission: { accent: 'text-[#E8611A]',  bg: 'bg-orange-50', border: 'border-orange-200', label: 'Mission' },
  play:    { accent: 'text-[#E8611A]',  bg: 'bg-orange-50', border: 'border-orange-200', label: 'Play'    },
}

// ─── Inline star picker (reusable) ────────────────────────────────────────────
export function StarPicker({ value, onChange, size = 28 }) {
  const [hover, setHover] = useState(0)
  const active = hover || value
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="transition-transform hover:scale-110 active:scale-95"
        >
          <Star
            size={size}
            className={active >= n ? 'text-amber-400' : 'text-gray-200'}
            fill={active >= n ? '#fbbf24' : 'none'}
            strokeWidth={1.5}
          />
        </button>
      ))}
      {active > 0 && (
        <span className="ml-2 text-sm font-semibold text-gray-600">{LABELS[active]}</span>
      )}
    </div>
  )
}

// ─── Display-only stars ────────────────────────────────────────────────────────
export function StarDisplay({ rating, size = 14, showLabel = false }) {
  if (!rating) return null
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          size={size}
          className={rating >= n ? 'text-amber-400' : 'text-gray-200'}
          fill={rating >= n ? '#fbbf24' : 'none'}
          strokeWidth={1.5}
        />
      ))}
      {showLabel && <span className="ml-1 text-xs text-gray-500">{LABELS[rating]}</span>}
    </span>
  )
}

// ─── Full rating modal ─────────────────────────────────────────────────────────
export default function RatingModal({ itemType, itemId, itemTitle, month, year, existing, onSaved, onClose }) {
  const cfg = TYPE_CONFIG[itemType] || TYPE_CONFIG.event
  const [rating, setRating] = useState(existing?.rating || 0)
  const [notes,  setNotes]  = useState(existing?.notes  || '')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function handleSubmit() {
    if (!rating) return setError('Please pick a star rating.')
    setSaving(true); setError('')
    try {
      const result = await apiPost('/api/feedback', {
        item_type: itemType,
        item_id:   itemId,
        item_title: itemTitle,
        rating,
        notes: notes.trim() || null,
        month: month || new Date().getMonth() + 1,
        year:  year  || new Date().getFullYear(),
      })
      onSaved?.(result)
      onClose()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="bg-[#1A1A1A] px-5 py-4 flex items-start justify-between gap-3">
          <div>
            <p className={`text-xs font-bold uppercase tracking-wider mb-0.5 ${cfg.accent}`}>
              Rate this {cfg.label}
            </p>
            <p className="text-white font-bold text-sm leading-snug">{itemTitle}</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 flex-shrink-0 mt-0.5">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Stars */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">How did it go?</p>
            <StarPicker value={rating} onChange={setRating} size={32} />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Notes <span className="font-normal normal-case text-gray-400">(what worked? what didn't?)</span>
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Great turnout, social media drove most traffic. Would do again in summer."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400"
            />
          </div>

          {error && <p className="text-red-600 text-xs">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={saving || !rating}
              className="flex-1 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-white text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? 'Saving…' : existing ? 'Update Rating' : 'Save Rating'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
