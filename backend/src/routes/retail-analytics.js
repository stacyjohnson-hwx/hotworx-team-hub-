const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')

const { todayInChicago } = require('../utils/dates')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ─── POST /api/retail/analytics/import-sales ────────────────────────────────
// Import sales data from CSV
router.post('/import-sales', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { sales, file_name } = req.body

  if (!sales || !Array.isArray(sales)) {
    return res.status(400).json({ error: 'sales array required' })
  }

  // Check for duplicate date range
  const dates = sales.map(s => new Date(s.date || s['Order Date'])).filter(d => !isNaN(d))
  if (dates.length === 0) {
    return res.status(400).json({ error: 'No valid dates found in sales data' })
  }

  const minDate = new Date(Math.min(...dates)).toISOString().split('T')[0]
  const maxDate = new Date(Math.max(...dates)).toISOString().split('T')[0]

  // Check if this date range overlaps with any existing imports
  const { data: existingBatch } = await db()
    .from('sales_import_batches')
    .select('id, file_name, date_range_start, date_range_end, created_at')
    .eq('studio_id', req.studio.id)
    .or(`date_range_start.lte.${maxDate},date_range_end.gte.${minDate}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingBatch) {
    return res.status(400).json({
      error: 'Duplicate sales import detected',
      message: `Sales data for ${minDate} to ${maxDate} overlaps with existing import "${existingBatch.file_name}" (${existingBatch.date_range_start} to ${existingBatch.date_range_end})`,
      existing_batch: existingBatch,
    })
  }

  // Create import batch
  const { data: batch, error: batchError } = await db()
    .from('sales_import_batches')
    .insert({
      studio_id: req.studio.id,
      file_name,
      imported_by: req.user.id,
      total_rows: sales.length,
    })
    .select()
    .single()

  if (batchError) return res.status(500).json({ error: batchError.message })

  let successful = 0
  let failed = 0
  const errors = []

  for (const sale of sales) {
    try {
      // Extract data with flexible column mapping
      const productName = sale.product_name || sale['Product Name']
      const saleDate = sale.date || sale['Order Date']
      const quantity = parseFloat(sale.quantity || sale.Qty || 1)
      const unitPrice = parseFloat(sale.unit_price || sale.Price || 0)

      if (!productName || !saleDate) {
        errors.push({ row: sale, error: 'Missing product name or date' })
        failed++
        continue
      }

      // Find SKU by product name (case-insensitive)
      const { data: sku } = await db()
        .from('sku_master')
        .select('id')
        .ilike('product_name', productName.trim())
        .limit(1)
        .maybeSingle()

      if (!sku) {
        errors.push({ row: sale, error: `Product "${productName}" not found in catalog` })
        failed++
        continue
      }

      // Insert sale
      await db()
        .from('retail_sales')
        .insert({
          studio_id: req.studio.id,
          sku_id: sku.id,
          sale_date: saleDate,
          quantity: quantity,
          unit_price: unitPrice,
          size_quantities: sale.size_quantities || null,
          imported_by: req.user.id,
          import_batch_id: batch.id,
          raw_data: sale,
        })

      successful++
    } catch (err) {
      errors.push({ row: sale, error: err.message })
      failed++
    }
  }

  // Update batch stats (already calculated at top, just use those values)

  await db()
    .from('sales_import_batches')
    .update({
      successful_rows: successful,
      failed_rows: failed,
      date_range_start: minDate,
      date_range_end: maxDate,
      errors: errors.length > 0 ? errors : null,
    })
    .eq('id', batch.id)

  res.json({ batch_id: batch.id, successful, failed, errors })
})

// ─── GET /api/retail/analytics/sales ────────────────────────────────────────
// Get sales data with optional date filtering
router.get('/sales', authenticate, requireStudio, async (req, res) => {
  const { start_date, end_date } = req.query

  let query = db()
    .from('retail_sales')
    .select(`
      *,
      sku:sku_master(id, sku_code, product_name, image_url, retail_price, category:product_categories(name))
    `)
    .eq('studio_id', req.studio.id)
    .order('sale_date', { ascending: false })

  if (start_date) query = query.gte('sale_date', start_date)
  if (end_date) query = query.lte('sale_date', end_date)

  const { data, error } = await query.limit(500)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── GET /api/retail/analytics/import-batches ───────────────────────────────
// Get import batch history with errors
router.get('/import-batches', authenticate, requireStudio, async (req, res) => {
  const { data, error } = await db()
    .from('sales_import_batches')
    .select('*')
    .eq('studio_id', req.studio.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── GET /api/retail/analytics/shrinkage ────────────────────────────────────
// Get shrinkage analysis
router.get('/shrinkage', authenticate, requireStudio, async (req, res) => {
  const { data, error } = await db()
    .from('shrinkage_analysis')
    .select(`
      *,
      sku:sku_master(id, sku_code, product_name, image_url, retail_price, category:product_categories(name))
    `)
    .eq('studio_id', req.studio.id)
    .order('shrinkage_value', { ascending: true })
    .limit(50)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── POST /api/retail/analytics/calculate-shrinkage ─────────────────────────
// Calculate shrinkage between two count sessions
router.post('/calculate-shrinkage', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { from_session_id, to_session_id } = req.body

  if (!from_session_id || !to_session_id) {
    return res.status(400).json({ error: 'from_session_id and to_session_id required' })
  }

  // Get both sessions
  const { data: fromSession } = await db()
    .from('inventory_count_sessions')
    .select('*, entries:inventory_count_entries(*)')
    .eq('id', from_session_id)
    .single()

  const { data: toSession } = await db()
    .from('inventory_count_sessions')
    .select('*, entries:inventory_count_entries(*)')
    .eq('id', to_session_id)
    .single()

  if (!fromSession || !toSession) {
    return res.status(404).json({ error: 'Session not found' })
  }

  // Get sales between the two dates
  const { data: sales } = await db()
    .from('retail_sales')
    .select('sku_id, quantity')
    .eq('studio_id', req.studio.id)
    .gte('sale_date', fromSession.count_date)
    .lte('sale_date', toSession.count_date)

  // Aggregate sales by SKU
  const salesBySku = {}
  for (const sale of sales || []) {
    salesBySku[sale.sku_id] = (salesBySku[sale.sku_id] || 0) + sale.quantity
  }

  // Calculate shrinkage for each SKU
  const shrinkageRecords = []
  for (const toEntry of toSession.entries) {
    const fromEntry = fromSession.entries.find(e => e.sku_id === toEntry.sku_id)
    if (!fromEntry) continue

    const startingQty = fromEntry.actual_quantity || 0
    const salesQty = salesBySku[toEntry.sku_id] || 0
    const expectedEndingQty = startingQty - salesQty
    const actualEndingQty = toEntry.actual_quantity || 0
    const shrinkageQty = expectedEndingQty - actualEndingQty

    // Get SKU for retail price
    const { data: sku } = await db()
      .from('sku_master')
      .select('retail_price')
      .eq('id', toEntry.sku_id)
      .single()

    const shrinkageValue = shrinkageQty * (sku?.retail_price || 0)
    const shrinkageRate = startingQty > 0 ? Math.abs((shrinkageQty / startingQty) * 100) : 0

    if (shrinkageQty !== 0) {
      shrinkageRecords.push({
        studio_id: req.studio.id,
        sku_id: toEntry.sku_id,
        from_count_session_id: from_session_id,
        to_count_session_id: to_session_id,
        analysis_date: toSession.count_date,
        starting_quantity: startingQty,
        sales_quantity: salesQty,
        expected_ending_quantity: expectedEndingQty,
        actual_ending_quantity: actualEndingQty,
        shrinkage_value: shrinkageValue,
        shrinkage_rate: shrinkageRate,
        // shrinkage_quantity = expected − actual, so POSITIVE = missing units (loss).
        // Only flag genuine losses over $50 (a surplus/overage is not shrinkage).
        flagged: shrinkageQty > 0 && shrinkageValue > 50,
      })
    }
  }

  // Insert shrinkage records
  if (shrinkageRecords.length > 0) {
    const { error } = await db()
      .from('shrinkage_analysis')
      .insert(shrinkageRecords)

    if (error) return res.status(500).json({ error: error.message })
  }

  res.json({ analyzed: shrinkageRecords.length })
})

// ─── GET /api/retail/analytics/dead-stock ───────────────────────────────────
// Get dead stock report
router.get('/dead-stock', authenticate, requireStudio, async (req, res) => {
  const { data, error } = await db()
    .from('dead_stock_analysis')
    .select(`
      *,
      sku:sku_master(id, sku_code, product_name, image_url, retail_price, category:product_categories(name))
    `)
    .eq('studio_id', req.studio.id)
    .in('status', ['slow_mover', 'dead_stock'])
    .order('retail_value', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── POST /api/retail/analytics/calculate-dead-stock ────────────────────────
// Calculate dead stock from sales history
router.post('/calculate-dead-stock', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const today = todayInChicago()
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Get all active SKUs with current inventory
  const { data: skus } = await db()
    .from('sku_master')
    .select(`
      id, sku_code, product_name, retail_price,
      inventory:inventory_levels!sku_id(quantity_on_hand)
    `)
    .eq('active', true)
    .eq('inventory.studio_id', req.studio.id)

  const deadStockRecords = []

  for (const sku of skus || []) {
    const inventory = sku.inventory?.[0]
    const qtyOnHand = inventory?.quantity_on_hand || 0

    if (qtyOnHand === 0) continue // Skip out-of-stock

    // Get last sale date
    const { data: lastSale } = await db()
      .from('retail_sales')
      .select('sale_date')
      .eq('studio_id', req.studio.id)
      .eq('sku_id', sku.id)
      .order('sale_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    const lastSaleDate = lastSale?.sale_date
    const daysSinceLastSale = lastSaleDate
      ? Math.floor((new Date() - new Date(lastSaleDate)) / (24 * 60 * 60 * 1000))
      : 999

    let status = 'active'
    if (daysSinceLastSale >= 90) status = 'dead_stock'
    else if (daysSinceLastSale >= 60) status = 'slow_mover'

    if (status !== 'active') {
      deadStockRecords.push({
        studio_id: req.studio.id,
        sku_id: sku.id,
        analysis_date: today,
        days_since_last_sale: daysSinceLastSale,
        last_sale_date: lastSaleDate,
        quantity_on_hand: qtyOnHand,
        retail_value: qtyOnHand * (sku.retail_price || 0),
        status,
      })
    }
  }

  // Delete old analysis for this studio
  await db()
    .from('dead_stock_analysis')
    .delete()
    .eq('studio_id', req.studio.id)

  // Insert new analysis
  if (deadStockRecords.length > 0) {
    const { error } = await db()
      .from('dead_stock_analysis')
      .insert(deadStockRecords)

    if (error) return res.status(500).json({ error: error.message })
  }

  res.json({ analyzed: deadStockRecords.length })
})

// ─── GET /api/retail/analytics/size-sellthrough/:sku_id ─────────────────────
// Get size sell-through analysis for a specific SKU
router.get('/size-sellthrough/:sku_id', authenticate, requireStudio, async (req, res) => {
  const { data, error } = await db()
    .from('size_sellthrough_analysis')
    .select('*')
    .eq('studio_id', req.studio.id)
    .eq('sku_id', req.params.sku_id)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

// ─── GET /api/retail/analytics/velocity ─────────────────────────────────────
// Get sales velocity (units/day) for all SKUs
router.get('/velocity', authenticate, requireStudio, async (req, res) => {
  const { days = 60 } = req.query
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data: sales } = await db()
    .from('retail_sales')
    .select('sku_id, quantity')
    .eq('studio_id', req.studio.id)
    .gte('sale_date', startDate)

  // Aggregate by SKU
  const velocityBySku = {}
  for (const sale of sales || []) {
    velocityBySku[sale.sku_id] = (velocityBySku[sale.sku_id] || 0) + sale.quantity
  }

  // Calculate daily velocity
  const velocity = Object.entries(velocityBySku).map(([sku_id, total]) => ({
    sku_id,
    total_units: total,
    daily_velocity: (total / days).toFixed(2),
    days_analyzed: days,
  }))

  res.json(velocity)
})

// ─── Shared helpers for the analytics endpoints below ────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const num = (v) => Number(v) || 0
const r1 = (n) => Math.round(n * 10) / 10
const r2 = (n) => Math.round(n * 100) / 100
const moLabel = (ym) => `${MONTHS[parseInt(ym.slice(5, 7)) - 1]} '${ym.slice(2, 4)}`
const monthStart = (monthsBack) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - monthsBack); return d.toISOString().slice(0, 10) }
const SALE_SELECT = 'sale_date, quantity, unit_price, total_price, size_quantities, sku_id, sku:sku_master(id, sku_code, product_name, retail_price, wholesale_cost, active, par_level, reorder_quantity, category:product_categories(name))'
const lineRevenue = (s) => s.total_price != null ? num(s.total_price) : num(s.quantity) * num(s.unit_price)
async function loadSales(sb, sid, start, end) {
  let q = sb.from('retail_sales').select(SALE_SELECT).eq('studio_id', sid)
  if (start) q = q.gte('sale_date', start)
  if (end) q = q.lte('sale_date', end)
  const { data } = await q
  return data || []
}
async function loadInventory(sb, sid) {
  const { data } = await sb.from('inventory_levels')
    .select('quantity_on_hand, size_quantities, sku:sku_master(id, sku_code, product_name, retail_price, wholesale_cost, active, par_level, reorder_quantity, category:product_categories(name))')
    .eq('studio_id', sid)
  return (data || []).filter(r => r.sku && r.sku.active)
}

