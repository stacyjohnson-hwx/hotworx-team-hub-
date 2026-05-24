import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { TrendingUp, Package, ShoppingCart, Calendar, Lightbulb, DollarSign, Store } from 'lucide-react'

// ─── Category config ──────────────────────────────────────────────────────────
const CATS = ['supplies', 'equipment', 'marketing', 'retail', 'other']
const CAT_COLOR = {
  supplies:  '#3B82F6',
  equipment: '#8B5CF6',
  marketing: '#F59E0B',
  retail:    '#10B981',
  other:     '#9CA3AF',
}
const CAT_LABEL = {
  supplies:  'Supplies',
  equipment: 'Equipment',
  marketing: 'Marketing',
  retail:    'Retail',
  other:     'Other',
}

function monthKey(date) {
  const d = date instanceof Date ? date : new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function shortLabel(key) {
  const [y, m] = key.split('-')
  return new Date(+y, +m - 1, 1).toLocaleDateString('en-US', { month: 'short' }) + " '" + y.slice(2)
}
function prevYear(key) {
  const [y, m] = key.split('-')
  return `${+y - 1}-${m}`
}
function fmtCost(v) {
  if (!v && v !== 0) return null
  return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ─── Custom bar tooltip ───────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs min-w-[140px]">
      <p className="font-semibold text-gray-700 mb-2">{label} · click to filter</p>
      {payload.map(p => p.value > 0 && (
        <div key={p.dataKey} className="flex justify-between gap-4 mb-0.5">
          <span style={{ color: p.fill }}>{CAT_LABEL[p.dataKey] || p.dataKey}</span>
          <span className="font-medium text-gray-700">{p.value}</span>
        </div>
      ))}
      <div className="border-t border-gray-100 mt-1.5 pt-1.5 flex justify-between">
        <span className="text-gray-500">Total</span>
        <span className="font-bold text-gray-800">{total}</span>
      </div>
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = 'text-gray-800' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
      <div className="p-2 rounded-lg bg-gray-50">
        <Icon size={18} className="text-gray-500" />
      </div>
      <div>
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <p className={`text-2xl font-bold leading-none ${color}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Clickable hint ───────────────────────────────────────────────────────────
function DrillHint() {
  return <span className="text-[10px] text-gray-400 font-normal ml-1">· click to filter list</span>
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function OrdersAnalytics({ orders, onDrillDown }) {
  const now = new Date()
  const currentKey = monthKey(now)

  // Build last 14 months for bar chart
  const chartMonths = useMemo(() => {
    const months = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(monthKey(d))
    }
    return months
  }, [])

  // Group by month key
  const byMonth = useMemo(() => {
    const map = {}
    for (const o of orders) {
      const raw = o.ordered_at || o.created_at
      if (!raw) continue
      const key = monthKey(raw)
      if (!map[key]) map[key] = {}
      const cat = CATS.includes(o.category) ? o.category : 'other'
      map[key][cat] = (map[key][cat] || 0) + 1
    }
    return map
  }, [orders])

  // Chart data with raw key for drill-down
  const chartData = useMemo(() => chartMonths.map(key => {
    const [y, m] = key.split('-')
    return {
      month: shortLabel(key),
      rawKey: key,
      rawMonth: m,
      rawYear: y,
      ...CATS.reduce((acc, c) => ({ ...acc, [c]: byMonth[key]?.[c] || 0 }), {}),
    }
  }), [chartMonths, byMonth])

  // Category totals (all time)
  const catTotals = useMemo(() => {
    const totals = {}
    const costs = {}
    for (const o of orders) {
      const cat = CATS.includes(o.category) ? o.category : 'other'
      totals[cat] = (totals[cat] || 0) + 1
      if (o.est_cost) costs[cat] = (costs[cat] || 0) + Number(o.est_cost)
    }
    return CATS.map(c => ({
      name: CAT_LABEL[c],
      key: c,
      value: totals[c] || 0,
      cost: costs[c] || null,
      color: CAT_COLOR[c],
    })).filter(c => c.value > 0)
  }, [orders])

  // Cost stats
  const costOrders = orders.filter(o => o.est_cost)
  const totalTrackedCost = costOrders.reduce((s, o) => s + Number(o.est_cost), 0)

  // Top vendors
  const topVendors = useMemo(() => {
    const map = {}
    for (const o of orders) {
      if (!o.vendor?.trim()) continue
      const v = o.vendor.trim()
      if (!map[v]) map[v] = { count: 0, cost: 0 }
      map[v].count++
      if (o.est_cost) map[v].cost += Number(o.est_cost)
    }
    return Object.entries(map)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([vendor, { count, cost }]) => ({ vendor, count, cost: cost || null }))
  }, [orders])

  // Same month last year
  const lastYearKey = prevYear(currentKey)
  const sameMonthLastYear = useMemo(() =>
    orders.filter(o => {
      const raw = o.ordered_at || o.created_at
      return raw && monthKey(raw) === lastYearKey
    }), [orders, lastYearKey])

  // KPIs
  const last12Key = monthKey(new Date(now.getFullYear() - 1, now.getMonth() + 1, 1))
  const last12Count = useMemo(() =>
    orders.filter(o => {
      const raw = o.ordered_at || o.created_at
      return raw && monthKey(raw) >= last12Key
    }).length, [orders])

  const busiestMonth = useMemo(() => {
    let best = { key: '', total: 0 }
    for (const [key, cats] of Object.entries(byMonth)) {
      const total = Object.values(cats).reduce((s, v) => s + v, 0)
      if (total > best.total) best = { key, total }
    }
    return best
  }, [byMonth])

  const months12 = chartMonths.slice(2)
  const avg12 = useMemo(() => {
    const total = months12.reduce((s, k) => s + Object.values(byMonth[k] || {}).reduce((a, b) => a + b, 0), 0)
    return (total / 12).toFixed(1)
  }, [months12, byMonth])

  const busiestCat = catTotals.reduce((a, b) => a.value > b.value ? a : b, { name: '—', value: 0 })

  const currentCalMonth = String(now.getMonth() + 1).padStart(2, '0')
  const monthlyAvg = useMemo(() => {
    const byCalMonth = {}
    for (const o of orders) {
      const raw = o.ordered_at || o.created_at
      if (!raw) continue
      const d = new Date(raw)
      const cm = String(d.getMonth() + 1).padStart(2, '0')
      const yr = d.getFullYear()
      if (!byCalMonth[cm]) byCalMonth[cm] = {}
      byCalMonth[cm][yr] = (byCalMonth[cm][yr] || 0) + 1
    }
    const counts = {}
    for (const [cm, yearMap] of Object.entries(byCalMonth)) {
      const vals = Object.values(yearMap)
      counts[cm] = vals.reduce((s, v) => s + v, 0) / vals.length
    }
    return counts
  }, [orders])

  const topSeasonalMonths = Object.entries(monthlyAvg)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cm]) => new Date(2000, +cm - 1, 1).toLocaleDateString('en-US', { month: 'long' }))

  const currentMonthTotal = Object.values(byMonth[currentKey] || {}).reduce((s, v) => s + v, 0)
  const currentMonthAvg = monthlyAvg[currentCalMonth]

  // Max vendor count for bar scaling
  const maxVendorCount = topVendors[0]?.count || 1

  // ── Drill-down handlers ──
  const drill = (filters) => onDrillDown?.(filters)

  return (
    <div className="mb-8 space-y-5">

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={ShoppingCart} label="Orders (last 12 mo)" value={last12Count} sub={`${avg12} avg / month`} />
        <StatCard icon={Package} label="Top category" value={busiestCat.name} sub={`${busiestCat.value} orders all time`} color="text-purple-700" />
        <StatCard icon={TrendingUp} label="Busiest month ever" value={busiestMonth.key ? shortLabel(busiestMonth.key) : '—'} sub={`${busiestMonth.total} orders`} color="text-red-700" />
        <StatCard
          icon={Calendar}
          label="This month so far"
          value={currentMonthTotal}
          sub={currentMonthAvg ? `Typical: ${currentMonthAvg.toFixed(1)} orders` : undefined}
          color={currentMonthTotal >= (currentMonthAvg || 0) ? 'text-green-700' : 'text-gray-800'}
        />
      </div>

      {/* ── Chart + Donut row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Monthly volume bar chart — bars are clickable */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Monthly Order Volume <DrillHint />
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={chartData}
              barSize={14}
              barCategoryGap="30%"
              onClick={({ activePayload, activeLabel }) => {
                if (!activePayload?.length) return
                const entry = chartData.find(d => d.month === activeLabel)
                if (entry) drill({ month: entry.rawMonth, year: entry.rawYear, monthFilter: entry.rawMonth, yearFilter: entry.rawYear })
              }}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={24} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f9fafb' }} />
              <Legend iconType="circle" iconSize={8} formatter={v => <span style={{ fontSize: 11, color: '#6B7280' }}>{CAT_LABEL[v]}</span>} />
              {CATS.map(c => <Bar key={c} dataKey={c} stackId="a" fill={CAT_COLOR[c]} />)}
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-gray-400 mt-1">Click a month bar to filter the list below</p>
        </div>

        {/* Category donut — slices are clickable */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            By Category <DrillHint />
          </h3>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie
                data={catTotals}
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={62}
                paddingAngle={3}
                dataKey="value"
                onClick={(entry) => drill({ category: entry.key, monthFilter: '', yearFilter: '' })}
                style={{ cursor: 'pointer' }}
              >
                {catTotals.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip formatter={(value, name) => [`${value} orders`, name]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-1">
            {catTotals.map(c => (
              <button
                key={c.key}
                onClick={() => drill({ category: c.key, monthFilter: '', yearFilter: '' })}
                className="w-full flex items-center justify-between text-xs hover:bg-gray-50 rounded px-1 py-0.5 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
                  <span className="text-gray-600 group-hover:text-gray-900">{c.name}</span>
                </div>
                <span className="font-semibold text-gray-700">{c.value}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Cost + Vendors row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Cost by category */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <DollarSign size={15} className="text-green-500" />
              <h3 className="text-sm font-semibold text-gray-700">Cost by Category</h3>
            </div>
            {totalTrackedCost > 0 && (
              <span className="text-xs text-gray-400">{fmtCost(totalTrackedCost)} tracked total</span>
            )}
          </div>
          {costOrders.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-xs text-gray-400">No cost data yet.</p>
              <p className="text-[11px] text-gray-300 mt-1">Add estimated costs when requesting orders to see spend breakdowns here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {catTotals.map(c => {
                const maxCost = Math.max(...catTotals.map(x => x.cost || 0))
                const pct = maxCost > 0 && c.cost ? Math.round((c.cost / maxCost) * 100) : 0
                return (
                  <button
                    key={c.key}
                    onClick={() => drill({ category: c.key, monthFilter: '', yearFilter: '' })}
                    className="w-full text-left group"
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-600 group-hover:text-gray-900 font-medium">{c.name}</span>
                      <span className="font-semibold text-gray-700">
                        {c.cost ? fmtCost(c.cost) : <span className="text-gray-300 font-normal">no cost data</span>}
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{ width: `${pct}%`, background: c.color, opacity: c.cost ? 1 : 0.15 }}
                      />
                    </div>
                  </button>
                )
              })}
              <p className="text-[11px] text-gray-400 pt-1">
                Based on {costOrders.length} of {orders.length} orders with cost entered
              </p>
            </div>
          )}
        </div>

        {/* Top vendors */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Store size={15} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-700">Top Vendors <DrillHint /></h3>
          </div>
          {topVendors.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No vendor data yet. Add vendors when requesting orders.</p>
          ) : (
            <div className="space-y-2">
              {topVendors.map(({ vendor, count, cost }) => (
                <button
                  key={vendor}
                  onClick={() => drill({ vendor, monthFilter: '', yearFilter: '', category: '' })}
                  className="w-full flex items-center gap-3 hover:bg-gray-50 rounded-lg px-2 py-1.5 transition-colors group text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-gray-800 truncate group-hover:text-gray-900">{vendor}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full bg-blue-400 group-hover:bg-blue-500 transition-colors"
                        style={{ width: `${Math.round((count / maxVendorCount) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs font-bold text-gray-700">{count} orders</p>
                    {cost ? <p className="text-[10px] text-green-600">{fmtCost(cost)}</p> : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Insights row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Same month last year — header is clickable */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb size={15} className="text-amber-500" />
            <button
              onClick={() => {
                const [y, m] = lastYearKey.split('-')
                drill({ monthFilter: m, yearFilter: y, month: m, year: y, category: '', vendor: '' })
              }}
              className="text-sm font-semibold text-gray-700 hover:text-amber-600 transition-colors text-left"
            >
              What you ordered last {now.toLocaleDateString('en-US', { month: 'long' })}
              <DrillHint />
            </button>
            <span className="text-xs text-gray-400 ml-auto">{sameMonthLastYear.length} orders</span>
          </div>
          {sameMonthLastYear.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No order history for this month last year.</p>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {sameMonthLastYear.map(o => (
                <div key={o.id} className="flex items-start gap-2 py-1.5 border-b border-gray-50 last:border-0">
                  <div className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0" style={{ background: CAT_COLOR[o.category] || '#9CA3AF' }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-800 leading-snug truncate" title={o.item_name}>{o.item_name}</p>
                    <p className="text-[11px] text-gray-400 capitalize">{o.category}{o.vendor ? ` · ${o.vendor}` : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Seasonal patterns */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={15} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-700">Seasonal Patterns</h3>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2">Historically your busiest ordering months:</p>
            <div className="flex gap-2 flex-wrap">
              {topSeasonalMonths.map(m => (
                <span key={m} className="px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-medium rounded-full border border-amber-200">{m}</span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2">Avg orders per month by category:</p>
            <div className="space-y-2">
              {catTotals.map(c => {
                const cat = c.key
                const monthsWithCat = Object.keys(byMonth).filter(k => (byMonth[k][cat] || 0) > 0).length || 1
                const avgPerMonth = (c.value / monthsWithCat).toFixed(1)
                const pct = Math.min((parseFloat(avgPerMonth) / 6) * 100, 100)
                return (
                  <div key={c.key} className="flex items-center gap-2">
                    <div className="w-20 text-xs text-gray-600 flex-shrink-0">{c.name}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: c.color }} />
                    </div>
                    <div className="text-xs font-medium text-gray-700 w-10 text-right">{avgPerMonth}/mo</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
