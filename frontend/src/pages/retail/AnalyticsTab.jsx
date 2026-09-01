import { useState, useEffect } from 'react'
import { useStudio } from '@/contexts/StudioContext'
import { apiGet, apiPost } from '@/hooks/useApi'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts'
import {
  Upload, TrendingDown, TrendingUp, AlertTriangle, Package, DollarSign, Percent,
  Calendar, CheckCircle, XCircle, BarChart3, Activity, LineChart as LineIcon,
  Boxes, Tags, RefreshCw, Loader2,
} from 'lucide-react'

const $ = (n) => n == null ? '—' : `$${Math.round(n).toLocaleString()}`
const pct = (n) => n == null ? '—' : `${n}%`

export function AnalyticsTab() {
  const { currentStudio } = useStudio()
  const [view, setView] = useState('overview')
  const [months, setMonths] = useState(12)
  const [loading, setLoading] = useState(false)
  const [shrinkageData, setShrinkageData] = useState([])
  const [deadStockData, setDeadStockData] = useState([])
  const [salesData, setSalesData] = useState([])
  const [importBatches, setImportBatches] = useState([])
  const [importResult, setImportResult] = useState(null)
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' })
  const [salesSort, setSalesSort] = useState({ key: 'sale_date', dir: 'desc' })
  const [ym, setYm] = useState({ year: 2026, month: '' })

  // Month/year quick filter → date range, then reload.
  const applyMonthFilter = (year, month) => {
    setYm({ year, month })
    if (!month) setDateFilter({ start: `${year}-01-01`, end: `${year}-12-31` })
    else {
      const mm = String(month).padStart(2, '0')
      const last = new Date(year, Number(month), 0).getDate()
      setDateFilter({ start: `${year}-${mm}-01`, end: `${year}-${mm}-${last}` })
    }
    setTimeout(loadAnalytics, 30)
  }

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

    // Accumulate gross/discount/rewards by month so the Trends chart can stack
    // net + discount + rewards = gross (see retail_monthly_adjustments).
    const adjByMonth = {}
    const sales = lines.slice(1).map(line => {
      const values = parseCSVLine(line).map(v => v.replace(/^["']|["']$/g, ''))
      const obj = {}
      headers.forEach((header, idx) => {
        obj[header] = values[idx]
      })

      // Revenue is NET — actual dollars collected = Price*Qty minus discounts minus
      // rewards redeemed (rewards are tracked separately in Studio Trends, so excluding
      // them here avoids double-counting). unit_price is set so qty*unit_price = net line.
      const qty = parseFloat(obj.Qty || obj.quantity || 1) || 1
      const price = parseFloat(obj.Price || obj.unit_price || 0) || 0
      const discount = parseFloat(obj.Discount || 0) || 0
      const rewards = parseFloat(obj['Rewards Redeemed'] || 0) || 0
      const netLine = Math.max(0, price * qty - discount - rewards)
      const ym = String(obj['Order Date'] || obj.date || '').slice(0, 7)
      if (/^\d{4}-\d{2}$/.test(ym)) {
        const a = adjByMonth[ym] || (adjByMonth[ym] = { gross: 0, discount: 0, rewards: 0 })
        a.gross += price * qty; a.discount += discount; a.rewards += rewards
      }
      return {
        product_name: obj['Product Name'] || obj.product_name,
        date: obj['Order Date'] || obj.date,
        quantity: qty,
        unit_price: qty > 0 ? netLine / qty : netLine,
        member_name: obj['Member name'] || obj.member_name || null,
        gross_amount: Math.round(price * qty * 100) / 100,
        discount,
        rewards,
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
      // Record this file's monthly discount/rewards deltas (only after a real
      // import — duplicate re-uploads throw above and never reach here).
      if (result?.successful > 0 && Object.keys(adjByMonth).length) {
        try {
          await apiPost('/api/retail/analytics/monthly-adjustments', { adjustments: adjByMonth }, currentStudio.id)
        } catch (_) { /* non-fatal: chart still shows net */ }
      }
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
      {/* Header with Actions — only for the import/calc-driven legacy views */}
      {['sales', 'shrinkage', 'dead-stock'].includes(view) && (
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
      )}

      {/* View Selector */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
        <ViewButton active={view === 'overview'} onClick={() => setView('overview')}>
          <LineIcon size={16} /> Trends
        </ViewButton>
        <ViewButton active={view === 'forecast'} onClick={() => setView('forecast')}>
          <Activity size={16} /> Forecast &amp; Reorder
        </ViewButton>
        <ViewButton active={view === 'profit'} onClick={() => setView('profit')}>
          <Percent size={16} /> Profit &amp; Margin
        </ViewButton>
        <ViewButton active={view === 'inventory-intel'} onClick={() => setView('inventory-intel')}>
          <Boxes size={16} /> Inventory Intel
        </ViewButton>
        <ViewButton active={view === 'sales'} onClick={() => setView('sales')}>
          <BarChart3 size={16} /> Sales Data
        </ViewButton>
        <ViewButton active={view === 'shrinkage'} onClick={() => setView('shrinkage')}>
          <TrendingDown size={16} /> Shrinkage
        </ViewButton>
        <ViewButton active={view === 'dead-stock'} onClick={() => setView('dead-stock')}>
          <AlertTriangle size={16} /> Dead Stock
        </ViewButton>
      </div>

      {view === 'overview' && <OverviewView studioId={currentStudio?.id} months={months} setMonths={setMonths} />}
      {view === 'forecast' && <ForecastView studioId={currentStudio?.id} />}
      {view === 'profit' && <ProfitView studioId={currentStudio?.id} />}
      {view === 'inventory-intel' && <InventoryIntelView studioId={currentStudio?.id} />}

      {/* Sales Data View */}
      {view === 'sales' && (
        <div>
          {/* Month / Year quick filter */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <div className="flex flex-wrap gap-3 items-end mb-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                <select value={ym.year} onChange={e => applyMonthFilter(Number(e.target.value), ym.month)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                  {[2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                <select value={ym.month} onChange={e => applyMonthFilter(ym.year, e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                  <option value="">All months</option>
                  {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) =>
                    <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <span className="text-xs text-gray-400 pb-2">or pick a custom range below</span>
            </div>
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

          {/* Sales Table — full spreadsheet detail, sortable, with column totals */}
          {(() => {
            const n = v => parseFloat(v || 0) || 0
            const netOf = s => s.total_price != null ? n(s.total_price) : s.quantity * n(s.unit_price)
            const money = x => `$${x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            const cols = [
              { k: 'sale_date', label: 'Date', align: 'left', val: s => s.sale_date },
              { k: 'member', label: 'Member', align: 'left', val: s => (s.member_name || '').toLowerCase() },
              { k: 'product', label: 'Product', align: 'left', val: s => (s.sku?.product_name || '').toLowerCase() },
              { k: 'quantity', label: 'Qty', align: 'right', val: s => s.quantity },
              { k: 'gross', label: 'Gross', align: 'right', val: s => n(s.gross_amount) },
              { k: 'discount', label: 'Discount', align: 'right', val: s => n(s.discount) },
              { k: 'rewards', label: 'Rewards', align: 'right', val: s => n(s.rewards) },
              { k: 'net', label: 'Net', align: 'right', val: netOf },
            ]
            const active = cols.find(c => c.k === salesSort.key) || cols[0]
            const sorted = [...salesData].sort((a, b) => {
              const va = active.val(a), vb = active.val(b)
              const c = va < vb ? -1 : va > vb ? 1 : 0
              return salesSort.dir === 'asc' ? c : -c
            })
            const T = salesData.reduce((t, s) => ({
              quantity: t.quantity + n(s.quantity), gross: t.gross + n(s.gross_amount),
              discount: t.discount + n(s.discount), rewards: t.rewards + n(s.rewards), net: t.net + netOf(s),
            }), { quantity: 0, gross: 0, discount: 0, rewards: 0, net: 0 })
            const toggle = k => setSalesSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })
            const arrow = k => salesSort.key === k ? (salesSort.dir === 'asc' ? ' ▲' : ' ▼') : ''
            return (
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Sales Transactions</h2>
                    <p className="text-xs text-gray-500 mt-1">{salesData.length} lines{(dateFilter.start || dateFilter.end) && ' (filtered)'} · click any column to sort</p>
                  </div>
                  <div className="text-right text-sm whitespace-nowrap"><span className="text-gray-500">Net </span><span className="font-bold text-gray-900">{money(T.net)}</span></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {cols.map(c => (
                          <th key={c.k} onClick={() => toggle(c.k)}
                            className={`px-4 py-3 text-xs font-semibold uppercase cursor-pointer select-none hover:text-gray-900 ${c.align === 'right' ? 'text-right' : 'text-left'} ${salesSort.key === c.k ? 'text-red-600' : 'text-gray-600'}`}>
                            {c.label}{arrow(c.k)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sorted.map(sale => (
                        <tr key={sale.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{sale.sale_date}</td>
                          <td className="px-4 py-2.5 text-gray-900 whitespace-nowrap">{sale.member_name || '—'}</td>
                          <td className="px-4 py-2.5 text-gray-900">{sale.sku?.product_name || 'Unknown'}</td>
                          <td className="px-4 py-2.5 text-right text-gray-700">{sale.quantity}</td>
                          <td className="px-4 py-2.5 text-right text-gray-600">{money(n(sale.gross_amount))}</td>
                          <td className="px-4 py-2.5 text-right text-amber-600">{n(sale.discount) ? `−${money(n(sale.discount))}` : '—'}</td>
                          <td className="px-4 py-2.5 text-right text-teal-600">{n(sale.rewards) ? `−${money(n(sale.rewards))}` : '—'}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{money(netOf(sale))}</td>
                        </tr>
                      ))}
                    </tbody>
                    {salesData.length > 0 && (
                      <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-gray-900">
                        <tr>
                          <td className="px-4 py-3" colSpan={3}>Total</td>
                          <td className="px-4 py-3 text-right">{T.quantity}</td>
                          <td className="px-4 py-3 text-right">{money(T.gross)}</td>
                          <td className="px-4 py-3 text-right text-amber-700">−{money(T.discount)}</td>
                          <td className="px-4 py-3 text-right text-teal-700">−{money(T.rewards)}</td>
                          <td className="px-4 py-3 text-right">{money(T.net)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                  {salesData.length === 0 && (
                    <div className="p-12 text-center text-gray-500">
                      <BarChart3 size={48} className="mx-auto text-gray-300 mb-3" />
                      <p>No sales data</p>
                      <p className="text-xs text-gray-400 mt-2">{(dateFilter.start || dateFilter.end) ? 'No sales in selected range' : 'Import sales CSV to see transactions'}</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
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

// ─── Sales analytics views (Trends / Forecast / Profit / Inventory Intel) ─────

function useApiData(path, studioId, dep) {
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!studioId) return
    let on = true; setLoading(true)
    apiGet(path, studioId).then(r => { if (on) setD(r) }).catch(() => { if (on) setD(null) }).finally(() => { if (on) setLoading(false) })
    return () => { on = false }
  }, [path, studioId, dep])
  return { d, loading }
}
const startISO = (m) => { if (m >= 36) return ''; const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (m - 1)); return d.toISOString().slice(0, 10) }
const Spin = () => <div className="flex justify-center py-16"><Loader2 className="animate-spin text-red-600" size={26} /></div>

function PeriodPicker({ months, setMonths }) {
  return (
    <select value={months} onChange={e => setMonths(Number(e.target.value))} className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm font-medium">
      <option value={3}>Last 3 months</option>
      <option value={6}>Last 6 months</option>
      <option value={12}>Last 12 months</option>
      <option value={36}>All time</option>
    </select>
  )
}
function Card({ title, children, right }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {(title || right) && <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold text-gray-700">{title}</h3>{right}</div>}
      {children}
    </div>
  )
}

function TrendTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  const row = (lbl, val, cls = '') => (
    <div className="flex justify-between gap-6"><span className="text-gray-500">{lbl}</span><span className={`font-medium ${cls}`}>{val}</span></div>
  )
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-3 py-2 text-xs space-y-0.5">
      <p className="font-semibold text-gray-800 mb-1">{d.label}</p>
      {row('Gross', $(d.gross))}
      {row('Net kept', $(d.revenue), 'text-indigo-600')}
      {row('Discounts', `−${$(d.discount)}${d.discount_pct != null ? ` (${d.discount_pct}%)` : ''}`, 'text-amber-600')}
      {row('Rewards', `−${$(d.rewards)}`, 'text-teal-600')}
      {row('Units', d.units)}
    </div>
  )
}

function OverviewView({ studioId, months, setMonths }) {
  const start = startISO(months)
  const { d: trends, loading } = useApiData(`/api/retail/analytics/trends?months=${months}`, studioId, months)
  const { d: top } = useApiData(`/api/retail/analytics/top-sellers?by=revenue&limit=5&start=${start}`, studioId, months)
  const { d: cats } = useApiData(`/api/retail/analytics/by-category?start=${start}`, studioId, months)
  if (loading) return <Spin />
  const t = trends?.totals || {}
  const series = trends?.series || []
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400">{trends?.unmatched_units ? `${trends.unmatched_units} units of sales aren't matched to a product` : 'All sales matched to products'}</div>
        <PeriodPicker months={months} setMonths={setMonths} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Revenue" value={$(t.revenue)} icon={DollarSign} color="green" />
        <StatCard label="Units sold" value={(t.units ?? 0).toLocaleString()} icon={Package} color="gray" />
        <StatCard label="Gross profit" value={$(t.gross_profit)} icon={TrendingUp} color="green" />
        <StatCard label="Margin" value={pct(t.margin_pct)} icon={Percent} color="amber" />
      </div>
      <Card title="Gross → net retail by month">
        {series.length === 0 ? <p className="text-sm text-gray-400 py-6 text-center">No sales in this period.</p> : (
          <>
            <p className="text-xs text-gray-400 -mt-1 mb-2">Each bar's full height is <b>gross</b>. The indigo base is what you actually kept (<b>net</b>); the amber and teal on top are <b>discounts</b> and <b>rewards</b> given away. Dashed line = units.</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="l" hide /><YAxis yAxisId="r" orientation="right" hide />
                  <Tooltip content={<TrendTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                  <Bar yAxisId="l" stackId="g" dataKey="revenue" name="Net" fill="#6366f1" maxBarSize={46} />
                  <Bar yAxisId="l" stackId="g" dataKey="discount" name="Discounts" fill="#f59e0b" maxBarSize={46} />
                  <Bar yAxisId="l" stackId="g" dataKey="rewards" name="Rewards" fill="#14b8a6" radius={[4, 4, 0, 0]} maxBarSize={46} />
                  <Line yAxisId="r" dataKey="units" name="Units" stroke="#374151" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Card>
      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Top sellers (by revenue)">
          <div className="divide-y divide-gray-50">
            {(top?.top || []).map((r, i) => (
              <div key={r.sku_code} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-gray-700 truncate pr-2"><span className="text-gray-300 mr-1.5">{i + 1}.</span>{r.product_name}</span>
                <span className="font-semibold text-gray-900 whitespace-nowrap">{$(r.revenue)} <span className="text-gray-400 font-normal">· {r.units}u</span></span>
              </div>
            ))}
            {!(top?.top || []).length && <p className="text-sm text-gray-400 py-4">No sales yet.</p>}
          </div>
        </Card>
        <Card title="Sales by category">
          <div className="space-y-1.5">
            {(cats || []).slice(0, 8).map(c => {
              const max = Math.max(...(cats || []).map(x => x.revenue), 1)
              return (
                <div key={c.category}>
                  <div className="flex justify-between text-xs mb-0.5"><span className="text-gray-600 truncate">{c.category}</span><span className="font-semibold text-gray-800">{$(c.revenue)}</span></div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${c.revenue / max * 100}%` }} /></div>
                </div>
              )
            })}
            {!(cats || []).length && <p className="text-sm text-gray-400 py-4">No category sales yet.</p>}
          </div>
        </Card>
      </div>
    </div>
  )
}

const RISK = {
  out_soon: { cls: 'bg-red-100 text-red-700', label: 'Out <2wk' },
  low: { cls: 'bg-amber-100 text-amber-700', label: 'Low' },
  ok: { cls: 'bg-green-100 text-green-700', label: 'OK' },
  no_sales: { cls: 'bg-gray-100 text-gray-500', label: 'No recent sales' },
  out_no_sales: { cls: 'bg-gray-100 text-gray-400', label: 'Out · no sales' },
}
function ForecastView({ studioId }) {
  const { d, loading } = useApiData('/api/retail/analytics/forecast', studioId, 0)
  if (loading) return <Spin />
  const items = d?.items || []
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Need reorder" value={d?.reorder_count ?? 0} icon={RefreshCw} color="red" />
        <StatCard label="Products tracked" value={items.length} icon={Package} color="gray" />
        <StatCard label="Forecast window" value={`${d?.window_days || 90} days`} icon={Calendar} color="gray" />
      </div>
      <p className="text-xs text-gray-400">Run-rate estimate from the last {d?.window_days || 90} days of sales (not seasonal). Reorder = will dip below a {d?.lead_days || 21}+{d?.buffer_days || 14}-day cover before restock.</p>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100"><tr>
              <th className="text-left py-2">Product</th><th className="text-right py-2">On hand</th><th className="text-right py-2">Units/day</th><th className="text-right py-2">~Monthly</th><th className="text-right py-2">Days left</th><th className="text-right py-2">Reorder</th><th className="text-right py-2 pr-1">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {items.map(it => (
                <tr key={it.sku_id} className={it.reorder ? 'bg-red-50/40' : ''}>
                  <td className="py-1.5 text-gray-800">{it.product_name}</td>
                  <td className="py-1.5 text-right text-gray-700">{it.on_hand}</td>
                  <td className="py-1.5 text-right text-gray-500">{it.velocity_per_day}</td>
                  <td className="py-1.5 text-right text-gray-500">{it.monthly_run_rate}</td>
                  <td className="py-1.5 text-right font-semibold text-gray-800">{it.days_of_supply == null ? '—' : Math.round(it.days_of_supply)}</td>
                  <td className="py-1.5 text-right font-bold text-red-600">{it.suggested_qty > 0 ? `+${it.suggested_qty}` : '—'}</td>
                  <td className="py-1.5 text-right pr-1"><span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${RISK[it.risk]?.cls}`}>{RISK[it.risk]?.label}</span></td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={7} className="py-6 text-center text-gray-400">No in-stock products with a forecast yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function ProfitView({ studioId }) {
  const { d, loading } = useApiData('/api/retail/analytics/margin', studioId, 0)
  if (loading) return <Spin />
  const cats = d?.by_category || [], best = d?.most_profitable || [], md = d?.markdown_candidates || []
  const max = Math.max(...cats.map(c => c.gross_profit), 1)
  const rm = d?.real_margin
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="$ tied up in stock" value={$(d?.tied_up_value)} icon={Boxes} color="amber" />
        <StatCard label="Markdown candidates" value={md.length} icon={Tags} color="red" />
        <StatCard label="Categories" value={cats.length} icon={Package} color="gray" />
      </div>
      {rm && (
        <Card title="Real margin (after commission)" right={<span className="text-[11px] text-gray-400">trailing 12 mo</span>}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-100 rounded-lg overflow-hidden mb-3">
            <div className="bg-white p-3"><div className="text-[11px] uppercase text-gray-400 font-semibold">Net revenue</div><div className="text-lg font-bold text-gray-900">{$(rm.net_revenue)}</div></div>
            <div className="bg-white p-3"><div className="text-[11px] uppercase text-gray-400 font-semibold">− Cost of goods</div><div className="text-lg font-bold text-gray-500">{$(rm.cogs)}</div></div>
            <div className="bg-white p-3"><div className="text-[11px] uppercase text-gray-400 font-semibold">− Retail commission</div><div className="text-lg font-bold text-amber-600">{$(rm.retail_commission)}</div></div>
            <div className="bg-green-50 p-3"><div className="text-[11px] uppercase text-green-600 font-semibold">Real profit</div><div className="text-lg font-bold text-green-700">{$(rm.real_profit)}</div></div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div><span className="text-gray-500">Gross margin </span><span className="font-semibold text-gray-800">{pct(rm.gross_margin_pct)}</span></div>
            <div className="text-gray-300">→</div>
            <div><span className="text-gray-500">Real margin after commission </span><span className="font-bold text-green-700">{pct(rm.real_margin_pct)}</span></div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">Net revenue is already after discounts &amp; rewards and excludes sales tax (a pass-through). Real profit = net revenue − wholesale cost of goods sold − retail commission paid to staff.</p>
        </Card>
      )}
      <Card title="Gross profit by category (trailing 12 mo)">
        <div className="space-y-1.5">
          {cats.map(c => (
            <div key={c.category}>
              <div className="flex justify-between text-xs mb-0.5"><span className="text-gray-600 truncate">{c.category} <span className="text-gray-400">· {pct(c.margin_pct)}</span></span><span className="font-semibold text-gray-800">{$(c.gross_profit)}</span></div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.max(0, c.gross_profit) / max * 100}%` }} /></div>
            </div>
          ))}
          {!cats.length && <p className="text-sm text-gray-400 py-4">No sales to compute margin yet.</p>}
        </div>
      </Card>
      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Most profitable products">
          <div className="divide-y divide-gray-50">
            {best.map(p => (
              <div key={p.sku_code} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-gray-700 truncate pr-2">{p.product_name} <span className="text-gray-400">· {pct(p.margin_pct)}</span></span>
                <span className="font-semibold text-green-700 whitespace-nowrap">{$(p.gross_profit)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Markdown candidates" right={<span className="text-[11px] text-gray-400">stock not selling</span>}>
          <div className="divide-y divide-gray-50">
            {md.slice(0, 12).map(p => (
              <div key={p.sku_code} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-gray-700 truncate pr-2">{p.product_name} <span className="text-gray-400">· {p.on_hand} on hand</span></span>
                <span className="font-semibold text-amber-600 whitespace-nowrap">{$(p.on_hand_value)}</span>
              </div>
            ))}
            {!md.length && <p className="text-sm text-gray-400 py-4">Nothing flagged — stock is moving.</p>}
          </div>
        </Card>
      </div>
    </div>
  )
}

function InventoryIntelView({ studioId }) {
  const { d, loading } = useApiData('/api/retail/analytics/sell-through', studioId, 0)
  if (loading) return <Spin />
  const rows = d?.sell_through || [], abc = d?.abc_counts || {}, si = d?.size_intel || {}
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Inventory turns/yr" value={d?.inventory_turns ?? '—'} icon={RefreshCw} color="gray" />
        <StatCard label="A items (80% of rev)" value={abc.A ?? 0} icon={TrendingUp} color="green" />
        <StatCard label="C items (tail)" value={abc.C ?? 0} icon={TrendingDown} color="amber" />
        <StatCard label="Stock cost value" value={$(d?.inventory_cost_value)} icon={Boxes} color="gray" />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Size stockouts" right={<span className="text-[11px] text-gray-400">sold, none left</span>}>
          <div className="divide-y divide-gray-50">
            {(si.stockouts || []).slice(0, 12).map((s, i) => (
              <div key={i} className="flex justify-between py-1.5 text-sm"><span className="text-gray-700 truncate pr-2">{s.product_name} <b>{s.size}</b></span><span className="text-red-600 font-semibold">{s.sold} sold</span></div>
            ))}
            {!(si.stockouts || []).length && <p className="text-sm text-gray-400 py-4">No size stockouts.</p>}
          </div>
        </Card>
        <Card title="Overstocked sizes" right={<span className="text-[11px] text-gray-400">on hand, not selling</span>}>
          <div className="divide-y divide-gray-50">
            {(si.overstock || []).slice(0, 12).map((s, i) => (
              <div key={i} className="flex justify-between py-1.5 text-sm"><span className="text-gray-700 truncate pr-2">{s.product_name} <b>{s.size}</b></span><span className="text-amber-600 font-semibold">{s.on_hand} on hand</span></div>
            ))}
            {!(si.overstock || []).length && <p className="text-sm text-gray-400 py-4">No overstocked sizes.</p>}
          </div>
        </Card>
      </div>
      <Card title="Sell-through by product">
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 sticky top-0 bg-white"><tr>
              <th className="text-left py-2">Product</th><th className="text-center py-2">ABC</th><th className="text-right py-2">Sold</th><th className="text-right py-2">On hand</th><th className="text-right py-2 pr-1">Sell-through</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => (
                <tr key={r.sku_id}>
                  <td className="py-1.5 text-gray-800 truncate max-w-xs">{r.product_name}</td>
                  <td className="py-1.5 text-center"><span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${r.abc === 'A' ? 'bg-green-100 text-green-700' : r.abc === 'B' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{r.abc}</span></td>
                  <td className="py-1.5 text-right text-gray-600">{r.sold}</td>
                  <td className="py-1.5 text-right text-gray-600">{r.on_hand}</td>
                  <td className="py-1.5 text-right font-semibold text-gray-800 pr-1">{pct(r.sell_through_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