// ─── GET /trends?months=12 — monthly revenue / units / gross-profit series ────
router.get('/trends', authenticate, requireStudio, async (req, res) => {
  const months = Math.min(Math.max(parseInt(req.query.months) || 12, 1), 36)
  const sales = await loadSales(db(), req.studio.id, monthStart(months - 1), null)
  const by = {}; let unmatched = 0
  for (const s of sales) {
    const ym = String(s.sale_date).slice(0, 7)
    const b = by[ym] || (by[ym] = { revenue: 0, units: 0, cogs: 0 })
    b.revenue += lineRevenue(s); b.units += num(s.quantity); b.cogs += num(s.quantity) * num(s.sku && s.sku.wholesale_cost)
    if (!s.sku) unmatched += num(s.quantity)
  }
  const series = Object.keys(by).sort().map(ym => {
    const b = by[ym], gp = b.revenue - b.cogs
    return { month: ym, label: moLabel(ym), revenue: r2(b.revenue), units: b.units, cogs: r2(b.cogs), gross_profit: r2(gp), margin_pct: b.revenue > 0 ? r1(gp / b.revenue * 100) : null }
  })
  const T = series.reduce((a, s) => ({ revenue: a.revenue + s.revenue, units: a.units + s.units, gross_profit: a.gross_profit + s.gross_profit }), { revenue: 0, units: 0, gross_profit: 0 })
  res.json({ series, totals: { revenue: r2(T.revenue), units: T.units, gross_profit: r2(T.gross_profit), margin_pct: T.revenue > 0 ? r1(T.gross_profit / T.revenue * 100) : null, months: series.length }, unmatched_units: unmatched })
})

