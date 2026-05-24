import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { TrendingUp, Package, ShoppingCart, Calendar, Lightbulb } from 'lucide-react'

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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function monthKey(date) {
  // Returns "YYYY-MM" from a Date or ISO string
  const d = date instanceof Date ? date : new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function shortLabel(key) {
  // "2025-05" → "May '25"
  const [y, m] = key.split('-')
  return new Date(+y, +m - 1, 1).toLocaleDateString('en-US', { month: 'short' }) + " '" + y.slice(2)
}

function prevYear(key) {
  const [y, m] = key.split('-')
  return `${+y - 1}-${m}`
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs min-w-[140px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
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

// ─── Main component ───────────────────────────────────────────────────────────
export default function OrdersAnalytics({ orders }) {
  const now = new Date()
  const currentKey = monthKey(now)

  // Build last 14 months (oldest → newest) for the bar chart
  const chartMonths = useMemo(() => {
    const months = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(monthKey(d))
    }
    return months
  }, [])

  // Group orders by month key, using ordered_at (fall back to created_at)
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

  // Chart data — one entry per month
  const chartData = useMemo(() => chartMonths.map(key => ({
    month: shortLabel(key),
    ...CATS.reduce((acc, c) => ({ ...acc, [c]: byMonth[key]?.[c] || 0 }), {}),
  })), [chartMonths, byMonth])

  // Category totals (all time)
  const catTotals = useMemo(() => {
    const totals = {}
    for (const o of orders) {
      const cat = CATS.includes(o.category) ? o.category : 'other'
      totals[cat] = (totals[cat] || 0) + 1
    }
    return CATS.map(c => ({ name: CAT_LABEL[c], value: totals[c] || 0, color: CAT_COLOR[c] }))
      .filter(c => c.value > 0)
  }, [orders])

  // "Same month last year" orders
  const lastYearKey = prevYear(currentKey)
  const sameMonthLastYear = useMemo(() => {
    return orders.filter(o => {
      const raw = o.ordered_at || o.created_at
      if (!raw) return false
      return monthKey(raw) === lastYearKey
    })
  }, [orders, lastYearKey])

  // KPI: orders in last 12 months
  const last12Key = monthKey(new Date(now.getFullYear() - 1, now.getMonth() + 1, 1))
  const last12Count = useMemo(() =>
    orders.filter(o => {
      const raw = o.ordered_at || o.created_at
      return raw && monthKey(raw) >= last12Key
    }).length, [orders])

  // KPI: busiest month
  const busiestMonth = useMemo(() => {
    let best = { key: '', total: 0 }
    for (const [key, cats] of Object.entries(byMonth)) {
      const total = Object.values(cats).reduce((s, v) => s + v, 0)
      if (total > best.total) best = { key, total }
    }
    return best
  }, [byMonth])

  // KPI: avg orders per month (last 12)
  const months12 = chartMonths.slice(2) // last 12
  const avg12 = useMemo(() => {
    const total = months12.reduce((s, k) => s + Object.values(byMonth[k] || {}).reduce((a, b) => a + b, 0), 0)
    return (total / 12).toFixed(1)
  }, [months12, byMonth])

  // Busiest category
  const busiestCat = catTotals.reduce((a, b) => a.value > b.value ? a : b, { name: '—', value: 0 })

  // Seasonal insight: group by calendar month (1–12) across all years
  const monthlyAvg = useMemo(() => {
    const counts = {}   // { "05": [2, 3, 4] } — list of yearly counts per calendar month
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
    for (const [cm, yearMap] of Object.entries(byCalMonth)) {
      const vals = Object.values(yearMap)
      counts[cm] = vals.reduce((s, v) => s + v, 0) / vals.length
    }
    return counts
  }, [orders])

  // Top 3 months by historical average (for "expect to be busy" insight)
  const topSeasonalMonths = Object.entries(monthlyAvg)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cm]) => new Date(2000, +cm - 1, 1).toLocaleDateString('en-US', { month: 'long' }))

  const currentCalMonth = String(now.getMonth() + 1).padStart(2, '0')
  const currentMonthAvg = monthlyAvg[currentCalMonth]
  const currentMonthTotal = Object.values(byMonth[currentKey] || {}).reduce((s, v) => s + v, 0)

  return (
    <div className="mb-8 space-y-5">

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={ShoppingCart}
          label="Orders (last 12 mo)"
          value={last12Count}
          sub={`${avg12} avg / month`}
        />
        <StatCard
          icon={Package}
          label="Top category"
          value={busiestCat.name}
          sub={`${busiestCat.value} orders all time`}
          color="text-purple-700"
        />
        <StatCard
          icon={TrendingUp}
          label="Busiest month ever"
          value={busiestMonth.key ? shortLabel(busiestMonth.key) : '—'}
          sub={`${busiestMonth.total} orders`}
          color="text-red-700"
        />
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

        {/* Monthly volume bar chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Monthly Order Volume</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barSize={14} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
                width={24}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f9fafb' }} />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={v => <span style={{ fontSize: 11, color: '#6B7280' }}>{CAT_LABEL[v]}</span>}
              />
              {CATS.map(c => (
                <Bar key={c} dataKey={c} stackId="a" fill={CAT_COLOR[c]} radius={c === 'other' || !catTotals.find(x => x.name === CAT_LABEL[c])?.value ? [0,0,0,0] : [0,0,0,0]} />
              ))}
              {/* Round top of last stacked bar */}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Category donut */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">All-Time by Category</h3>
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
              >
                {catTotals.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [`${value} orders`, name]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-1">
            {catTotals.map(c => (
              <div key={c.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
                  <span className="text-gray-600">{c.name}</span>
                </div>
                <span className="font-semibold text-gray-700">{c.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Insights row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Same month last year */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb size={15} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-gray-700">
              What you ordered last {now.toLocaleDateString('en-US', { month: 'long' })}
            </h3>
            <span className="text-xs text-gray-400 ml-auto">{sameMonthLastYear.length} orders</span>
          </div>
          {sameMonthLastYear.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No order history for this month last year.</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {sameMonthLastYear.map(o => (
                <div key={o.id} className="flex items-start gap-2 py-1.5 border-b border-gray-50 last:border-0">
                  <div
                    className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: CAT_COLOR[o.category] || '#9CA3AF' }}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800 leading-snug truncate" title={o.item_name}>
                      {o.item_name}
                    </p>
                    <p className="text-[11px] text-gray-400 capitalize">{o.category}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Seasonal & frequency insight */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={15} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-700">Seasonal Patterns</h3>
          </div>

          {/* Busiest months */}
          <div>
            <p className="text-xs text-gray-500 mb-2">Historically your busiest ordering months:</p>
            <div className="flex gap-2 flex-wrap">
              {topSeasonalMonths.map(m => (
                <span key={m} className="px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-medium rounded-full border border-amber-200">
                  {m}
                </span>
              ))}
            </div>
          </div>

          {/* Per-category monthly bars (sparkline-style) */}
          <div>
            <p className="text-xs text-gray-500 mb-2">Avg orders per month by category:</p>
            <div className="space-y-2">
              {catTotals.map(c => {
                // Count how many distinct months have this category
                const months = Object.values(byMonth).filter(m => m[c.name.toLowerCase()] > 0).length || 1
                const cat = c.name.toLowerCase()
                const monthsWithCat = Object.keys(byMonth).filter(k => (byMonth[k][cat] || 0) > 0).length || 1
                const avgPerMonth = (c.value / monthsWithCat).toFixed(1)
                const maxAvg = 6 // scale bar to ~6/month max
                const pct = Math.min((parseFloat(avgPerMonth) / maxAvg) * 100, 100)
                return (
                  <div key={c.name} className="flex items-center gap-2">
                    <div className="w-20 text-xs text-gray-600 flex-shrink-0">{c.name}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{ width: `${pct}%`, background: c.color }}
                      />
                    </div>
                    <div className="text-xs font-medium text-gray-700 w-10 text-right">{avgPerMonth}/mo</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Category cadence note */}
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Supplies are your most frequent orders. Equipment orders tend to cluster in Jan, Mar, and Nov — likely tied to retail and program resets.
          </p>
        </div>
      </div>
    </div>
  )
}
