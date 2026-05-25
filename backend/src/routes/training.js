const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const { requireRole } = require('../middleware/roleGuard')
const authenticate = require('../middleware/authMiddleware')

const supabase = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function buildUserMap(db) {
  const { data: { users } } = await db.auth.admin.listUsers({ perPage: 200 })
  const map = {}
  for (const u of users || []) {
    map[u.id] = u.user_metadata?.full_name || u.email?.split('@')[0] || 'Team Member'
  }
  return map
}

// ─── GET /api/training ────────────────────────────────────────────────────────
// Returns all resources enriched with who has completed each one
router.get('/', authenticate, async (req, res) => {
  const { category } = req.query
  const db = supabase()

  let query = db
    .from('training_resources')
    .select('*')
    .order('category')
    .order('title')

  if (category) query = query.eq('category', category)

  const [{ data: resources, error }, { data: completions }, userMap] = await Promise.all([
    query,
    db.from('training_completions').select('resource_id, user_id, completed_at'),
    buildUserMap(db),
  ])

  if (error) return res.status(500).json({ error: error.message })

  // Group completions by resource_id
  const completionMap = {}
  for (const c of completions || []) {
    if (!completionMap[c.resource_id]) completionMap[c.resource_id] = []
    completionMap[c.resource_id].push({
      user_id: c.user_id,
      user_name: userMap[c.user_id] || 'Team Member',
      completed_at: c.completed_at,
    })
  }

  const enriched = (resources || []).map(r => ({
    ...r,
    completions: completionMap[r.id] || [],
  }))

  res.json(enriched)
})

// ─── POST /api/training ───────────────────────────────────────────────────────
router.post('/', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { title, category, description, resource_type, url } = req.body
  if (!title) return res.status(400).json({ error: 'title is required' })

  const { data, error } = await supabase()
    .from('training_resources')
    .insert({
      title,
      category: category || 'general',
      description: description || null,
      resource_type: resource_type || 'link',
      url: url || null,
      created_by: req.user.id,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json({ ...data, completions: [] })
})

// ─── PUT /api/training/:id ────────────────────────────────────────────────────
router.put('/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { title, category, description, resource_type, url } = req.body

  const { data, error } = await supabase()
    .from('training_resources')
    .update({
      title, category, description, resource_type, url,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── DELETE /api/training/:id ─────────────────────────────────────────────────
router.delete('/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await supabase()
    .from('training_resources')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── GET /api/training/stats ─────────────────────────────────────────────────
// Returns total resource count + per-user completion counts for the Team page
router.get('/stats', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const db = supabase()

  const [{ data: resources, error: rErr }, { data: completions, error: cErr }] = await Promise.all([
    db.from('training_resources').select('id'),
    db.from('training_completions').select('user_id, resource_id'),
  ])

  if (rErr) return res.status(500).json({ error: rErr.message })
  if (cErr) return res.status(500).json({ error: cErr.message })

  const totalResources = (resources || []).length

  // Count unique completions per user
  const countsByUser = {}
  for (const c of completions || []) {
    countsByUser[c.user_id] = (countsByUser[c.user_id] || 0) + 1
  }

  res.json({ totalResources, countsByUser })
})

// ─── POST /api/training/:id/complete ─────────────────────────────────────────
router.post('/:id/complete', authenticate, async (req, res) => {
  const { data, error } = await supabase()
    .from('training_completions')
    .upsert({
      resource_id: req.params.id,
      user_id: req.user.id,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'resource_id,user_id' })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── DELETE /api/training/:id/complete ───────────────────────────────────────
router.delete('/:id/complete', authenticate, async (req, res) => {
  const { error } = await supabase()
    .from('training_completions')
    .delete()
    .eq('resource_id', req.params.id)
    .eq('user_id', req.user.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

module.exports = router