// ─── GET /top-sellers?start&end&by=revenue|units&limit=20 ─────────────────────
router.get('/top-sellers', authenticate, requireStudio, async (req, res) => {
  const by = req.query.by === 'units' ? 'units' : 'revenue'
  const limit = Math.min(parseInt(req.query.limit) || 20, 100)
  const sales = await loadSales(db(), req.studio.id, req.query.start || monthStart(11), req.query.end || null)
  const bySku = {}
  for (const s of sales) {
    if (!s.sku) continue
    const k = s.sku.id
    const g = bySku[k] || (bySku[k] = { sku_code: s.sku.sku_code, product_name: s.sku.product_name, category: s.sku.category && s.sku.category.name, units: 0, revenue: 0, margin: 0 })
    const rev = lineRevenue(s)
    g.units += num(s.quantity); g.revenue += rev; g.margin += rev - num(s.quantity) * num(s.sku.wholesale_cost)
  }
  const rows = Object.values(bySku).map(g => ({ ...g, revenue: r2(g.revenue), margin: r2(g.margin) })).sort((a, b) => b[by] - a[by])
  res.json({ by, top: rows.slice(0, limit), bottom: rows.slice(-limit).reverse(), total_products_sold: rows.length })
})

// ─── GET /by-category?start&end — revenue/units/margin per category ───────────
router.get('/by-category', authenticate, requireStudio, async (req, res) => {
  const sales = await loadSales(db(), req.studio.id, req.query.start || monthStart(11), req.query.end || null)
  const byCat = {}
  for (const s of sales) {
    const cat = (s.sku && s.sku.category && s.sku.category.name) || 'Uncategorized'
    const g = byCat[cat] || (byCat[cat] = { category: cat, units: 0, revenue: 0, cogs: 0 })
    g.units += num(s.quantity); g.revenue += lineRevenue(s); g.cogs += num(s.quantity) * num(s.sku && s.sku.wholesale_cost)
  }
  const rows = Object.values(byCat).map(g => ({ category: g.category, units: g.units, revenue: r2(g.revenue), gross_profit: r2(g.revenue - g.cogs), margin_pct: g.revenue > 0 ? r1((g.revenue - g.cogs) / g.revenue * 100) : null })).sort((a, b) => b.revenue - a.revenue)
  res.json(rows)
})

