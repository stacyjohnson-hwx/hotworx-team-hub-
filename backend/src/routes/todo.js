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

// ─── GET /api/todo ────────────────────────────────────────────────────────────
router.get('/', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { status } = req.query
  const db = supabase()

  let query = db
    .from('todo_items')
    .select('*')
    .order('status')                          // open before done
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const [{ data, error }, userMap] = await Promise.all([query, buildUserMap(db)])
  if (error) return res.status(500).json({ error: error.message })

  const enriched = (data || []).map(t => ({
    ...t,
    created_by_name: userMap[t.created_by] || 'Team Member',
    completed_by_name: t.completed_by ? (userMap[t.completed_by] || 'Team Member') : null,
  }))
  res.json(enriched)
})

// ─── POST /api/todo ───────────────────────────────────────────────────────────
router.post('/', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { title, notes, due_date, priority, area, source, coaching_session_id, list_target } = req.body
  if (!title) return res.status(400).json({ error: 'title is required' })

  const { data, error } = await supabase()
    .from('todo_items')
    .insert({
      title,
      notes: notes || null,
      due_date: due_date || null,
      priority: priority || 'medium',
      area: area || null,
      status: 'open',
      source: source || 'manual',
      coaching_session_id: coaching_session_id || null,
      list_target: ['manager', 'owner'].includes(list_target) ? list_target : 'manager',
      created_by: req.user.id,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── PUT /api/todo/:id ────────────────────────────────────────────────────────
router.put('/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { title, notes, due_date, priority, area, status, list_target } = req.body
  const db = supabase()

  const updates = {
    title, notes, due_date: due_date || null, priority,
    area: area || null,
    updated_at: new Date().toISOString(),
  }
  if (['manager', 'owner'].includes(list_target)) updates.list_target = list_target

  if (status === 'done') {
    updates.status = 'done'
    updates.completed_by = req.user.id
    updates.completed_at = new Date().toISOString()
  } else if (status === 'open') {
    updates.status = 'open'
    updates.completed_by = null
    updates.completed_at = null
  }

  const [{ data, error }, userMap] = await Promise.all([
    db.from('todo_items').update(updates).eq('id', req.params.id).select().single(),
    buildUserMap(db),
  ])

  if (error) return res.status(500).json({ error: error.message })
  res.json({
    ...data,
    created_by_name: userMap[data.created_by] || 'Team Member',
    completed_by_name: data.completed_by ? (userMap[data.completed_by] || 'Team Member') : null,
  })
})

// ─── DELETE /api/todo/:id ─────────────────────────────────────────────────────
router.delete('/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await supabase()
    .from('todo_items')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

module.exports = router
