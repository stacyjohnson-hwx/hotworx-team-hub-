import { useState, useEffect } from 'react'
import { useStudio } from '@/contexts/StudioContext'
import { apiGet, apiPost } from '@/hooks/useApi'
import {
  Upload, TrendingDown, AlertTriangle, Package, DollarSign,
  Calendar, CheckCircle, XCircle, BarChart3, Activity,
} from 'lucide-react'

export function AnalyticsTab() {
  const { currentStudio } = useStudio()
  const [view, setView] = useState('sales')
  const [loading, setLoading] = useState(false)
  const [shrinkageData, setShrinkageData] = useState([])
  const [deadStockData, setDeadStockData] = useState([])
  const [salesData, setSalesData] = useState([])
  const [importBatches, setImportBatches] = useState([])
  const [importResult, setImportResult] = useState(null)
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' })

  useEffect(() => {
    if (currentStudio?.id) {
      loadAnalytics()
    }
  }, [currentStudio?.id, view])

  const loadAnalytics = async () => {
    setLoading(true)
    try {
      if (view === 'sales') {
        const params = new URLSearchParams()
        if (dateFilter.start) params.append('start_date', dateFilter.start)
        if (dateFilter.end) params.append('end_date', dateFilter.end)
        const data = await apiGet(`/api/retail/analytics/sales?${params}`, currentStudio.id)
        setSalesData(data)

        const batches = await apiGet('/api/retail/analytics/import-batches', currentStudio.id)
        setImportBatches(batches)
      } else if (view === 'shrinkage') {
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

    // Parse CSV with quoted fields
    const parseCSVLine = (line) => {
      const result = []
      let current = ''
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      result.push(current.trim())
      return result
    }

    const lines = text.split('\n').filter(l => l.trim())
    const headers = parseCSVLine(lines[0]).map(h => h.replace(/^["']|["']$/g, ''))

    const sales = lines.slice(1).map(line => {
      const values = parseCSVLine(line).map(v => v.replace(/^["']|["']$/g, ''))
      const obj = {}
      headers.forEach((header, idx) => {
        obj[header] = values[idx]
      })

      // Map columns flexibly
      return {
        product_name: obj['Product Name'] || obj.product_name,
        date: obj['Order Date'] || obj.date,
        quantity: parseFloat(obj.Qty || obj.quantity || 1),
        unit_price: parseFloat(obj.Price || obj.unit_price || 0),
      }
    }).filter(s => s.product_name && s.date)

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

  // shrinkage_quantity = expected − actual → POSITIVE means missing (a real loss);
  // negative is a surplus/overage, not shrinkage. Derive here so existing records
  // (which stored the old, inverted flag) display correctly without recalculating.
  const isRealLoss = (item) => (item.shrinkage_value || 0) > 50
  const totalShrinkageValue = shrinkageData.reduce((sum, item) => sum + Math.max(0, item.shrinkage_value || 0), 0)
  const flaggedShrinkage = shrinkageData.filter(isRealLoss).length
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
        <ViewButton active={view === 'sales'} onClick={() => setView('sales')}>
          <BarChart3 size={16} /> Sales Data
        </ViewButton>
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

      {/* Sales Data View */}
      {view === 'sales' && (
        <div>
          {/* Date Range Filter */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={dateFilter.start}
                  onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/30"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={dateFilter.end}
                  onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/30"
                />
              </div>
              <button
                onClick={loadAnalytics}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Filter
              </button>
              <button
                onClick={() => { setDateFilter({ start: '', end: '' }); setTimeout(loadAnalytics, 100) }}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Import Batches */}
          <div className="bg-white rounded-lg border border-gray-200 mb-4">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Import History</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {importBatches.map(batch => (
                <div key={batch.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{batch.file_name}</p>
                      <p className="text-sm text-gray-600">
                        {batch.date_range_start} to {batch.date_range_end} • {batch.total_rows} rows
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        <span className="text-green-600 font-medium">{batch.successful_rows} successful</span>
                        {' • '}
                        <span className="text-red-600 font-medium">{batch.failed_rows} failed</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Imported {new Date(batch.created_at).toLocaleString()}
                      </p>
                    </div>
                    {batch.errors && batch.errors.length > 0 && (
                      <details className="ml-4">
                        <summary className="cursor-pointer text-sm text-red-600 font-medium">
                          View {batch.errors.length} Errors
                        </summary>
                        <div className="mt-2 p-3 bg-red-50 rounded border border-red-200 text-xs space-y-1 max-h-48 overflow-y-auto">
                          {batch.errors.map((err, idx) => (
                            <div key={idx} className="text-red-800">
                              <span className="font-semibold">{err.row?.product_name || err.row?.['Product Name'] || 'Unknown'}:</span> {err.error}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              ))}
              {importBatches.length === 0 && (
                <div className="p-12 text-center text-gray-500">
                  <Upload size={48} className="mx-auto text-gray-300 mb-3" />
                  <p>No imports yet</p>
                  <p className="text-xs text-gray-400 mt-2">
                    Upload a sales CSV to get started
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Sales Table */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Sales Transactions</h2>
              <p className="text-xs text-gray-500 mt-1">
                Showing {salesData.length} transactions
                {(dateFilter.start || dateFilter.end) && ' (filtered)'}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Product</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Qty</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Unit Price</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {salesData.map(sale => (
                    <tr key={sale.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900">{sale.sale_date}</td>
                      <td className="px-4 py-3 text-gray-900">{sale.sku?.product_name || 'Unknown'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{sale.quantity}</td>
                      <td className="px-4 py-3 text-right text-gray-600">${parseFloat(sale.unit_price || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        ${(sale.quantity * parseFloat(sale.unit_price || 0)).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {salesData.length === 0 && (
                <div className="p-12 text-center text-gray-500">
                  <BarChart3 size={48} className="mx-auto text-gray-300 mb-3" />
                  <p>No sales data</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {(dateFilter.start || dateFilter.end) ? 'No sales in selected date range' : 'Import sales CSV to see transactions'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
                  <p className="font-semibold text-gray-700">No shrinkage data calculated yet</p>
                  <div className="mt-4 text-sm text-gray-600 max-w-md mx-auto text-left space-y-2">
                    <p className="font-medium">To calculate shrinkage, you need:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>At least 2 completed inventory counts (go to Counts tab)</li>
                      <li>Sales data imported (go to Sales Data tab)</li>
                      <li>Click "Calculate Shrinkage" button above</li>
                    </ol>
                    <p className="text-xs text-gray-500 mt-3">
                      Shrinkage = (Starting Inventory - Ending Inventory) - Sales
                    </p>
                  </div>
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
                  <p className="font-semibold text-gray-700">No dead stock calculated yet</p>
                  <div className="mt-4 text-sm text-gray-600 max-w-md mx-auto text-left space-y-2">
                    <p className="font-medium">To calculate dead stock:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Import sales data (go to Sales Data tab)</li>
                      <li>Click "Calculate Dead Stock" button above</li>
                    </ol>
                    <p className="text-xs text-gray-500 mt-3">
                      Dead stock = items with no sales in the last 90 days
                    </p>
                  </div>
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
  // Show the change vs expected from the user's view: negative = units missing
  // (loss, red), positive = extra units found (surplus, green).
  const unitsDelta = -(item.shrinkage_quantity || 0)          // actual − expected
  const valueDelta = -(item.shrinkage_value || 0)             // + = gain, − = loss
  const isLoss = unitsDelta < 0
  const flagged = isLoss && (item.shrinkage_value || 0) > 50

  return (
    <div className={`p-4 ${flagged ? 'bg-red-50' : ''}`}>
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
            {unitsDelta > 0 ? '+' : ''}{unitsDelta}
          </div>
          <div className={`text-sm font-semibold ${isLoss ? 'text-red-600' : 'text-green-600'}`}>
            {valueDelta >= 0 ? '+' : '-'}${Math.abs(valueDelta).toFixed(2)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {item.shrinkage_rate?.toFixed(1)}% rate
          </div>
          {flagged && (
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
