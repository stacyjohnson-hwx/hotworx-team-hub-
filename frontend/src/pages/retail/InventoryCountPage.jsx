import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStudio } from '@/contexts/StudioContext'
import { apiGet, apiPut, apiPost } from '@/hooks/useApi'
import {
  CheckCircle, Circle, AlertCircle, Camera, Flag, ArrowLeft,
  Package, Check, X, DollarSign, TrendingDown, TrendingUp, Calendar, History, Save,
} from 'lucide-react'

export default function InventoryCountPage() {
  const navigate = useNavigate()
  const { currentStudio } = useStudio()
  const [view, setView] = useState('current') // 'current' or 'history'
  const [sessions, setSessions] = useState([])
  const [currentSession, setCurrentSession] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [countMonth, setCountMonth] = useState(new Date().getMonth() + 1)
  const [countYear, setCountYear] = useState(new Date().getFullYear())

  useEffect(() => {
    if (currentStudio?.id) {
      loadData()
    }
  }, [currentStudio?.id])

  const loadData = async () => {
    setLoading(true)
    try {
      const allSessions = await apiGet('/api/retail/counts', currentStudio.id)
      setSessions(allSessions)

      // Load or create current month's session
      const monthKey = `${countYear}-${String(countMonth).padStart(2, '0')}`
      let session = allSessions.find(s => s.count_date?.startsWith(monthKey) && s.status === 'in_progress')

      if (!session) {
        // Create new session for this month
        session = await apiPost('/api/retail/counts', {
          count_date: `${monthKey}-01`,
          count_type: 'monthly',
        }, currentStudio.id)
      }

      setCurrentSession(session)

      // Load entries
      const sessionData = await apiGet(`/api/retail/counts/${session.id}`, currentStudio.id)
      setEntries(sessionData.entries || [])
    } catch (err) {
      console.error('Failed to load:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleActualChange = (entryId, value) => {
    setEntries(prev => prev.map(e =>
      e.id === entryId ? { ...e, actual_quantity: value === '' ? null : parseInt(value) } : e
    ))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Save all entries that have been counted
      for (const entry of entries.filter(e => e.actual_quantity !== null)) {
        await apiPut(
          `/api/retail/counts/${currentSession.id}/entries/${entry.id}`,
          { actual_quantity: entry.actual_quantity },
          currentStudio.id
        )
      }
      alert('Progress saved!')
      await loadData() // Reload to get calculated variances
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    const uncounted = entries.filter(e => e.actual_quantity === null).length
    if (uncounted > 0) {
      if (!confirm(`${uncounted} items not counted yet. Submit anyway?`)) return
    }

    if (!confirm('Submit and lock this count? This will update inventory levels and cannot be undone.')) return

    setSaving(true)
    try {
      await apiPost(`/api/retail/counts/${currentSession.id}/submit`, {}, currentStudio.id)
      alert('Count submitted successfully!')
      navigate('/retail?tab=inventory')
    } catch (err) {
      alert('Submit failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const counted = entries.filter(e => e.actual_quantity !== null).length
  const total = entries.length
  const progress = total > 0 ? Math.round(counted / total * 100) : 0

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading inventory...</div>
  }

  if (view === 'history') {
    return <HistoryView sessions={sessions} onBack={() => setView('current')} currentStudio={currentStudio} />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => navigate('/retail?tab=inventory')} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
            <ArrowLeft size={20} />
            <span className="font-medium">Back</span>
          </button>
          <h1 className="text-xl font-bold text-gray-900">Inventory Count</h1>
          <button onClick={() => setView('history')} className="flex items-center gap-2 text-red-600 hover:text-red-700">
            <History size={20} />
            <span className="font-medium">History</span>
          </button>
        </div>

        {/* Month/Year Selector */}
        <div className="flex items-center gap-3 mb-3">
          <label className="text-sm font-medium text-gray-700">Count Period:</label>
          <select
            value={countMonth}
            onChange={e => setCountMonth(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i).toLocaleDateString('en-US', { month: 'long' })}
              </option>
            ))}
          </select>
          <select
            value={countYear}
            onChange={e => setCountYear(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30"
          >
            {Array.from({ length: 5 }, (_, i) => (
              <option key={i} value={new Date().getFullYear() - 2 + i}>
                {new Date().getFullYear() - 2 + i}
              </option>
            ))}
          </select>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
          >
            Load Month
          </button>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">{counted} of {total} counted</span>
          <span className="text-sm font-semibold text-red-600">{progress}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-red-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Count Table */}
      <div className="p-4">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Image</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Product</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">SKU</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Expected</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actual Count</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {entries.map(entry => {
                  const variance = entry.actual_quantity !== null ? entry.actual_quantity - entry.expected_quantity : null
                  return (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center overflow-hidden">
                          {entry.sku?.image_url ? (
                            <img src={entry.sku.image_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Package size={24} className="text-gray-300" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-900 font-medium">{entry.sku?.product_name}</td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{entry.sku?.sku_code}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{entry.expected_quantity}</td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={entry.actual_quantity ?? ''}
                          onChange={e => handleActualChange(entry.id, e.target.value)}
                          className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-center font-semibold focus:outline-none focus:ring-2 focus:ring-red-600/30"
                          placeholder="—"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {variance !== null ? (
                          <span className={`font-bold ${variance < 0 ? 'text-red-600' : variance > 0 ? 'text-green-600' : 'text-gray-600'}`}>
                            {variance > 0 ? '+' : ''}{variance}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {entries.length === 0 && (
            <div className="p-12 text-center text-gray-500">
              <Package size={48} className="mx-auto text-gray-300 mb-3" />
              <p>No inventory items found</p>
              <p className="text-xs text-gray-400 mt-2">
                Import inventory from the Catalog tab first
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        {entries.length > 0 && (
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 font-semibold"
            >
              <Save size={20} />
              {saving ? 'Saving...' : 'Save Progress'}
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-semibold"
            >
              <CheckCircle size={20} />
              Submit & Lock Count
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── History View ────────────────────────────────────────────────────────────

function HistoryView({ sessions, onBack, currentStudio }) {
  const [selectedSession, setSelectedSession] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)

  const handleViewSession = async (session) => {
    setLoading(true)
    try {
      const data = await apiGet(`/api/retail/counts/${session.id}`, currentStudio.id)
      setSelectedSession(session)
      setEntries(data.entries || [])
    } catch (err) {
      console.error('Failed to load session:', err)
    } finally {
      setLoading(false)
    }
  }

  if (selectedSession) {
    const variances = entries.filter(e => e.variance !== 0)
    const totalVarianceValue = entries.reduce((sum, e) => sum + (e.variance_value || 0), 0)

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <button onClick={() => setSelectedSession(null)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-3">
            <ArrowLeft size={20} />
            <span className="font-medium">Back to History</span>
          </button>
          <h1 className="text-xl font-bold text-gray-900">Count from {selectedSession.count_date}</h1>
          <p className="text-sm text-gray-500">Status: {selectedSession.status}</p>
        </div>

        <div className="p-4">
          {/* Summary */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{entries.length}</p>
                <p className="text-xs text-gray-500">Total Items</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">{variances.length}</p>
                <p className="text-xs text-gray-500">Variances</p>
              </div>
              <div className="text-center">
                <p className={`text-2xl font-bold ${totalVarianceValue < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ${Math.abs(totalVarianceValue).toFixed(2)}
                </p>
                <p className="text-xs text-gray-500">Total Variance</p>
              </div>
            </div>
          </div>

          {/* Entries Table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">SKU</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Expected</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Actual</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {entries.map(entry => (
                    <tr key={entry.id} className={entry.variance !== 0 ? 'bg-red-50' : ''}>
                      <td className="px-4 py-3 text-gray-900 font-medium">{entry.sku?.product_name}</td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{entry.sku?.sku_code}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{entry.expected_quantity}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{entry.actual_quantity}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold ${entry.variance < 0 ? 'text-red-600' : entry.variance > 0 ? 'text-green-600' : 'text-gray-600'}`}>
                          {entry.variance > 0 ? '+' : ''}{entry.variance}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-3">
          <ArrowLeft size={20} />
          <span className="font-medium">Back to Current Count</span>
        </button>
        <h1 className="text-xl font-bold text-gray-900">Count History</h1>
      </div>

      <div className="p-4">
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
          {sessions.filter(s => s.status === 'submitted').map(session => (
            <div key={session.id} className="p-4 hover:bg-gray-50 cursor-pointer" onClick={() => handleViewSession(session)}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{session.count_date}</p>
                  <p className="text-sm text-gray-600">
                    {session.count_type} • Submitted {new Date(session.submitted_at).toLocaleDateString()}
                  </p>
                </div>
                <CheckCircle size={20} className="text-green-500" />
              </div>
            </div>
          ))}
          {sessions.filter(s => s.status === 'submitted').length === 0 && (
            <div className="p-12 text-center text-gray-500">
              <History size={48} className="mx-auto text-gray-300 mb-3" />
              <p>No submitted counts yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Removed old card-based counting components
  const { sessionId } = useParams()
  const { currentStudio } = useStudio()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [entries, setEntries] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showReconciliation, setShowReconciliation] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (currentStudio?.id && sessionId) {
      loadSession()
    }
  }, [currentStudio?.id, sessionId])

  const loadSession = async () => {
    setLoading(true)
    try {
      const data = await apiGet(`/api/retail/counts/${sessionId}`, currentStudio.id)
      setSession(data)
      setEntries(data.entries || [])
    } catch (err) {
      console.error('Failed to load count session:', err)
    } finally {
      setLoading(false)
    }
  }

  const currentEntry = entries[currentIndex]
  const progress = entries.filter(e => e.actual_quantity !== null).length
  const total = entries.length

  const handleCount = async (quantity, sizeQuantities = null) => {
    const updated = await apiPut(
      `/api/retail/counts/${sessionId}/entries/${currentEntry.id}`,
      {
        actual_quantity: quantity,
        actual_size_quantities: sizeQuantities,
      },
      currentStudio.id
    )

    setEntries(prev => prev.map(e => e.id === updated.id ? { ...e, ...updated } : e))

    // Auto-advance to next uncounted item
    const nextUncounted = entries.findIndex((e, i) => i > currentIndex && e.actual_quantity === null)
    if (nextUncounted !== -1) {
      setCurrentIndex(nextUncounted)
    } else if (currentIndex < entries.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
  }

  const handleQuickMatch = () => {
    handleCount(currentEntry.expected_quantity, currentEntry.expected_size_quantities)
  }

  const handleSubmit = async () => {
    if (!confirm(`Submit count session? This will lock the count and update inventory levels.`)) return
    setSubmitting(true)
    try {
      await apiPost(`/api/retail/counts/${sessionId}/submit`, {}, currentStudio.id)
      navigate('/retail?tab=inventory')
    } catch (err) {
      alert('Failed to submit: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-400">Loading count session...</div>
        </div>
      </div>
    )
  }

  if (showReconciliation) {
    return <ReconciliationView entries={entries} session={session} onBack={() => setShowReconciliation(false)} onSubmit={handleSubmit} submitting={submitting} />
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate('/retail?tab=inventory')} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
          <ArrowLeft size={20} />
          <span className="font-medium">Back</span>
        </button>
        <div className="text-center">
          <h1 className="text-lg font-bold text-gray-900">Inventory Count</h1>
          <p className="text-xs text-gray-500">{session?.count_date}</p>
        </div>
        <div className="w-16" /> {/* Spacer */}
      </div>

      {/* Progress */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">{progress} of {total} counted</span>
          <span className="text-sm font-semibold text-red-600">{Math.round(progress / total * 100)}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-red-600 transition-all" style={{ width: `${progress / total * 100}%` }} />
        </div>
      </div>

      {/* Count Card */}
      <div className="flex-1 overflow-y-auto p-4">
        {currentEntry && (
          <CountCard
            entry={currentEntry}
            onCount={handleCount}
            onQuickMatch={handleQuickMatch}
            onPrev={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
            onNext={() => setCurrentIndex(Math.min(entries.length - 1, currentIndex + 1))}
            hasPrev={currentIndex > 0}
            hasNext={currentIndex < entries.length - 1}
          />
        )}
      </div>

      {/* Bottom Actions */}
      <div className="bg-white border-t border-gray-200 p-4 safe-area-bottom">
        <button
          onClick={() => setShowReconciliation(true)}
          className="w-full py-4 bg-red-600 text-white rounded-lg font-semibold text-lg hover:bg-red-700 transition-colors"
        >
          Review & Submit ({progress}/{total})
        </button>
      </div>
    </div>
  )
}

// ─── Count Card Component ────────────────────────────────────────────────────

function CountCard({ entry, onCount, onQuickMatch, onPrev, onNext, hasPrev, hasNext }) {
  const [quantity, setQuantity] = useState(entry.actual_quantity ?? '')
  const [sizeQty, setSizeQty] = useState(entry.actual_size_quantities || {})

  const sku = entry.sku
  const hasSizes = sku?.has_sizes
  const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

  const handleSave = () => {
    if (hasSizes) {
      const total = Object.values(sizeQty).reduce((sum, val) => sum + (parseInt(val) || 0), 0)
      onCount(total, sizeQty)
    } else {
      onCount(parseInt(quantity) || 0, null)
    }
  }

  const isCounted = entry.actual_quantity !== null

  return (
    <div className="max-w-2xl mx-auto">
      {/* Product Info */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-4">
        <div className="flex gap-4 mb-4">
          <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
            {sku.image_url ? (
              <img src={sku.image_url} alt={sku.product_name} className="w-full h-full object-cover rounded-lg" />
            ) : (
              <Package size={32} className="text-gray-300" />
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900 mb-1">{sku.product_name}</h2>
            <p className="text-sm text-gray-500 mb-2">SKU: {sku.sku_code}</p>
            <p className="text-sm text-gray-600">Category: {sku.category?.name || 'None'}</p>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="text-xs text-gray-500 mb-1">Expected Quantity</p>
            <p className="text-2xl font-bold text-gray-900">{entry.expected_quantity}</p>
          </div>
          {isCounted && (
            <div className="text-center">
              <CheckCircle size={32} className="text-green-500 mx-auto mb-1" />
              <p className="text-xs text-green-600 font-medium">Counted</p>
            </div>
          )}
        </div>
      </div>

      {/* Count Input */}
      {!hasSizes && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-3">Actual Quantity</label>
          <input
            type="number"
            inputMode="numeric"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            className="w-full text-4xl font-bold text-center py-6 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
            placeholder="0"
            autoFocus
          />
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleQuickMatch}
              className="flex-1 py-3 bg-green-50 text-green-700 rounded-lg font-medium hover:bg-green-100 transition-colors flex items-center justify-center gap-2"
            >
              <Check size={18} />
              Quick Match ({entry.expected_quantity})
            </button>
            <button
              onClick={handleSave}
              disabled={quantity === ''}
              className="flex-1 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Count
            </button>
          </div>
        </div>
      )}

      {/* Size Grid (Apparel) */}
      {hasSizes && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-3">Actual Quantity by Size</label>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {sizes.map(size => (
              <div key={size}>
                <label className="block text-xs font-medium text-gray-600 mb-1 text-center">{size}</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={sizeQty[size] || ''}
                  onChange={e => setSizeQty(prev => ({ ...prev, [size]: e.target.value }))}
                  className="w-full text-2xl font-bold text-center py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
                  placeholder="0"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg mb-4">
            <span className="text-sm font-medium text-gray-700">Total</span>
            <span className="text-2xl font-bold text-gray-900">
              {Object.values(sizeQty).reduce((sum, val) => sum + (parseInt(val) || 0), 0)}
            </span>
          </div>
          <button
            onClick={handleSave}
            className="w-full py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
          >
            Save Count
          </button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          onClick={onPrev}
          disabled={!hasPrev}
          className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Previous
        </button>
        <button
          onClick={onNext}
          disabled={!hasNext}
          className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next →
        </button>
      </div>
    </div>
  )
}

// ─── Reconciliation View ─────────────────────────────────────────────────────

function ReconciliationView({ entries, session, onBack, onSubmit, submitting }) {
  const variances = entries.filter(e => e.variance !== 0 && e.actual_quantity !== null)
  const matches = entries.filter(e => e.variance === 0 && e.actual_quantity !== null)
  const uncounted = entries.filter(e => e.actual_quantity === null)

  const totalVarianceValue = entries.reduce((sum, e) => sum + (e.variance_value || 0), 0)
  const totalInventoryValue = entries.reduce((sum, e) => {
    return sum + (e.expected_quantity * (e.sku?.retail_price || 0))
  }, 0)
  const shrinkageRate = totalInventoryValue > 0 ? Math.abs(totalVarianceValue / totalInventoryValue * 100) : 0

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
          <ArrowLeft size={20} />
          <span className="font-medium">Back to Count</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">Reconciliation</h1>
        <div className="w-20" />
      </div>

      {/* Summary Stats */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{matches.length}</p>
            <p className="text-xs text-gray-500">Exact Matches</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-600">{variances.length}</p>
            <p className="text-xs text-gray-500">Variances</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-amber-600">{uncounted.length}</p>
            <p className="text-xs text-gray-500">Uncounted</p>
          </div>
        </div>

        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Total Variance</span>
            <span className={`text-xl font-bold ${totalVarianceValue < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {totalVarianceValue < 0 ? '-' : '+'}${Math.abs(totalVarianceValue).toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">Shrinkage Rate</span>
            <span className="text-sm font-semibold text-red-600">{shrinkageRate.toFixed(2)}%</span>
          </div>
        </div>
      </div>

      {/* Variance List */}
      <div className="flex-1 overflow-y-auto p-4">
        {variances.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <AlertCircle size={16} className="text-red-600" />
              Variances ({variances.length})
            </h2>
            <div className="space-y-2">
              {variances.map(entry => (
                <VarianceCard key={entry.id} entry={entry} />
              ))}
            </div>
          </div>
        )}

        {uncounted.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            <p className="text-sm font-medium text-amber-900">
              {uncounted.length} items not counted yet. Go back to complete the count.
            </p>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <div className="bg-white border-t border-gray-200 p-4 safe-area-bottom">
        <button
          onClick={onSubmit}
          disabled={submitting || uncounted.length > 0}
          className="w-full py-4 bg-red-600 text-white rounded-lg font-semibold text-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Submitting...' : 'Submit & Lock Count'}
        </button>
      </div>
    </div>
  )
}

function VarianceCard({ entry }) {
  const variance = entry.variance
  const isNegative = variance < 0

  return (
    <div className={`border-l-4 ${isNegative ? 'border-red-500' : 'border-green-500'} bg-white rounded-lg p-4 shadow-sm`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">{entry.sku?.product_name}</h3>
          <p className="text-xs text-gray-500 mt-1">SKU: {entry.sku?.sku_code}</p>
        </div>
        <div className="text-right">
          <div className={`flex items-center gap-1 ${isNegative ? 'text-red-600' : 'text-green-600'}`}>
            {isNegative ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
            <span className="text-lg font-bold">{variance > 0 ? '+' : ''}{variance}</span>
          </div>
          <p className={`text-sm font-semibold ${isNegative ? 'text-red-600' : 'text-green-600'}`}>
            {entry.variance_value < 0 ? '-' : '+'}${Math.abs(entry.variance_value || 0).toFixed(2)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-6 mt-3 text-sm">
        <div>
          <span className="text-gray-500">Expected: </span>
          <span className="font-semibold text-gray-900">{entry.expected_quantity}</span>
        </div>
        <div>
          <span className="text-gray-500">Actual: </span>
          <span className="font-semibold text-gray-900">{entry.actual_quantity}</span>
        </div>
      </div>
    </div>
  )
}
