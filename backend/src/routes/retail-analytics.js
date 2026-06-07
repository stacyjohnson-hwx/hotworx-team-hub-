const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ─── POST /api/retail/analytics/import-sales ────────────────────────────────
// Import sales data from CSV
router.post('/import-sales', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { sales, file_name } = req.body

  if (!sales || !Array.isArray(sales)) {
    return res.status(400).json({ error: 'sales array required' })
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
      // Validate SKU exists
      const { data: sku } = await db()
        .from('sku_master')
        .select('id')
        .eq('sku_code', sale.sku_code)
        .single()

      if (!sku) {
        errors.push({ row: sale, error: `SKU ${sale.sku_code} not found` })
        failed++
        continue
      }

      // Insert sale
      await db()
        .from('retail_sales')
        .insert({
          studio_id: req.studio.id,
          sku_id: sku.id,
          sale_date: sale.date,
          quantity: sale.quantity,
          unit_price: sale.unit_price,
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

  // Update batch stats
  const dates = sales.map(s => new Date(s.date)).filter(d => !isNaN(d))
  const minDate = dates.length > 0 ? new Date(Math.min(...dates)).toISOString().split('T')[0] : null
  const maxDate = dates.length > 0 ? new Date(Math.max(...dates)).toISOString().split('T')[0] : null

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
        flagged: shrinkageQty < 0 && Math.abs(shrinkageValue) > 50, // Flag if >$50 loss
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
  const today = new Date().toISOString().split('T')[0]
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

module.exports = router