// ─── GET /forecast — velocity-based demand, days-of-supply, reorder list ──────
router.get('/forecast', authenticate, requireStudio, async (req, res) => {
  const WINDOW = 90, LEAD = 21, BUFFER = 14   // trailing window; reorder lead + safety buffer (days)
  const sb = db(), sid = req.studio.id
  const [sales, inventory] = await Promise.all([loadSales(sb, sid, monthStart(3), null), loadInventory(sb, sid)])
  const unitsBySku = {}
  for (const s of sales) if (s.sku) unitsBySku[s.sku.id] = (unitsBySku[s.sku.id] || 0) + num(s.quantity)
  const items = inventory.map(inv => {
    const sku = inv.sku, onHand = num(inv.quantity_on_hand)
    const velocity = (unitsBySku[sku.id] || 0) / WINDOW           // units/day
    const dos = velocity > 0 ? r1(onHand / velocity) : null       // days of supply
    const projected30 = r1(velocity * 30)
    const cover = LEAD + BUFFER
    const target = Math.ceil(velocity * cover)
    let suggested = velocity > 0 ? Math.max(0, target - onHand) : 0
    if (num(sku.par_level) > 0) suggested = Math.max(suggested, num(sku.par_level) - onHand)
    if (num(sku.reorder_quantity) > 0 && suggested > 0) suggested = Math.max(suggested, num(sku.reorder_quantity))
    const risk = velocity === 0 ? (onHand > 0 ? 'no_sales' : 'out_no_sales') : dos < 14 ? 'out_soon' : dos < 30 ? 'low' : 'ok'
    return {
      sku_id: sku.id, sku_code: sku.sku_code, product_name: sku.product_name, category: sku.category && sku.category.name,
      on_hand: onHand, velocity_per_day: r2(velocity), monthly_run_rate: projected30, days_of_supply: dos,
      risk, reorder: velocity > 0 && dos != null && dos < cover, suggested_qty: Math.max(0, suggested),
      suggested_par: velocity > 0 ? Math.ceil(velocity * cover) : null, retail_price: num(sku.retail_price),
    }
  })
  const rank = { out_soon: 0, low: 1, ok: 2, no_sales: 3, out_no_sales: 4 }
  items.sort((a, b) => (rank[a.risk] - rank[b.risk]) || ((a.days_of_supply ?? 1e9) - (b.days_of_supply ?? 1e9)))
  res.json({ items, reorder_count: items.filter(i => i.reorder).length, window_days: WINDOW, lead_days: LEAD, buffer_days: BUFFER })
})

