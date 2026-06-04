const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')
const authenticate = require('../middleware/authMiddleware')

const supabase = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// GET /api/escalations
router.get('/', authenticate, requireStudio, async (req, res) => {
  const { data, error } = await supabase()
    .from('escalation_logs')
    .eq('studio_id', req.studio.id)
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  // Enrich with user names
  const { data: { users } } = await supabase().auth.admin.listUsers({ perPage: 200 })
  const userMap = {}
  for (const u of users || []) {
    userMap[u.id] = u.user_metadata?.full_name || u.email?.split('@')[0] || 'Team Member'
  }

  res.json(data.map(r => ({
    ...r,
    reported_by_name: userMap[r.reported_by] || 'Team Member',
    resolved_by_name: r.resolved_by ? (userMap[r.resolved_by] || 'Team Member') : null,
  })))
})

// POST /api/escalations
router.post('/', authenticate, requireStudio, async (req, res) => {
  const { type, title, description, member_name, priority } = req.body
  if (!title) return res.status(400).json({ error: 'title is required' })
  if (!description) return res.status(400).json({ error: 'description is required' })

  const { data, error } = await supabase()
    .from('escalation_logs')
    .insert({
      type: type || 'operational',
      title,
      description,
      member_name: member_name || null,
      priority: priority || 'medium',
      status: 'open',
      reported_by: req.user.id,
      studio_id: req.studio.id,
    })
    .eq('studio_id', req.studio.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// PUT /api/escalations/:id
router.put('/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { type, title, description, member_name, priority, status, resolution_notes } = req.body

  const updates = {
    type, title, description, member_name, priority, status, resolution_notes,
    updated_at: new Date().toISOString(),
  }

  if (status === 'resolved') {
    updates.resolved_by = req.user.id
    updates.resolved_at = new Date().toISOString()
  } else {
    updates.resolved_by = null
    updates.resolved_at = null
  }

  const { data, error } = await supabase()
    .from('escalation_logs')
    .update(updates)
    .eq('id', req.params.id)
    .eq('studio_id', req.studio.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /api/escalations/:id
router.delete('/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await supabase()
    .from('escalation_logs')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

module.exports = router
