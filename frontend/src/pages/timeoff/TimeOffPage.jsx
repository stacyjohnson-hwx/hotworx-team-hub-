import { useState, useEffect, useCallback } from 'react'
import { Plus, Check, X, Trash2, RefreshCw, ChevronDown } from 'lucide-react'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/hooks/useApi'
import { useRole } from '@/hooks/useRole'
import { useAuth } from '@/contexts/AuthContext'
import { useStudio } from '@/contexts/StudioContext'
import { MyAvailability, TeamAvailability } from '@/pages/availability/AvailabilityPage'

const STATUS_STYLES = {
  pending:  'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  denied:   'bg-red-100 text-red-700',
}

function formatDateRange(start, end) {
  const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TimeOffPage() {
  const { isOwnerOrManager } = useRole()
  const { currentStudio } = useStudio()
  const studioId = currentStudio?.id
  const [tab, setTab] = useState(isOwnerOrManager ? 'requests' : 'mine')
  const isAvailabilityTab = tab === 'availability' || tab === 'team-availability'
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGet('/api/timeoff')
      setRequests(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleReview(id, status, note) {
    try {
      const updated = await apiPatch(`/api/timeoff/${id}`, { status, review_note: note })
      setRequests(prev => prev.map(r => r.id === id ? updated : r))
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Cancel this request?')) return
    try {
      await apiDelete(`/api/timeoff/${id}`)
      setRequests(prev => prev.filter(r => r.id !== id))
    } catch (e) {
      setError(e.message)
    }
  }

  function onSubmitted(req) {
    setRequests(prev => [req, ...prev])
    setShowForm(false)
  }

  const pending = requests.filter(r => r.status === 'pending')
  const mine = requests // for TSA this is already filtered server-side

  const containerWidth = isAvailabilityTab ? 'max-w-5xl' : 'max-w-2xl'

  return (
    <div className={`${containerWidth} mx-auto`}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Time Off &amp; Availability</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isOwnerOrManager ? 'Review requests and see when the team can work.' : 'Request time off and set when you can work.'}
          </p>
        </div>
        {!isAvailabilityTab && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-red-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-red-600-hover transition-colors">
            <Plus className="w-4 h-4" /> Request
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 flex-wrap">
        {isOwnerOrManager && (
          <>
            <TabBtn active={tab === 'requests'} onClick={() => setTab('requests')}>
              Pending {pending.length > 0 && <span className="ml-1.5 bg-red-600 text-white text-xs px-1.5 py-0.5 rounded-full">{pending.length}</span>}
            </TabBtn>
            <TabBtn active={tab === 'all'} onClick={() => setTab('all')}>All Requests</TabBtn>
          </>
        )}
        <TabBtn active={tab === 'mine'} onClick={() => setTab('mine')}>My Requests</TabBtn>
        <TabBtn active={tab === 'availability'} onClick={() => setTab('availability')}>My Availability</TabBtn>
        {isOwnerOrManager && (
          <TabBtn active={tab === 'team-availability'} onClick={() => setTab('team-availability')}>Team Availability</TabBtn>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm mb-4">{error}</div>
      )}

      {/* Availability tabs render their own components (independent of time-off loading) */}
      {tab === 'availability' && <MyAvailability studioId={studioId} />}
      {tab === 'team-availability' && isOwnerOrManager && <TeamAvailability studioId={studioId} />}

      {/* Time-off request tabs */}
      {!isAvailabilityTab && (
        loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <>
            {(tab === 'requests') && (
              <RequestList
                requests={pending}
                showActions={isOwnerOrManager}
                showName={true}
                emptyMsg="No pending requests."
                onReview={handleReview}
                onDelete={handleDelete}
              />
            )}
            {(tab === 'all') && (
              <RequestList
                requests={requests}
                showActions={isOwnerOrManager}
                showName={true}
                emptyMsg="No requests yet."
                onReview={handleReview}
                onDelete={handleDelete}
              />
            )}
            {(tab === 'mine') && (
              <RequestList
                requests={mine}
                showActions={false}
                showName={false}
                emptyMsg="You haven't submitted any requests."
                onDelete={handleDelete}
              />
            )}
          </>
        )
      )}

      {showForm && (
        <TimeOffForm onSubmitted={onSubmitted} onClose={() => setShowForm(false)} />
      )}
    </div>
  )
}

// ─── Request List ─────────────────────────────────────────────────────────────

function RequestList({ requests, showActions, showName, emptyMsg, onReview, onDelete }) {
  const { user } = useAuth()

  if (requests.length === 0) {
    return <p className="text-center py-16 text-gray-400 text-sm">{emptyMsg}</p>
  }

  return (
    <div className="space-y-3">
      {requests.map(req => (
        <RequestCard
          key={req.id}
          req={req}
          isOwn={req.requested_by === user?.id}
          showActions={showActions}
          showName={showName}
          onReview={onReview}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

function RequestCard({ req, isOwn, showActions, showName, onReview, onDelete }) {
  const [reviewNote, setReviewNote] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [actioning, setActioning] = useState(false)

  async function review(status) {
    setActioning(true)
    await onReview(req.id, status, reviewNote)
    setActioning(false)
    setExpanded(false)
  }

  const submitted = new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900">{formatDateRange(req.start_date, req.end_date)}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLES[req.status]}`}>
              {req.status}
            </span>
          </div>
          {showName && req.requester_name && (
            <p className="text-xs font-medium text-gray-700 mt-0.5">
              {req.requester_name}{isOwn && <span className="ml-1 text-gray-400 font-normal">(you)</span>}
            </p>
          )}
          {req.reason && <p className="text-xs text-gray-500 mt-0.5 truncate">{req.reason}</p>}
          <p className="text-xs text-gray-400 mt-0.5">Submitted {submitted}</p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {showActions && req.status === 'pending' && (
            <button onClick={() => setExpanded(p => !p)}
              className="text-xs font-medium px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 transition-colors flex items-center gap-1">
              Review <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
          {/* Delete: manager/owner can delete any; TSA can delete own pending only */}
          {(showActions || (isOwn && req.status === 'pending')) && (
            <button onClick={() => onDelete(req.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Delete request">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Review panel */}
      {expanded && showActions && req.status === 'pending' && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-2">
          <textarea
            rows={2}
            value={reviewNote}
            onChange={e => setReviewNote(e.target.value)}
            placeholder="Optional note to the team member…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 resize-none bg-white"
          />
          <div className="flex gap-2">
            <button onClick={() => review('approved')} disabled={actioning}
              className="flex items-center gap-1.5 bg-green-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-60">
              <Check className="w-3.5 h-3.5" /> Approve
            </button>
            <button onClick={() => review('denied')} disabled={actioning}
              className="flex items-center gap-1.5 bg-red-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60">
              <X className="w-3.5 h-3.5" /> Deny
            </button>
          </div>
          {req.review_note && (
            <p className="text-xs text-gray-500 italic">Manager note: {req.review_note}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Submit form ──────────────────────────────────────────────────────────────

function TimeOffForm({ onSubmitted, onClose }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({ start_date: '', end_date: '', reason: '' })

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function submit(e) {
    e.preventDefault()
    if (!form.start_date || !form.end_date) return setError('Please select start and end dates.')
    if (form.end_date < form.start_date) return setError('End date cannot be before start date.')
    setSaving(true)
    setError(null)
    try {
      const saved = await apiPost('/api/timeoff', form)
      onSubmitted(saved)
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Request Time Off</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">From *</label>
              <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">To *</label>
              <input type="date" value={form.end_date} min={form.start_date} onChange={e => set('end_date', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Reason <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea rows={3} value={form.reason} onChange={e => set('reason', e.target.value)}
              placeholder="Vacation, appointment, personal…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 resize-none" />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-red-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-red-600-hover transition-colors disabled:opacity-60">
              {saving ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center ${
        active ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}>
      {children}
    </button>
  )
}
