import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStudio } from '@/contexts/StudioContext'
import { apiGet, apiPut, apiPost } from '@/hooks/useApi'
import {
  CheckCircle, Circle, AlertCircle, Camera, Flag, ArrowLeft,
  Package, Check, X, DollarSign, TrendingDown, TrendingUp, Calendar, History, Save, Upload,
  Search, ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react'
import { InventoryImportModal } from './InventoryImportModal'

export default function InventoryCountPage() {
  const navigate = useNavigate()
  const { sessionId } = useParams()
  const { currentStudio } = useStudio()
  const [view, setView] = useState('current') // 'current' or 'history'
  const [sessions, setSessions] = useState([])
  const [currentSession, setCurrentSession] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [sortBy, setSortBy] = useState('product_name') // 'product_name' | 'expected' | 'category'
  const [sortDir, setSortDir] = useState('asc') // 'asc' | 'desc'

  useEffect(() => {
    if (currentStudio?.id && sessionId) {
      loadData()
    }
  }, [currentStudio?.id, sessionId])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load the specific session this page was opened for (from the URL)
      const sessionData = await apiGet(`/api/retail/counts/${sessionId}`, currentStudio.id)
      setCurrentSession(sessionData)
      setEntries(sessionData.entries || [])

      // Also load all sessions for the History view
      const allSessions = await apiGet('/api/retail/counts', currentStudio.id)
      setSessions(allSessions)
    } catch (err) {
      console.error('Failed to load:', err)
      alert(`Failed to load inventory count: ${err.message}`)
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

  // Unique category list for the filter dropdown
  const categories = Array.from(
    new Set(entries.map(e => e.sku?.category?.name).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b))

  // Toggle sort: clicking the active column flips direction, otherwise switch column (asc)
  const toggleSort = (column) => {
    if (sortBy === column) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(column)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ column }) => {
    if (sortBy !== column) return <ChevronsUpDown size={14} className="text-gray-300" />
    return sortDir === 'asc'
      ? <ChevronUp size={14} className="text-red-600" />
      : <ChevronDown size={14} className="text-red-600" />
  }

  // Derived list for display only — saving still operates on the full `entries` array
  const displayEntries = entries
    .filter(e => {
      const matchesSearch = !search ||
        e.sku?.product_name?.toLowerCase().includes(search.toLowerCase()) ||
        e.sku?.sku_code?.toLowerCase().includes(search.toLowerCase())
      const matchesCategory = !filterCategory ||
        (e.sku?.category?.name || 'Uncategorized') === filterCategory
      return matchesSearch && matchesCategory
    })
    .sort((a, b) => {
      let cmp = 0
      if (sortBy === 'expected') {
        cmp = (a.expected_quantity || 0) - (b.expected_quantity || 0)
      } else if (sortBy === 'category') {
        cmp = (a.sku?.category?.name || 'Uncategorized')
          .localeCompare(b.sku?.category?.name || 'Uncategorized')
      } else {
        cmp = (a.sku?.product_name || '').localeCompare(b.sku?.product_name || '')
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading inventory...</div>
  }

  if (view === 'history') {
    return <HistoryView sessions={sessions} onBack={() => setView('current')} currentStudio={currentStudio} />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => navigate('/retail?tab=inventory')} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
              <ArrowLeft size={20} />
              <span className="font-medium">Back</span>
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Inventory Count</h1>
            <button onClick={() => setView('history')} className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium">
              <History size={20} />
              <span className="hidden md:inline">View History</span>
            </button>
          </div>

          {/* Count Date & Stats */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                <Calendar size={18} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-700">
                  {currentSession?.count_date
                    ? new Date(currentSession.count_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                    : 'Inventory Count'}
                </span>
                {currentSession?.status === 'submitted' && (
                  <span className="ml-1 inline-flex items-center gap-1 text-xs font-semibold text-green-600">
                    <CheckCircle size={14} /> Submitted
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
              >
                <Upload size={18} />
                Import Inventory
              </button>
            </div>

            {/* Progress Stats */}
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-900">{counted}<span className="text-gray-400">/{total}</span></p>
                <p className="text-xs text-gray-500">Items Counted</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-red-600">{progress}%</p>
                <p className="text-xs text-gray-500">Complete</p>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-red-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Count Table */}
      <div className="px-6 py-6">
        <div className="max-w-7xl mx-auto">
          {/* Search & Filter Toolbar */}
          {entries.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search product name or SKU..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30"
                />
              </div>
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30 min-w-[180px]"
              >
                <option value="">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              {(search || filterCategory) && (
                <button
                  onClick={() => { setSearch(''); setFilterCategory('') }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
                >
                  <X size={16} /> Clear
                </button>
              )}
            </div>
          )}

          {/* Showing count when filtered */}
          {entries.length > 0 && displayEntries.length !== entries.length && (
            <p className="text-sm text-gray-500 mb-2">
              Showing {displayEntries.length} of {entries.length} items
            </p>
          )}

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 350px)' }}>
              <table className="w-full">
                <thead className="bg-gray-50 border-b-2 border-gray-200 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-20">Image</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      <button onClick={() => toggleSort('product_name')} className="flex items-center gap-1 hover:text-gray-900 uppercase tracking-wider">
                        Product Name <SortIcon column="product_name" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-40">
                      <button onClick={() => toggleSort('category')} className="flex items-center gap-1 hover:text-gray-900 uppercase tracking-wider">
                        Category <SortIcon column="category" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-32">SKU</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider w-24">
                      <button onClick={() => toggleSort('expected')} className="flex items-center gap-1 hover:text-gray-900 uppercase tracking-wider ml-auto">
                        Expected <SortIcon column="expected" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider w-32">Actual Count</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider w-24">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {displayEntries.map(entry => {
                    const variance = entry.actual_quantity !== null ? entry.actual_quantity - entry.expected_quantity : null
                    return (
                      <tr key={entry.id} className={`hover:bg-gray-50 transition-colors ${variance !== null && variance !== 0 ? 'bg-amber-50/30' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden shadow-sm">
                            {entry.sku?.image_url ? (
                              <img src={entry.sku.image_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Package size={28} className="text-gray-300" />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-gray-900 font-medium">{entry.sku?.product_name}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
                            {entry.sku?.category?.name || 'Uncategorized'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">{entry.sku?.sku_code}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-lg font-bold text-gray-900">{entry.expected_quantity}</span>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            value={entry.actual_quantity ?? ''}
                            onChange={e => handleActualChange(entry.id, e.target.value)}
                            className="w-28 px-3 py-2 border-2 border-gray-300 rounded-lg text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600"
                            placeholder="—"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {variance !== null ? (
                            <div className="inline-flex items-center gap-1">
                              <span className={`text-lg font-bold ${variance < 0 ? 'text-red-600' : variance > 0 ? 'text-green-600' : 'text-gray-600'}`}>
                                {variance > 0 ? '+' : ''}{variance}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-lg">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {entries.length === 0 && (
              <div className="p-16 text-center text-gray-500">
                <Package size={64} className="mx-auto text-gray-300 mb-4" />
                <p className="text-lg font-semibold text-gray-700 mb-2">No inventory items found</p>
                <p className="text-sm text-gray-500">
                  Import inventory from the Catalog tab first
                </p>
              </div>
            )}

            {entries.length > 0 && displayEntries.length === 0 && (
              <div className="p-16 text-center text-gray-500">
                <Search size={64} className="mx-auto text-gray-300 mb-4" />
                <p className="text-lg font-semibold text-gray-700 mb-2">No items match your filters</p>
                <button
                  onClick={() => { setSearch(''); setFilterCategory('') }}
                  className="text-sm text-red-600 hover:underline mt-1"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>

          {/* Actions */}
          {entries.length > 0 && (
            <div className="flex flex-col md:flex-row gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 px-8 py-4 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 font-semibold text-lg shadow-sm"
              >
                <Save size={22} />
                {saving ? 'Saving...' : 'Save Progress'}
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 px-8 py-4 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-semibold text-lg shadow-sm"
              >
                <CheckCircle size={22} />
                Submit & Lock Count
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <InventoryImportModal
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            setShowImportModal(false)
            loadData() // Reload to show newly imported items
          }}
        />
      )}
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
