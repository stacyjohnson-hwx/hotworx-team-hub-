import { useState, useEffect } from 'react'
import { useStudio } from '@/contexts/StudioContext'
import { apiGet, apiPost } from '@/hooks/useApi'
import {
  Upload, TrendingDown, AlertTriangle, Package, DollarSign,
  Calendar, CheckCircle, XCircle, BarChart3, Activity,
} from 'lucide-react'

export function AnalyticsTab() {
  const { currentStudio } = useStudio()
  const [view, setView] = useState('shrinkage')
  const [loading, setLoading] = useState(false)
  const [shrinkageData, setShrinkageData] = useState([])
  const [deadStockData, setDeadStockData] = useState([])
  const [importResult, setImportResult] = useState(null)

  useEffect(() => {
    if (currentStudio?.id) {
      loadAnalytics()
    }
  }, [currentStudio?.id, view])

  const loadAnalytics = async () => {
    setLoading(true)
    try {
      if (view === 'shrinkage') {
        const data = await apiGet('/api/retail/analytics/shrinkage', currentStudio.id)
        setShrinkageData(data)
      } else if (view === 'dead-stock') {
        const data = await apiGet('/api/retail/analytics/dead-stock', currentStudio.id)
        setDeadStockData(data)
      }
    } catch (err) {
      console.error('Failed to load analytics:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleImportCSV = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const rows = text.split('\n').slice(1) // Skip header
    const sales = rows
      .filter(row => row.trim())
      .map(row => {
        const [date, sku_code, quantity, unit_price] = row.split(',')
        return {
          date: date?.trim(),
          sku_code: sku_code?.trim(),
          quantity: parseInt(quantity?.trim()) || 0,
          unit_price: parseFloat(unit_price?.trim()) || 0,
        }
      })

    setLoading(true)
    try {
      const result = await apiPost(
        '/api/retail/analytics/import-sales',
        { sales, file_name: file.name },
        currentStudio.id
      )
      setImportResult(result)
      alert(`Import complete: ${result.successful} successful, ${result.failed} failed`)
    } catch (err) {
      alert('Import failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCalculateShrinkage = async () => {
    // For demo, use last two submitted count sessions
    const sessions = await apiGet('/api/retail/counts', currentStudio.id)
    const submitted = sessions.filter(s => s.status === 'submitted').slice(0, 2)

    if (submitted.length < 2) {
      alert('Need at least 2 submitted count sessions to calculate shrinkage')
      return
    }

    setLoading(true)
    try {
      await apiPost(
        '/api/retail/analytics/calculate-shrinkage',
        { from_session_id: submitted[1].id, to_session_id: submitted[0].id },
        currentStudio.id
      )
      loadAnalytics()
      alert('Shrinkage calculated successfully')
    } catch (err) {
      alert('Failed to calculate shrinkage: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCalculateDeadStock = async () => {
    setLoading(true)
    try {
      const result = await apiPost('/api/retail/analytics/calculate-dead-stock', {}, currentStudio.id)
      loadAnalytics()
      alert(`Dead stock analysis complete: ${result.analyzed} items flagged`)
    } catch (err) {
      alert('Failed to calculate dead stock: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const totalShrinkageValue = shrinkageData.reduce((sum, item) => sum + (item.shrinkage_value || 0), 0)
  const flaggedShrinkage = shrinkageData.filter(item => item.flagged).length
  const totalDeadStockValue = deadStockData.reduce((sum, item) => sum + (item.retail_value || 0), 0)

  return (
    <div>
      {/* Header with Actions */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* CSV Import */}
          <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer">
            <Upload size={18} />
            <span>Import Sales CSV</span>
            <input
              type="file"
              accept=".csv"
              onChange={handleImportCSV}
              className="hidden"
            />
          </label>

          {/* Calculate Buttons */}
          <button
            onClick={handleCalculateShrinkage}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            <TrendingDown size={18} />
            Calculate Shrinkage
          </button>

          <button
            onClick={handleCalculateDeadStock}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
          >
            <AlertTriangle size={18} />
            Calculate Dead Stock
          </button>
        </div>

        {importResult && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm">
            <p className="font-medium text-gray-900">
              Import Result: {importResult.successful} successful, {importResult.failed} failed
            </p>
            {importResult.errors?.length > 0 && (
              <p className="text-red-600 text-xs mt-1">
                {importResult.errors.length} errors (check console for details)
              </p>
            )}
          </div>
        )}
      </div>

      {/* View Selector */}
      <div className="flex gap-2 mb-4 border-b border-gray-200">
        <ViewButton active={view === 'shrinkage'} onClick={() => setView('shrinkage')}>
          <TrendingDown size={16} /> Shrinkage Analysis
        </ViewButton>
        <ViewButton active={view === 'dead-stock'} onClick={() => setView('dead-stock')}>
          <AlertTriangle size={16} /> Dead Stock
        </ViewButton>
        <ViewButton active={view === 'velocity'} onClick={() => setView('velocity')}>
          <Activity size={16} /> Velocity
        </ViewButton>
      </div>

      {/* Shrinkage View */}
      {view === 'shrinkage' && (
        <div>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <StatCard
              label="Total Shrinkage Value"
              value={`$${Math.abs(totalShrinkageValue).toFixed(2)}`}
              icon={DollarSign}
              color="red"
            />
            <StatCard
              label="Flagged Items"
              value={flaggedShrinkage}
              icon={AlertTriangle}
              color="amber"
            />
            <StatCard
              label="Items Analyzed"
              value={shrinkageData.length}
              icon={Package}
              color="gray"
            />
          </div>

          {/* Shrinkage List */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Shrinkage Heatmap</h2>
              <p className="text-xs text-gray-500 mt-1">Items with unexplained inventory loss</p>
            </div>

            <div className="divide-y divide-gray-200">
              {shrinkageData.map(item => (
                <ShrinkageCard key={item.id} item={item} />
              ))}

              {shrinkageData.length === 0 && (
                <div className="p-12 text-center text-gray-500">
                  <BarChart3 size={48} className="mx-auto text-gray-300 mb-3" />
                  <p>No shrinkage data yet</p>
                  <p className="text-xs text-gray-400 mt-2">
                    Import sales data and calculate shrinkage to see analysis
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dead Stock View */}
      {view === 'dead-stock' && (
        <div>
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <StatCard
              label="Total Dead Stock Value"
              value={`$${totalDeadStockValue.toFixed(2)}`}
              icon={DollarSign}
              color="amber"
            />
            <StatCard
              label="Items Flagged"
              value={deadStockData.length}
              icon={AlertTriangle}
              color="red"
            />
          </div>

          {/* Dead Stock List */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Dead Stock Report</h2>
              <p className="text-xs text-gray-500 mt-1">Items with no recent sales (60+ days)</p>
            </div>

            <div className="divide-y divide-gray-200">
              {deadStockData.map(item => (
                <DeadStockCard key={item.id} item={item} />
              ))}

              {deadStockData.length === 0 && (
                <div className="p-12 text-center text-gray-500">
                  <Package size={48} className="mx-auto text-gray-300 mb-3" />
                  <p>No dead stock found</p>
                  <p className="text-xs text-gray-400 mt-2">
                    Calculate dead stock analysis to see slow-moving items
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Velocity View */}
      {view === 'velocity' && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <Activity size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">Sales velocity analysis coming soon</p>
          <p className="text-sm text-gray-400 mt-2">Units sold per day, days to sell, trending items</p>
        </div>
      )}
    </div>
  )
}

// ─── Components ──────────────────────────────────────────────────────────────

function ViewButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
        active
          ? 'text-red-600 border-b-2 border-red-600'
          : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

function StatCard({ label, value, icon: Icon, color }) {
  const colorClasses = {
    red: 'bg-red-50 text-red-600 border-red-200',
    amber: 'bg-amber-50 text-amber-600 border-amber-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
  }

  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color]}`}>
      <div className="flex items-center gap-3">
        <Icon size={24} />
        <div>
          <p className="text-xs opacity-75">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  )
}

function ShrinkageCard({ item }) {
  const isLoss = item.shrinkage_quantity < 0

  return (
    <div className={`p-4 ${item.flagged ? 'bg-red-50' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex gap-3 flex-1">
          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
            {item.sku?.image_url ? (
              <img src={item.sku.image_url} alt={item.sku.product_name} className="w-full h-full object-cover rounded-lg" />
            ) : (
              <Package size={20} className="text-gray-300" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">{item.sku?.product_name}</h3>
            <p className="text-xs text-gray-500 mt-1">SKU: {item.sku?.sku_code}</p>
            <div className="flex items-center gap-4 mt-2 text-sm">
              <div>
                <span className="text-gray-500">Starting: </span>
                <span className="font-semibold">{item.starting_quantity}</span>
              </div>
              <div>
                <span className="text-gray-500">Sales: </span>
                <span className="font-semibold">{item.sales_quantity}</span>
              </div>
              <div>
                <span className="text-gray-500">Expected: </span>
                <span className="font-semibold">{item.expected_ending_quantity}</span>
              </div>
              <div>
                <span className="text-gray-500">Actual: </span>
                <span className="font-semibold">{item.actual_ending_quantity}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-bold ${isLoss ? 'text-red-600' : 'text-green-600'}`}>
            {isLoss ? '' : '+'}{item.shrinkage_quantity}
          </div>
          <div className={`text-sm font-semibold ${isLoss ? 'text-red-600' : 'text-green-600'}`}>
            {isLoss ? '-' : '+'}${Math.abs(item.shrinkage_value || 0).toFixed(2)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {item.shrinkage_rate?.toFixed(1)}% rate
          </div>
          {item.flagged && (
            <div className="mt-2">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                <AlertTriangle size={12} /> Flagged
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DeadStockCard({ item }) {
  const isDead = item.status === 'dead_stock'

  return (
    <div className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex gap-3 flex-1">
          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
            {item.sku?.image_url ? (
              <img src={item.sku.image_url} alt={item.sku.product_name} className="w-full h-full object-cover rounded-lg" />
            ) : (
              <Package size={20} className="text-gray-300" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">{item.sku?.product_name}</h3>
            <p className="text-xs text-gray-500 mt-1">SKU: {item.sku?.sku_code}</p>
            <div className="flex items-center gap-4 mt-2 text-sm">
              <div className="flex items-center gap-1">
                <Calendar size={14} className="text-gray-400" />
                <span className="text-gray-600">
                  {item.days_since_last_sale} days since last sale
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-gray-900">{item.quantity_on_hand} units</div>
          <div className="text-sm font-semibold text-amber-600">
            ${item.retail_value?.toFixed(2)}
          </div>
          <div className={`mt-2 px-2 py-1 rounded-full text-xs font-semibold inline-block ${
            isDead ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {isDead ? 'Dead Stock' : 'Slow Mover'}
          </div>
        </div>
      </div>
    </div>
  )
}
