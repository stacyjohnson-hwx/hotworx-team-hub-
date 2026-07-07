const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')

const { todayInChicago } = require('../utils/dates')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ─── GET /api/retail/counts ─────────────────────────────────────────────────
// List all count sessions for current studio
router.get('/', authenticate, requireStudio, async (req, res) => {
  const database = db()
  const { data: sessions, error } = await database
    .from('inventory_count_sessions')
    .select('*')
    .eq('studio_id', req.studio.id)
    .order('count_date', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  // Compute progress LIVE from the entries (matches the resume/count screen exactly,
  // instead of trusting the denormalized items_counted/total_items columns, which can drift).
  const ids = (sessions || []).map(s => s.id)
  const totals = {}, counted = {}
  if (ids.length) {
    const { data: entries } = await database
      .from('inventory_count_entries')
      .select('session_id, actual_quantity')
      .in('session_id', ids)
    for (const e of (entries || [])) {
      totals[e.session_id] = (totals[e.session_id] || 0) + 1
      if (e.actual_quantity !== null) counted[e.session_id] = (counted[e.session_id] || 0) + 1
    }
  }

  res.json((sessions || []).map(s => ({
    ...s,
    total_items: totals[s.id] ?? s.total_items ?? 0,
    items_counted: counted[s.id] ?? s.items_counted ?? 0,
  })))
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

  if (entriesError) return res.status(500).json({ error: entriesError.message })

  // Sort by product name (can't order by nested relation in the query)
  const sortedEntries = (entries || []).sort((a, b) =>
    (a.sku?.product_name || '').localeCompare(b.sku?.product_name || '')
  )

  res.json({ ...session, entries: sortedEntries })
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
      count_date: count_date || todayInChicago(),
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

// ─── POST /api/retail/counts/:id/entries/add-size ──────────────────────────
// Materialize a missing clothing size: clone a sibling SKU into a new size
// variant (global catalog) and add a count entry for it to this session, so
// the user can count sizes that weren't in the catalog. Idempotent by product_name.
router.post('/:id/entries/add-size', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { base_sku_id, size, product_name } = req.body
  if (!base_sku_id || !size || !product_name) {
    return res.status(400).json({ error: 'base_sku_id, size, and product_name are required' })
  }
  const database = db()

  // 1. Copy attributes from the sibling SKU.
  const { data: base, error: baseErr } = await database
    .from('sku_master')
    .select('sku_code, category_id, vendor_id, retail_price, wholesale_cost, image_url, description')
    .eq('id', base_sku_id).single()
  if (baseErr) return res.status(500).json({ error: baseErr.message })

  // 2. Reuse an existing SKU with this exact name, or create one.
  let sku
  const { data: existingSku } = await database
    .from('sku_master').select('*').eq('product_name', product_name).maybeSingle()
  if (existingSku) {
    sku = existingSku
  } else {
    // Unique-ish sku_code derived from the sibling + size (fallback with a suffix).
    let sku_code = `${base.sku_code}-${size}`
    const { data: clash } = await database.from('sku_master').select('id').eq('sku_code', sku_code).maybeSingle()
    if (clash) sku_code = `${sku_code}-${Math.random().toString(36).slice(2, 6)}`
    const { data: created, error: createErr } = await database
      .from('sku_master')
      .insert({
        sku_code, product_name,
        category_id: base.category_id, vendor_id: base.vendor_id,
        retail_price: base.retail_price, wholesale_cost: base.wholesale_cost,
        image_url: base.image_url, description: base.description,
        has_sizes: false, active: true, created_by: req.user.id,
      })
      .select().single()
    if (createErr) return res.status(500).json({ error: createErr.message })
    sku = created
  }

  // 3. Reuse or create this session's entry for the SKU (expected 0 — new to stock).
  const { data: existingEntry } = await database
    .from('inventory_count_entries')
    .select('id').eq('session_id', req.params.id).eq('sku_id', sku.id).maybeSingle()
  let entryId = existingEntry?.id
  if (!entryId) {
    const { data: entry, error: entryErr } = await database
      .from('inventory_count_entries')
      .insert({ session_id: req.params.id, sku_id: sku.id, expected_quantity: 0, actual_quantity: null })
      .select().single()
    if (entryErr) return res.status(500).json({ error: entryErr.message })
    entryId = entry.id
    await database.from('inventory_count_sessions')
      .update({ total_items: (await database.from('inventory_count_entries')
        .select('*', { count: 'exact', head: true }).eq('session_id', req.params.id)).count || 0 })
      .eq('id', req.params.id)
  }

  // 4. Return the entry in the same shape as GET /:id (sku joined).
  const { data: full, error: fullErr } = await database
    .from('inventory_count_entries')
    .select(`*, sku:sku_master(id, sku_code, product_name, image_url, has_sizes, retail_price, category:product_categories(name))`)
    .eq('id', entryId).single()
  if (fullErr) return res.status(500).json({ error: fullErr.message })
  res.status(201).json(full)
})

// ─── PUT /api/retail/counts/:id/entries/:entry_id ──────────────────────────
// Update a single count entry
router.put('/:id/entries/:entry_id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { actual_quantity, actual_size_quantities, flagged, notes, photo_url } = req.body

  // inventory_count_entries has no studio_id; scope via the parent session's studio.
  const { data: parentSession, error: sessErr } = await db()
    .from('inventory_count_sessions')
    .select('id')
    .eq('id', req.params.id)
    .eq('studio_id', req.studio.id)
    .single()

  if (sessErr || !parentSession) return res.status(404).json({ error: 'Count session not found' })

  // Get entry with SKU info for variance calculation (constrained to this session)
  const { data: entry, error: getError } = await db()
    .from('inventory_count_entries')
    .select(`
      *,
      sku:sku_master(retail_price)
    `)
    .eq('id', req.params.entry_id)
    .eq('session_id', req.params.id)
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
    .eq('session_id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Keep the session's items_counted in sync so the Inventory list shows progress
  const { count: countedCount } = await db()
    .from('inventory_count_entries')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', req.params.id)
    .not('actual_quantity', 'is', null)

  await db()
    .from('inventory_count_sessions')
    .update({ items_counted: countedCount || 0, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)

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
  // Pre-fetch retail prices in one query — can't await inside reduce()
  const skuIds = [...new Set(entries.map(e => e.sku_id))]
  const { data: skuRows } = await db()
    .from('sku_master')
    .select('id, retail_price')
    .in('id', skuIds)
  const priceMap = Object.fromEntries((skuRows || []).map(s => [s.id, s.retail_price || 0]))

  const total_inventory_value = entries.reduce(
    (sum, e) => sum + (e.expected_quantity * (priceMap[e.sku_id] || 0)),
    0
  )

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
