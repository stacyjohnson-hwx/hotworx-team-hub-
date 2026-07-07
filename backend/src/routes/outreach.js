const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const { requireRole } = require('../middleware/roleGuard')
const authenticate = require('../middleware/authMiddleware')
const { syncOutreach, isConfigured } = require('../services/outreachSync')
const { todayInChicago } = require('../utils/dates')

const supabase = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ─── POST /api/outreach/sync ─────────────────────────────────────────────────
// On-demand: pull the call lists from Airtable and refresh each tile.
router.post('/sync', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: 'Airtable sync is not configured on the server (missing AIRTABLE_TOKEN / AIRTABLE_BASE_ID).' })
  }
  try {
    const result = await syncOutreach()
    res.json({ ok: true, tiles: result })
  } catch (err) {
    console.error('POST /outreach/sync', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/outreach/tiles ─────────────────────────────────────────────────
router.get('/tiles', authenticate, async (req, res) => {
  const { data, error } = await supabase()
    .from('outreach_tiles')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── POST /api/outreach/tiles ────────────────────────────────────────────────
router.post('/tiles', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { title, description, script, crm_instructions, color } = req.body
  if (!title) return res.status(400).json({ error: 'title is required' })

  // Get current max priority
  const { data: existing } = await supabase()
    .from('outreach_tiles')
    .select('priority')
    .order('priority', { ascending: false })
    .limit(1)

  const nextPriority = (existing?.[0]?.priority ?? 0) + 1

  const { data, error } = await supabase()
    .from('outreach_tiles')
    .insert({
      title,
      description: description || null,
      script: script || null,
      crm_instructions: crm_instructions || null,
      color: color || 'blue',
      priority: nextPriority,
      created_by: req.user.id,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── PUT /api/outreach/tiles/:id ─────────────────────────────────────────────
router.put('/tiles/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { title, description, script, crm_instructions, color, priority, is_active } = req.body

  const { data, error } = await supabase()
    .from('outreach_tiles')
    .update({
      title, description, script, crm_instructions, color,
      ...(priority !== undefined ? { priority } : {}),
      ...(is_active !== undefined ? { is_active } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── DELETE /api/outreach/tiles/:id ──────────────────────────────────────────
router.delete('/tiles/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await supabase()
    .from('outreach_tiles')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── Reorder: POST /api/outreach/tiles/reorder ───────────────────────────────
router.post('/tiles/reorder', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { orderedIds } = req.body  // array of ids in desired order
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds array required' })

  const db = supabase()
  const updates = orderedIds.map((id, idx) =>
    db.from('outreach_tiles').update({ priority: idx + 1, updated_at: new Date().toISOString() }).eq('id', id)
  )
  await Promise.all(updates)
  res.json({ ok: true })
})

// ─── GET /api/outreach/tiles/:id/contacts ────────────────────────────────────
router.get('/tiles/:id/contacts', authenticate, async (req, res) => {
  const { data, error } = await supabase()
    .from('outreach_contacts')
    .select('*')
    .eq('tile_id', req.params.id)
    .order('created_at', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── POST /api/outreach/tiles/:id/contacts/import ────────────────────────────
// Manager pastes names (newline or comma separated), bulk import
router.post('/tiles/:id/contacts/import', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { names, clearExisting } = req.body  // names: string[]
  if (!Array.isArray(names) || names.length === 0) {
    return res.status(400).json({ error: 'names array required' })
  }

  const db = supabase()

  // Optionally clear existing pending contacts first
  if (clearExisting) {
    await db.from('outreach_contacts').delete()
      .eq('tile_id', req.params.id)
      .eq('status', 'pending')
  }

  const rows = names
    .map(n => n.trim())
    .filter(Boolean)
    .map(name => ({ tile_id: req.params.id, name, status: 'pending' }))

  const { data, error } = await db
    .from('outreach_contacts')
    .insert(rows)
    .select()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── PATCH /api/outreach/contacts/:id ────────────────────────────────────────
// Update a single contact status/outcome
router.patch('/contacts/:id', authenticate, async (req, res) => {
  const { status, outcome } = req.body

  const { data, error } = await supabase()
    .from('outreach_contacts')
    .update({
      status: status || undefined,
      outcome: outcome || undefined,
      actioned_by: req.user.id,
      actioned_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── DELETE /api/outreach/tiles/:id/contacts ─────────────────────────────────
// Clear all contacts for a tile (manager only)
router.delete('/tiles/:id/contacts', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await supabase()
    .from('outreach_contacts')
    .delete()
    .eq('tile_id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── GET /api/outreach/logs ──────────────────────────────────────────────────
// Get today's logs for the current user (or all users for owner/manager)
router.get('/logs', authenticate, async (req, res) => {
  const { date, allUsers } = req.query
  const role = req.user.app_metadata?.role
  const today = date || todayInChicago()

  let query = supabase()
    .from('outreach_logs')
    .select('*')
    .eq('log_date', today)

  if (!allUsers || role === 'tsa') {
    query = query.eq('tsa_id', req.user.id)
  }

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── POST /api/outreach/logs/upsert ─────────────────────────────────────────
// Upsert calls/texts count for today; syncs monthly totals to personal_goals
router.post('/logs/upsert', authenticate, async (req, res) => {
  const { tile_id, calls_made, texts_made } = req.body
  if (!tile_id) return res.status(400).json({ error: 'tile_id required' })

  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const month = now.getMonth() + 1
  const year  = now.getFullYear()
  const db    = supabase()

  // Upsert today's log
  const { data, error } = await db
    .from('outreach_logs')
    .upsert({
      tile_id,
      tsa_id: req.user.id,
      log_date: today,
      calls_made: calls_made ?? 0,
      texts_made: texts_made ?? 0,
      updated_at: now.toISOString(),
    }, { onConflict: 'tile_id,tsa_id,log_date' })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // ── Sync monthly totals → personal_goals ──────────────────────────────
  try {
    const startOfMonth = `${year}-${String(month).padStart(2,'0')}-01`
    const endOfMonth   = new Date(year, month, 0).toISOString().split('T')[0]

    const { data: monthLogs } = await db
      .from('outreach_logs')
      .select('calls_made, texts_made')
      .eq('tsa_id', req.user.id)
      .gte('log_date', startOfMonth)
      .lte('log_date', endOfMonth)

    const totalCalls = (monthLogs || []).reduce((s, l) => s + (l.calls_made || 0), 0)
    const totalTexts = (monthLogs || []).reduce((s, l) => s + (l.texts_made || 0), 0)

    await db
      .from('personal_goals')
      .upsert({
        tsa_id: req.user.id,
        month,
        year,
        calls_made: totalCalls,
        texts_made: totalTexts,
        updated_at: now.toISOString(),
      }, { onConflict: 'tsa_id,month,year', ignoreDuplicates: false })
  } catch (syncErr) {
    console.warn('[outreach] personal_goals sync failed:', syncErr.message)
    // Non-fatal — don't block the response
  }

  res.json(data)
})

// ─── GET /api/outreach/logs/summary ─────────────────────────────────────────
// Daily totals for EOD email — total calls + texts across all tiles
router.get('/logs/summary', authenticate, async (req, res) => {
  const { date } = req.query
  const today = date || todayInChicago()
  const role = req.user.app_metadata?.role

  let query = supabase()
    .from('outreach_logs')
    .select('tsa_id, tile_id, calls_made, texts_made, outreach_tiles(title)')
    .eq('log_date', today)

  if (role === 'tsa') query = query.eq('tsa_id', req.user.id)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  const totalCalls = (data || []).reduce((s, r) => s + (r.calls_made || 0), 0)
  const totalTexts = (data || []).reduce((s, r) => s + (r.texts_made || 0), 0)

  res.json({ date: today, totalCalls, totalTexts, byTile: data })
})

module.exports = router
