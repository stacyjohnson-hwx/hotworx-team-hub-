const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')

const { todayInChicago } = require('../utils/dates')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ─── GET /api/retail/categories ─────────────────────────────────────────────
router.get('/categories', authenticate, async (req, res) => {
  const { data, error } = await db()
    .from('product_categories')
    .select('*')
    .eq('active', true)
    .order('sort_order')
    .order('name')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── GET /api/retail/vendors ────────────────────────────────────────────────
router.get('/vendors', authenticate, async (req, res) => {
  const { data, error } = await db()
    .from('vendors')
    .select('*')
    .eq('active', true)
    .order('name')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── GET /api/retail/skus ───────────────────────────────────────────────────
router.get('/skus', authenticate, requireStudio, async (req, res) => {
  const { active, category, vendor, search } = req.query

  let query = db()
    .from('sku_master')
    .select(`
      *,
      category:product_categories(id, name),
      vendor:vendors(id, name),
      inventory:inventory_levels!sku_id(quantity_on_hand, size_quantities, last_count_date)
    `)

  // Filter by studio in inventory join
  query = query.eq('inventory.studio_id', req.studio.id)

  if (active !== undefined) query = query.eq('active', active === 'true')
  if (category) query = query.eq('category_id', category)
  if (vendor) query = query.eq('vendor_id', vendor)
  if (search) query = query.or(`sku_code.ilike.%${search}%,product_name.ilike.%${search}%`)

  query = query.order('product_name')

  const { data, error } = await query

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── GET /api/retail/skus/:id ───────────────────────────────────────────────
router.get('/skus/:id', authenticate, requireStudio, async (req, res) => {
  const { data, error } = await db()
    .from('sku_master')
    .select(`
      *,
      category:product_categories(id, name),
      vendor:vendors(id, name),
      inventory:inventory_levels!sku_id(quantity_on_hand, size_quantities, last_count_date)
    `)
    .eq('id', req.params.id)
    .eq('inventory.studio_id', req.studio.id)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── POST /api/retail/skus ──────────────────────────────────────────────────
router.post('/skus', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  // Whitelist valid fields (no 'category' - only 'category_id')
  const {
    sku_code, product_name, description, category_id, vendor_id,
    retail_price, wholesale_cost, has_sizes, available_sizes,
    image_url, par_level, reorder_quantity, active, top_seller
  } = req.body

  const { data, error } = await db()
    .from('sku_master')
    .insert({
      sku_code, product_name, description, category_id, vendor_id,
      retail_price, wholesale_cost, has_sizes, available_sizes,
      image_url, par_level, reorder_quantity, active, top_seller,
      created_by: req.user.id,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── PUT /api/retail/skus/:id ───────────────────────────────────────────────
router.put('/skus/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  // Whitelist valid fields (no 'category' - only 'category_id')
  const {
    sku_code, product_name, description, category_id, vendor_id,
    retail_price, wholesale_cost, has_sizes, available_sizes,
    image_url, par_level, reorder_quantity, active, top_seller
  } = req.body

  const { data, error } = await db()
    .from('sku_master')
    .update({
      sku_code, product_name, description, category_id, vendor_id,
      retail_price, wholesale_cost, has_sizes, available_sizes,
      image_url, par_level, reorder_quantity, active, top_seller,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── DELETE /api/retail/skus/:id (soft delete) ─────────────────────────────
router.delete('/skus/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await db()
    .from('sku_master')
    .update({ active: false })
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── GET /api/retail/inventory ─────────────────────────────────────────────
router.get('/inventory', authenticate, requireStudio, async (req, res) => {
  const { data, error } = await db()
    .from('inventory_levels')
    .select(`
      *,
      sku:sku_master(id, sku_code, product_name, image_url, has_sizes, retail_price)
    `)
    .eq('studio_id', req.studio.id)
    .order('sku.product_name')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── PUT /api/retail/inventory/:sku_id ─────────────────────────────────────
router.put('/inventory/:sku_id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { quantity_on_hand, size_quantities } = req.body

  const { data, error } = await db()
    .from('inventory_levels')
    .upsert({
      sku_id: req.params.sku_id,
      studio_id: req.studio.id,
      quantity_on_hand: quantity_on_hand || 0,
      size_quantities: size_quantities || null,
      last_updated_by: req.user.id,
      last_count_date: todayInChicago(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'sku_id,studio_id'
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

module.exports = router
