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
      const productName = item.product_name || item.name || item.Name
      const skuCode = (item.sku_code || item.sku || item.SKU)?.trim()
      const wholesaleRate = parseFloat(item.wholesale_rate || item.wholesale_cost || 0) || 0
      const retailRate = parseFloat(item.retail_rate || item.retail_price || item.Price || 0) || 0
      const quantity = parseInt(item.quantity || 0) || 0
      const imageUrl = item.image_url || item['Image URL']
      const category = item.category || item.Category

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
    const skuCode = item.sku_code?.trim()
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
        product_name: item.product_name,
        quantity: item.quantity,
        status: 'update',
        existing_name: existing.product_name,
      })
    } else {
      newSkus++
      preview.push({
        sku_code: skuCode,
        product_name: item.product_name,
        quantity: item.quantity,
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
