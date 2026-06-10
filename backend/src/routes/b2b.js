const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')
const authenticate = require('../middleware/authMiddleware')

const supabase = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ─── GET /api/b2b/contacts ───────────────────────────────────────────────────
// All roles: full contact list
router.get('/contacts', authenticate, requireStudio, async (req, res) => {
  const db = supabase()

  const { data, error } = await db
    .from('b2b_contacts')
    .select('*')
    .eq('studio_id', req.studio.id)
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })

  // Attach last_interacted_at from interactions table
  const { data: lastRows } = await supabase()
    .from('b2b_interactions')
    .select('contact_id, logged_at')
    .order('logged_at', { ascending: false })

  const lastMap = {}
  if (lastRows) {
    for (const row of lastRows) {
      if (!lastMap[row.contact_id]) lastMap[row.contact_id] = row.logged_at
    }
  }

  res.json(data.map(c => ({ ...c, last_interacted_at: lastMap[c.id] || null })))
})

// ─── POST /api/b2b/contacts ──────────────────────────────────────────────────
router.post('/contacts', authenticate, requireStudio, async (req, res) => {
  const {
    business_name, contact_name, phone, email, address, industry,
    website, social_handle, logo_url,
    status, discount_desc, discount_ongoing, next_action, next_action_date,
    notes, assigned_to, latitude, longitude,
  } = req.body

  if (!business_name) return res.status(400).json({ error: 'business_name is required' })

  const { data, error } = await supabase()
    .from('b2b_contacts')
    .insert({
      business_name,
      contact_name: contact_name || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      industry: industry || null,
      website: website || null,
      social_handle: social_handle || null,
      logo_url: logo_url || null,
      status: status || 'new_lead',
      discount_desc: discount_desc || null,
      discount_ongoing: discount_ongoing || false,
      next_action: next_action || null,
      next_action_date: next_action_date || null,
      notes: notes || null,
      assigned_to: assigned_to || null,
      latitude: latitude || null,
      longitude: longitude || null,
      created_by: req.user.id,
      studio_id: req.studio.id,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── PUT /api/b2b/contacts/:id ───────────────────────────────────────────────
router.put('/contacts/:id', authenticate, requireStudio, async (req, res) => {
  const {
    business_name, contact_name, phone, email, address, industry,
    website, social_handle, logo_url,
    status, discount_desc, discount_ongoing, next_action, next_action_date,
    notes, assigned_to, latitude, longitude,
  } = req.body

  const { data, error } = await supabase()
    .from('b2b_contacts')
    .update({
      business_name, contact_name, phone, email, address, industry,
      website, social_handle, logo_url,
      status, discount_desc, discount_ongoing, next_action,
      next_action_date: next_action_date || null, // empty string → null (DATE column)
      notes, assigned_to: assigned_to || null,
      latitude: latitude || null,
      longitude: longitude || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── DELETE /api/b2b/contacts/:id ────────────────────────────────────────────
router.delete('/contacts/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await supabase()
    .from('b2b_contacts')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── GET /api/b2b/contacts/:id/interactions ──────────────────────────────────
router.get('/contacts/:id/interactions', authenticate, requireStudio, async (req, res) => {
  const { data, error} = await supabase()
    .from('b2b_interactions')
    .select('*')
    .eq('contact_id', req.params.id)
    .eq('studio_id', req.studio.id)
    .order('logged_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  // Enrich with user names
  const db = supabase()
  const { data: { users } } = await db.auth.admin.listUsers({ perPage: 200 })
  const userMap = {}
  for (const u of users || []) {
    userMap[u.id] = u.user_metadata?.full_name || u.email?.split('@')[0] || 'Team Member'
  }

  const enriched = (data || []).map(i => ({
    ...i,
    logged_by_name: userMap[i.logged_by] || 'Team Member',
  }))

  res.json(enriched)
})

// ─── POST /api/b2b/contacts/:id/interactions ─────────────────────────────────
router.post('/contacts/:id/interactions', authenticate, requireStudio, async (req, res) => {
  const { type, notes, logged_at } = req.body

  if (!type) return res.status(400).json({ error: 'type is required' })

  const { data, error } = await supabase()
    .from('b2b_interactions')
    .insert({
      contact_id: req.params.id,
      type,
      notes: notes || null,
      logged_by: req.user.id,
      studio_id: req.studio.id,
      ...(logged_at ? { logged_at } : {}),
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── PUT /api/b2b/interactions/:id ───────────────────────────────────────────
router.put('/interactions/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { type, notes, logged_at } = req.body
  if (!type) return res.status(400).json({ error: 'type is required' })

  const { data, error } = await supabase()
    .from('b2b_interactions')
    .update({
      type,
      notes: notes || null,
      ...(logged_at ? { logged_at } : {}),
    })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── DELETE /api/b2b/interactions/:id ────────────────────────────────────────
router.delete('/interactions/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await supabase()
    .from('b2b_interactions')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── Events linked to a contact ──────────────────────────────────────────────

// GET /api/b2b/contacts/:id/events
router.get('/contacts/:id/events', authenticate, requireStudio, async (req, res) => {
  try {
    const db = supabase()

    // Use a SECURITY DEFINER function to bypass any PostgREST table-access issues
    const { data, error } = await db
      .rpc('get_contact_linked_events', { p_contact_id: req.params.id })

    if (error) throw new Error(error.message)
    res.json(data || [])
  } catch (err) {
    console.error('GET /b2b/contacts/:id/events', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
