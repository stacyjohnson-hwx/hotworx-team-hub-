const express = require('express')
const router  = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate    = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// GET /api/dashboard-links
// All authenticated users — TSAs only see non-manager links
router.get('/', authenticate, async (req, res) => {
  const role    = req.user.app_metadata?.role
  const isTsa   = role === 'tsa'

  let query = db().from('dashboard_links').select('*').order('sort_order').order('created_at')
  if (isTsa) query = query.eq('manager_only', false)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/dashboard-links — owner/manager only
router.post('/', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { title, url, description, image_url, manager_only, sort_order } = req.body
  if (!title?.trim() || !url?.trim()) return res.status(400).json({ error: 'title and url are required' })

  const { data, error } = await db()
    .from('dashboard_links')
    .insert({ title: title.trim(), url: url.trim(), description: description || null,
      image_url: image_url || null, manager_only: !!manager_only, sort_order: sort_order ?? 0 })
    .select().single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// PUT /api/dashboard-links/:id — owner/manager only
router.put('/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { title, url, description, image_url, manager_only, sort_order } = req.body

  const { data, error } = await db()
    .from('dashboard_links')
    .update({ title, url, description: description || null, image_url: image_url || null,
      manager_only: !!manager_only, sort_order: sort_order ?? 0 })
    .eq('id', req.params.id)
    .select().single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /api/dashboard-links/:id — owner/manager only
router.delete('/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await db().from('dashboard_links').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

module.exports = router