// ─── GET /margin — profitability per product + category, markdown candidates ──
router.get('/margin', authenticate, requireStudio, async (req, res) => {
  const sb = db(), sid = req.studio.id
  const [sales, inventory] = await Promise.all([loadSales(sb, sid, monthStart(11), null), loadInventory(sb, sid)])
  const soldBySku = {}, revBySku = {}
  for (const s of sales) if (s.sku) { soldBySku[s.sku.id] = (soldBySku[s.sku.id] || 0) + num(s.quantity); revBySku[s.sku.id] = (revBySku[s.sku.id] || 0) + lineRevenue(s) }
  const products = inventory.map(inv => {
    const sku = inv.sku, onHand = num(inv.quantity_on_hand)
    const retail = num(sku.retail_price), wholesale = num(sku.wholesale_cost)
    const marginPct = retail > 0 ? r1((retail - wholesale) / retail * 100) : null
    const sold = soldBySku[sku.id] || 0, rev = revBySku[sku.id] || 0
    return {
      sku_id: sku.id, sku_code: sku.sku_code, product_name: sku.product_name, category: sku.category && sku.category.name,
      retail_price: retail, wholesale_cost: wholesale, margin_dollars: r2(retail - wholesale), margin_pct: marginPct,
      units_sold: sold, revenue: r2(rev), gross_profit: r2(rev - sold * wholesale),
      on_hand: onHand, on_hand_value: r2(onHand * retail),
      markdown_candidate: onHand > 0 && sold === 0 && onHand * retail >= 50,
    }
  })
  const catAgg = {}
  for (const p of products) {
    const c = p.category || 'Uncategorized'
    const g = catAgg[c] || (catAgg[c] = { category: c, gross_profit: 0, revenue: 0, on_hand_value: 0 })
    g.gross_profit += p.gross_profit; g.revenue += p.revenue; g.on_hand_value += p.on_hand_value
  }
  const by_category = Object.values(catAgg).map(g => ({ category: g.category, revenue: r2(g.revenue), gross_profit: r2(g.gross_profit), on_hand_value: r2(g.on_hand_value), margin_pct: g.revenue > 0 ? r1(g.gross_profit / g.revenue * 100) : null })).sort((a, b) => b.gross_profit - a.gross_profit)
  const byProfit = [...products].sort((a, b) => b.gross_profit - a.gross_profit)
  res.json({
    by_category,
    most_profitable: byProfit.slice(0, 15),
    markdown_candidates: products.filter(p => p.markdown_candidate).sort((a, b) => b.on_hand_value - a.on_hand_value),
    tied_up_value: r2(products.reduce((a, p) => a + p.on_hand_value, 0)),
  })
})

