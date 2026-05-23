import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Trash2, AlertTriangle, CheckCircle, Send } from 'lucide-react'
import { apiGet, apiDelete, apiPost } from '@/hooks/useApi'
import { useMonth } from '@/contexts/MonthContext'

const VARIANCE_THRESHOLD = 5

function variance(row) {
  return parseFloat(row.drawer_end) - parseFloat(row.drawer_start) - parseFloat(row.cash_collected)
}

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0)
}

function shiftLabel(type) {
  return { opening: 'Opening', mid: 'Mid', closing: 'Closing' }[type] || type
}

function shiftColor(type) {
  return {
    opening: 'bg-blue-100 text-blue-700',
    mid: 'bg-orange-100 text-orange-700',
    closing: 'bg-purple-100 text-purple-700',
  }[type] || 'bg-gray-100 text-gray-700'
}

export default function EodHistory({ selectedDate, onDateChange }) {
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sending, setSending] = useState(false)
  const [sendMsg, setSendMsg] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGet(`/api/eod?date=${selectedDate}`)
      setSubmissions(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  useEffect(() => { load() }, [load])

  async function deleteSubmission(id) {
    if (!confirm('Delete this EOD submission?')) return
    try {
      await apiDelete(`/api/eod/${id}`)
      setSubmissions(prev => prev.filter(s => s.id !== id))
    } catch (e) {
      setError(e.message)
    }
  }

  async function sendDigest() {
    setSending(true)
    setSendMsg(null)
    try {
      await apiPost('/api/eod/send-digest', { date: selectedDate })
      setSendMsg('Email digest sent!')
    } catch (e) {
      setSendMsg(`Error: ${e.message}`)
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      {/* Date picker + actions */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Viewing date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => onDateChange(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {sendMsg && (
            <span className={`text-xs ${sendMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
              {sendMsg}
            </span>
          )}
          <button
            onClick={sendDigest}
            disabled={sending}
            className="flex items-center gap-1.5 text-sm font-medium border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            <Send className="w-3.5 h-3.5" />
            {sending ? 'Sending…' : 'Send Digest Email'}
          </button>
          <button onClick={load} className="text-gray-400 hover:text-gray-600" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm mb-4">{error}</div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      )}

      {!loading && submissions.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No EOD submissions for {selectedDate}.</p>
        </div>
      )}

      {!loading && submissions.length > 0 && (
        <div className="space-y-4">
          {submissions.map(sub => {
            const v = variance(sub)
            const varAlert = Math.abs(v) > VARIANCE_THRESHOLD
            return (
              <div key={sub.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${shiftColor(sub.shift_type)}`}>
                      {shiftLabel(sub.shift_type)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(sub.submitted_at).toLocaleTimeString('en-US', {
                        hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago',
                      })}
                    </span>
                  </div>
                  <button onClick={() => deleteSubmission(sub.id)} className="text-gray-400 hover:text-red-600 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  {/* Drawer */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Drawer</p>
                    <p className="text-gray-700">Start: {fmt(sub.drawer_start)}</p>
                    <p className="text-gray-700">Cash: {fmt(sub.cash_collected)}</p>
                    <p className="text-gray-700">Credit: {fmt(sub.credit_collected)}</p>
                    <p className="text-gray-700">End: {fmt(sub.drawer_end)}</p>
                    <p className={`font-semibold mt-1 flex items-center gap-1 ${varAlert ? 'text-red-600' : 'text-green-600'}`}>
                      {varAlert ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      Variance: {v >= 0 ? '+' : ''}{fmt(v)}
                    </p>
                  </div>

                  {/* Leads + Sales */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Leads & Sales</p>
                    <p className="text-gray-700">Leads: {sub.leads_count}</p>
                    <p className="text-gray-700">Memberships: {sub.new_memberships}</p>
                    <p className="text-gray-700">EFT: {fmt(sub.eft_amount)}</p>
                    <p className="text-gray-700">Retail: {fmt(sub.retail_amount)}</p>
                  </div>

                  {/* Training + Notes */}
                  <div className="col-span-2 md:col-span-1">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Training</p>
                    <p className={sub.watched_training_video ? 'text-green-600' : 'text-gray-400'}>
                      {sub.watched_training_video ? '✓' : '✗'} Training video
                    </p>
                    <p className={sub.used_sales_gpt ? 'text-green-600' : 'text-gray-400'}>
                      {sub.used_sales_gpt ? '✓' : '✗'} Sales GPT
                    </p>
                    <p className={sub.called_leads ? 'text-green-600' : 'text-gray-400'}>
                      {sub.called_leads ? '✓' : '✗'} Called leads
                    </p>
                    {sub.orders_needed && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Orders</p>
                        <p className="text-gray-700 text-xs">{sub.orders_needed}</p>
                      </div>
                    )}
                    {sub.general_notes && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Notes</p>
                        <p className="text-gray-700 text-xs">{sub.general_notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
