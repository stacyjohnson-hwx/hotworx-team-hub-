/**
 * ThumbsWidget — reusable thumbs up / neutral / down signal widget for AI advisor feedback.
 *
 * Usage:
 *   <ThumbsWidget entityType="event" entityId={event.id} entityLabel={event.title} />
 *
 * Props:
 *   entityType    — 'event' | 'promo' | 'b2b' | 'mission' | 'play'
 *   entityId      — string or uuid of the record
 *   entityLabel   — human-readable name (snapshot stored for AI context)
 *   initialUp     — optional pre-loaded upvote count
 *   initialNeutral— optional pre-loaded neutral count
 *   initialDown   — optional pre-loaded downvote count
 *   initialMine   — optional pre-loaded own signal (1, 0, -1, or null)
 *   size          — 'sm' | 'md' (default 'sm')
 *   className     — extra wrapper classes
 */

import { useState, useEffect } from 'react'
import { ThumbsUp, ThumbsDown, Minus } from 'lucide-react'
import { apiGet, apiPost, apiDelete } from '@/hooks/useApi'

export default function ThumbsWidget({
  entityType,
  entityId,
  entityLabel = '',
  initialUp      = 0,
  initialNeutral = 0,
  initialDown    = 0,
  initialMine    = null,
  size           = 'sm',
  className      = '',
}) {
  const [up,      setUp]      = useState(initialUp)
  const [neutral, setNeutral] = useState(initialNeutral)
  const [down,    setDown]    = useState(initialDown)
  const [mine,    setMine]    = useState(initialMine)   // 1 | 0 | -1 | null
  const [busy,    setBusy]    = useState(false)

  async function vote(signal) {
    if (busy) return
    setBusy(true)
    try {
      if (mine === signal) {
        // Clicking own active vote → remove it (go to no-opinion)
        await apiDelete('/api/feedback/signal', { entity_type: entityType, entity_id: String(entityId) })
        if (signal === 1)  setUp(n => n - 1)
        if (signal === 0)  setNeutral(n => n - 1)
        if (signal === -1) setDown(n => n - 1)
        setMine(null)
      } else {
        // Flip or fresh vote — adjust counts for old signal first
        if (mine === 1)  setUp(n => n - 1)
        if (mine === 0)  setNeutral(n => n - 1)
        if (mine === -1) setDown(n => n - 1)
        await apiPost('/api/feedback/signal', {
          entity_type:  entityType,
          entity_id:    String(entityId),
          entity_label: entityLabel,
          signal,
        })
        if (signal === 1)  setUp(n => n + 1)
        if (signal === 0)  setNeutral(n => n + 1)
        if (signal === -1) setDown(n => n + 1)
        setMine(signal)
      }
    } catch { /* silent — optimistic UI already updated */ }
    finally { setBusy(false) }
  }

  const iconSize = size === 'md' ? 15 : 12
  const textSize = size === 'md' ? 'text-xs' : 'text-[10px]'
  const btnBase  = `flex items-center gap-1 px-2 py-1 rounded-lg font-semibold transition-all ${textSize} ${busy ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`

  return (
    <div className={`flex items-center gap-1 ${className}`} onClick={e => e.stopPropagation()}>
      {/* Thumbs up */}
      <button
        onClick={() => vote(1)}
        title="This was a good idea — remember it"
        className={`${btnBase} ${
          mine === 1
            ? 'bg-green-100 text-green-700 border border-green-300'
            : 'bg-gray-100 text-gray-500 border border-transparent hover:bg-green-50 hover:text-green-600 hover:border-green-200'
        }`}
      >
        <ThumbsUp size={iconSize} className={mine === 1 ? 'fill-green-500' : ''} />
        {up > 0 && <span>{up}</span>}
      </button>

      {/* Neutral */}
      <button
        onClick={() => vote(0)}
        title="It's okay — neither great nor bad"
        className={`${btnBase} ${
          mine === 0
            ? 'bg-amber-100 text-amber-700 border border-amber-300'
            : 'bg-gray-100 text-gray-500 border border-transparent hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200'
        }`}
      >
        <Minus size={iconSize} className={mine === 0 ? 'stroke-amber-600' : ''} />
        {neutral > 0 && <span>{neutral}</span>}
      </button>

      {/* Thumbs down */}
      <button
        onClick={() => vote(-1)}
        title="Skip this next time"
        className={`${btnBase} ${
          mine === -1
            ? 'bg-red-100 text-red-600 border border-red-300'
            : 'bg-gray-100 text-gray-500 border border-transparent hover:bg-red-50 hover:text-red-500 hover:border-red-200'
        }`}
      >
        <ThumbsDown size={iconSize} className={mine === -1 ? 'fill-red-500' : ''} />
        {down > 0 && <span>{down}</span>}
      </button>
    </div>
  )
}

/**
 * useFeedbackSignals — hook to batch-load signals for a list of entity IDs.
 * Re-fetches whenever entityType or the ids array length/values change.
 *
 * Returns { signals } where signals is:
 *   { [entityId]: { up, neutral, down, mine } }
 */
export function useFeedbackSignals(entityType, ids = []) {
  const [signals, setSignals] = useState({})
  const key = ids.join(',')

  useEffect(() => {
    if (!entityType || !ids.length) return
    apiGet(`/api/feedback/signals?entity_type=${entityType}&ids=${key}`)
      .then(data => setSignals(data || {}))
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, key])

  return signals
}
