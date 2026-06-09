const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ─── POST /api/retail/import/inventory ──────────────────────────────────────
// Import inventory from your existing Excel export format
router.post('/inventory', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { items, count_date, source } = req.body

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'items array required' })
  }

  let created = 0
  let updated = 0
  let skipped = 0
  let errors = []

  // Track SKUs we've already seen in this import to deduplicate
  const seenSkus = new Set()

  for (const item of items) {
    try {
      // Extract data from your format (handles both Excel inventory export and CSV catalog)
      const productName = item.product_name || item['Product Name'] || item.name || item.Name
      const skuCode = (item.sku_code || item['SKU Code'] || item.sku || item.SKU)?.trim()
      const wholesaleRate = parseFloat(item.wholesale_rate || item['Wholesale Rate'] || item['Wholesale Price'] || item.wholesale_cost || 0) || 0
      const retailRate = parseFloat(item.retail_rate || item['Retail Rate'] || item.retail_price || item.Price || 0) || 0
      const quantity = parseInt(item.quantity || item.Quantity || item.Qty || 0) || 0
      const imageUrl = item.image_url || item['Image URL']
      // Note: category is NOT saved - would need category_id (UUID) instead

      if (!skuCode) {
        errors.push({ item, error: 'Missing SKU code' })
        continue
      }

      // Deduplicate: skip if we've already processed this SKU in this import
      if (seenSkus.has(skuCode)) {
        skipped++
        continue
      }
      seenSkus.add(skuCode)

      // Check if SKU already exists
      const { data: existingSku } = await db()
        .from('sku_master')
        .select('id')
        .eq('sku_code', skuCode)
        .maybeSingle()

      let skuId

      if (existingSku) {
        // Update existing SKU (merge data, keep existing if new data is empty)
        const updateData = {
          active: true, // Always set active when importing
          updated_at: new Date().toISOString(),
        }

        if (productName) updateData.product_name = productName
        if (retailRate > 0) updateData.retail_price = retailRate
        if (wholesaleRate > 0) updateData.wholesale_cost = wholesaleRate
        if (imageUrl) updateData.image_url = imageUrl

        await db()
          .from('sku_master')
          .update(updateData)
          .eq('id', existingSku.id)

        skuId = existingSku.id
        updated++
      } else {
        // Create new SKU
        const { data: newSku, error: skuError } = await db()
          .from('sku_master')
          .insert({
            sku_code: skuCode,
            product_name: productName || 'Unknown Product',
            retail_price: retailRate,
            wholesale_cost: wholesaleRate,
            image_url: imageUrl || null,
            active: true,
            created_by: req.user.id,
          })
          .select('id')
          .single()

        if (skuError) {
          errors.push({ item, error: skuError.message })
          continue
        }

        skuId = newSku.id
        created++
      }

      // Update inventory level for this studio
      await db()
        .from('inventory_levels')
        .upsert({
          sku_id: skuId,
          studio_id: req.studio.id,
          quantity_on_hand: quantity,
          last_count_date: count_date || new Date().toISOString().split('T')[0],
          last_updated_by: req.user.id,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'sku_id,studio_id'
        })

    } catch (err) {
      errors.push({ item, error: err.message })
    }
  }

  res.json({
    total: items.length,
    created,
    updated,
    skipped, // Duplicates within this import
    errors: errors.length,
    error_details: errors.length > 0 ? errors.slice(0, 10) : [], // First 10 errors
  })
})

// ─── POST /api/retail/import/sales ──────────────────────────────────────────
// Import sales data with duplicate month detection
router.post('/sales', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { sales, file_name, month, year } = req.body

  if (!sales || !Array.isArray(sales)) {
    return res.status(400).json({ error: 'sales array required' })
  }

  // Check if this month already has sales data
  const { data: existingSales, error: checkError } = await db()
    .from('retail_sales')
    .select('id')
    .eq('studio_id', req.studio.id)
    .gte('sale_date', `${year}-${String(month).padStart(2, '0')}-01`)
    .lt('sale_date', `${year}-${String(month + 1).padStart(2, '0')}-01`)
    .limit(1)

  if (checkError) return res.status(500).json({ error: checkError.message })

  if (existingSales && existingSales.length > 0) {
    return res.status(409).json({
      error: 'duplicate_month',
      message: `Sales data for ${year}-${String(month).padStart(2, '0')} already exists. Delete existing data first or use a different month.`,
      month,
      year,
    })
  }

  // Use existing analytics import
  return await require('./retail-analytics').importSales(req, res)
})

// ─── POST /api/retail/import/check-duplicate ───────────────────────────────
// Check if month already has data (for inventory or sales)
router.post('/check-duplicate', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { month, year, type } = req.body // type: 'sales' or 'inventory'

  if (!month || !year || !type) {
    return res.status(400).json({ error: 'month, year, and type required' })
  }

  let hasDuplicate = false
  let existingCount = 0

  if (type === 'sales') {
    const { data } = await db()
      .from('retail_sales')
      .select('id')
      .eq('studio_id', req.studio.id)
      .gte('sale_date', `${year}-${String(month).padStart(2, '0')}-01`)
      .lt('sale_date', `${year}-${String(month + 1).padStart(2, '0')}-01`)

    hasDuplicate = data && data.length > 0
    existingCount = data?.length || 0
  } else if (type === 'inventory') {
    const { data } = await db()
      .from('inventory_levels')
      .select('id')
      .eq('studio_id', req.studio.id)
      .eq('last_count_date', `${year}-${String(month).padStart(2, '0')}-01`)

    hasDuplicate = data && data.length > 0
    existingCount = data?.length || 0
  }

  res.json({
    has_duplicate: hasDuplicate,
    existing_count: existingCount,
    month,
    year,
    type,
  })
})

// ─── POST /api/retail/import/preview ────────────────────────────────────────
// Preview what would be imported (without saving)
router.post('/preview', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { items } = req.body

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'items array required' })
  }

  let newSkus = 0
  let existingSkus = 0
  const preview = []

  for (const item of items.slice(0, 20)) { // Preview first 20
    // Use flexible column mapping (same as main import)
    const productName = item.product_name || item['Product Name'] || item.name || item.Name
    const skuCode = (item.sku_code || item['SKU Code'] || item.sku || item.SKU)?.trim()
    const quantity = parseInt(item.quantity || item.Quantity || item.Qty || 0) || 0

    if (!skuCode) continue

    const { data: existing } = await db()
      .from('sku_master')
      .select('id, product_name')
      .eq('sku_code', skuCode)
      .maybeSingle()

    if (existing) {
      existingSkus++
      preview.push({
        sku_code: skuCode,
        product_name: productName,
        quantity: quantity,
        status: 'update',
        existing_name: existing.product_name,
      })
    } else {
      newSkus++
      preview.push({
        sku_code: skuCode,
        product_name: productName,
        quantity: quantity,
        status: 'new',
      })
    }
  }

  res.json({
    total: items.length,
    new_skus: newSkus,
    existing_skus: existingSkus,
    preview,
  })
})

module.exports = router