// ─── GET /sell-through?start&end — sell-through, ABC 80/20, turns, sizes ──────
router.get('/sell-through', authenticate, requireStudio, async (req, res) => {
  const sb = db(), sid = req.studio.id
  const [sales, inventory] = await Promise.all([loadSales(sb, sid, req.query.start || monthStart(11), req.query.end || null), loadInventory(sb, sid)])
  const soldBySku = {}, revBySku = {}, cogs12 = { v: 0 }, sizesSold = {}
  for (const s of sales) {
    if (!s.sku) continue
    soldBySku[s.sku.id] = (soldBySku[s.sku.id] || 0) + num(s.quantity)
    revBySku[s.sku.id] = (revBySku[s.sku.id] || 0) + lineRevenue(s)
    cogs12.v += num(s.quantity) * num(s.sku.wholesale_cost)
    if (s.size_quantities) { const m = sizesSold[s.sku.id] || (sizesSold[s.sku.id] = {}); for (const [sz, q] of Object.entries(s.size_quantities)) m[sz] = (m[sz] || 0) + num(q) }
  }
  const rows = inventory.map(inv => {
    const sku = inv.sku, onHand = num(inv.quantity_on_hand), sold = soldBySku[sku.id] || 0
    return { sku_id: sku.id, sku_code: sku.sku_code, product_name: sku.product_name, category: sku.category && sku.category.name, sold, on_hand: onHand, revenue: r2(revBySku[sku.id] || 0), sell_through_pct: (sold + onHand) > 0 ? r1(sold / (sold + onHand) * 100) : null }
  })
  // ABC by revenue (cumulative share)
  const byRev = [...rows].sort((a, b) => b.revenue - a.revenue)
  const totalRev = byRev.reduce((a, r) => a + r.revenue, 0) || 1
  let cum = 0; const abc = { A: 0, B: 0, C: 0 }
  for (const r of byRev) { cum += r.revenue; const share = cum / totalRev; r.abc = share <= 0.8 ? 'A' : share <= 0.95 ? 'B' : 'C'; abc[r.abc]++ }
  // Inventory turns (annualized): trailing-12-mo COGS ÷ current inventory cost value
  const invCostValue = inventory.reduce((a, inv) => a + num(inv.quantity_on_hand) * num(inv.sku.wholesale_cost), 0)
  const turns = invCostValue > 0 ? r1(cogs12.v / invCostValue) : null
  // Size intelligence: sold vs on-hand per size, flag stockouts / overstock
  const sizeIntel = []
  for (const inv of inventory) {
    const onHandSizes = inv.size_quantities; if (!onHandSizes) continue
    const sold = sizesSold[inv.sku.id] || {}
    for (const [sz, oh] of Object.entries(onHandSizes)) {
      const sQty = num(sold[sz])
      if (sQty === 0 && num(oh) === 0) continue
      sizeIntel.push({ product_name: inv.sku.product_name, size: sz, sold: sQty, on_hand: num(oh), flag: num(oh) === 0 && sQty > 0 ? 'stockout' : sQty === 0 && num(oh) >= 3 ? 'overstock' : null })
    }
  }
  res.json({
    sell_through: byRev,
    abc_counts: abc,
    inventory_turns: turns, inventory_cost_value: r2(invCostValue), trailing_cogs: r2(cogs12.v),
    size_intel: { stockouts: sizeIntel.filter(s => s.flag === 'stockout'), overstock: sizeIntel.filter(s => s.flag === 'overstock') },
  })
})

module.exports = router
