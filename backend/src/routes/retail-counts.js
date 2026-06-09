const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ─── GET /api/retail/counts ─────────────────────────────────────────────────
// List all count sessions for current studio
router.get('/', authenticate, requireStudio, async (req, res) => {
  const { data, error } = await db()
    .from('inventory_count_sessions')
    .select('*')
    .eq('studio_id', req.studio.id)
    .order('count_date', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── GET /api/retail/counts/:id ─────────────────────────────────────────────
// Get single count session with all entries
router.get('/:id', authenticate, requireStudio, async (req, res) => {
  const { data: session, error: sessionError } = await db()
    .from('inventory_count_sessions')
    .select('*')
    .eq('id', req.params.id)
    .eq('studio_id', req.studio.id)
    .single()

  if (sessionError) return res.status(500).json({ error: sessionError.message })

  const { data: entries, error: entriesError } = await db()
    .from('inventory_count_entries')
    .select(`
      *,
      sku:sku_master(id, sku_code, product_name, image_url, has_sizes, retail_price, category:product_categories(name))
    `)
    .eq('session_id', req.params.id)
    .order('sku.product_name')

  if (entriesError) return res.status(500).json({ error: entriesError.message })

  res.json({ ...session, entries })
})

// ─── POST /api/retail/counts ────────────────────────────────────────────────
// Create new count session with entries from current inventory
router.post('/', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { count_date } = req.body

  // 1. Create session
  const { data: session, error: sessionError } = await db()
    .from('inventory_count_sessions')
    .insert({
      studio_id: req.studio.id,
      count_date: count_date || new Date().toISOString().split('T')[0],
      counted_by: req.user.id,
      status: 'in_progress',
    })
    .select()
    .single()

  if (sessionError) return res.status(500).json({ error: sessionError.message })

  // 2. Get all active SKUs with current inventory levels
  const { data: skus, error: skusError } = await db()
    .from('sku_master')
    .select(`
      id,
      sku_code,
      product_name,
      image_url,
      has_sizes,
      retail_price,
      category_id,
      inventory:inventory_levels!sku_id(quantity_on_hand, size_quantities)
    `)
    .eq('active', true)
    .eq('inventory.studio_id', req.studio.id)

  if (skusError) return res.status(500).json({ error: skusError.message })

  // 3. Create entries for each SKU
  const entries = skus.map(sku => {
    const inventory = sku.inventory?.[0]
    return {
      session_id: session.id,
      sku_id: sku.id,
      expected_quantity: inventory?.quantity_on_hand || 0,
      expected_size_quantities: inventory?.size_quantities || null,
      actual_quantity: null, // Not counted yet
      actual_size_quantities: null,
      variance_value: null,
    }
  })

  const { error: entriesError } = await db()
    .from('inventory_count_entries')
    .insert(entries)

  if (entriesError) return res.status(500).json({ error: entriesError.message })

  // Update total_items
  await db()
    .from('inventory_count_sessions')
    .update({ total_items: entries.length })
    .eq('id', session.id)

  res.status(201).json({ ...session, total_items: entries.length })
})

// ─── PUT /api/retail/counts/:id/entries/:entry_id ──────────────────────────
// Update a single count entry
router.put('/:id/entries/:entry_id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { actual_quantity, actual_size_quantities, flagged, notes, photo_url } = req.body

  // Get entry with SKU info for variance calculation
  const { data: entry, error: getError } = await db()
    .from('inventory_count_entries')
    .select(`
      *,
      sku:sku_master(retail_price)
    `)
    .eq('id', req.params.entry_id)
    .single()

  if (getError) return res.status(500).json({ error: getError.message })

  // Calculate variance value
  const variance = actual_quantity - entry.expected_quantity
  const variance_value = variance * (entry.sku.retail_price || 0)

  const { data, error } = await db()
    .from('inventory_count_entries')
    .update({
      actual_quantity,
      actual_size_quantities,
      variance_value,
      flagged: flagged || false,
      notes,
      photo_url,
      counted_at: actual_quantity !== null ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.entry_id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── POST /api/retail/counts/:id/submit ────────────────────────────────────
// Submit count session (lock and calculate summary)
router.post('/:id/submit', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { notes } = req.body

  // Get all entries to calculate summary
  const { data: entries, error: entriesError } = await db()
    .from('inventory_count_entries')
    .select('*')
    .eq('session_id', req.params.id)

  if (entriesError) return res.status(500).json({ error: entriesError.message })

  const items_counted = entries.filter(e => e.actual_quantity !== null).length
  const total_variance_value = entries.reduce((sum, e) => sum + (e.variance_value || 0), 0)

  // Calculate shrinkage rate (total variance / total inventory value)
  const total_inventory_value = entries.reduce((sum, e) => {
    const { data: sku } = db().from('sku_master').select('retail_price').eq('id', e.sku_id).single()
    return sum + (e.expected_quantity * (sku?.retail_price || 0))
  }, 0)

  const shrinkage_rate = total_inventory_value > 0
    ? Math.abs(total_variance_value / total_inventory_value * 100)
    : 0

  // Submit session
  const { data, error } = await db()
    .from('inventory_count_sessions')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      items_counted,
      total_variance_value,
      shrinkage_rate,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Update inventory levels based on actual counts
  for (const entry of entries) {
    if (entry.actual_quantity !== null) {
      await db()
        .from('inventory_levels')
        .upsert({
          sku_id: entry.sku_id,
          studio_id: req.studio.id,
          quantity_on_hand: entry.actual_quantity,
          size_quantities: entry.actual_size_quantities,
          last_count_date: data.count_date,
          last_updated_by: req.user.id,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'sku_id,studio_id'
        })
    }
  }

  res.json(data)
})

// ─── DELETE /api/retail/counts/:id ─────────────────────────────────────────
// Delete count session (only if not submitted)
router.delete('/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  // Check session exists and is in_progress
  const { data: session, error: checkError } = await db()
    .from('inventory_count_sessions')
    .select('status')
    .eq('id', req.params.id)
    .eq('studio_id', req.studio.id)
    .maybeSingle()

  if (checkError) return res.status(500).json({ error: checkError.message })
  if (!session) return res.status(404).json({ error: 'Session not found' })
  if (session.status === 'submitted') {
    return res.status(400).json({ error: 'Cannot delete submitted count session' })
  }

  // Delete entries first (cascade)
  await db()
    .from('inventory_count_entries')
    .delete()
    .eq('session_id', req.params.id)

  // Delete session
  const { error } = await db()
    .from('inventory_count_sessions')
    .delete()
    .eq('id', req.params.id)
    .eq('studio_id', req.studio.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

module.exports = router
