const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// GET /api/missions — all authenticated users; returns active missions ordered by sort_order
router.get('/', authenticate, async (req, res) => {
  const { data, error } = await db()
    .from('missions')
    .select('*')
    .eq('active', true)
    .order('sort_order')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

// POST /api/missions — owner/manager only
router.post('/', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { title, sort_order } = req.body
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' })
  const { data, error } = await db()
    .from('missions')
    .insert({ title: title.trim(), sort_order: sort_order ?? 0 })
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// PUT /api/missions/:id — owner/manager only
router.put('/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { title, active, sort_order } = req.body
  const { data, error } = await db()
    .from('missions')
    .update({ title, active, sort_order })
    .eq('id', req.params.id)
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /api/missions/:id — owner/manager only
router.delete('/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await db().from('missions').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

module.exports = router
