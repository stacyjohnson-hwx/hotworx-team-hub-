const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')
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

// ─── GET /api/coaching ────────────────────────────────────────────────────────
router.get('/', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const db = supabase()

  const [{ data: sessions, error }, { data: actions }, userMap] = await Promise.all([
    db.from('coaching_sessions')
      .select('*')
      .eq('studio_id', req.studio.id)
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false }),
    db.from('coaching_action_items')
      .select('*')
      .eq('studio_id', req.studio.id)
      .order('created_at'),
    buildUserMap(db),
  ])

  if (error) return res.status(500).json({ error: error.message })

  // Group action items by session
  const actionMap = {}
  for (const a of actions || []) {
    if (!actionMap[a.session_id]) actionMap[a.session_id] = []
    actionMap[a.session_id].push(a)
  }

  const enriched = (sessions || []).map(s => ({
    ...s,
    created_by_name: userMap[s.created_by] || 'Team Member',
    action_items: actionMap[s.id] || [],
  }))

  res.json(enriched)
})

// ─── POST /api/coaching ───────────────────────────────────────────────────────
router.post('/', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { session_date, session_time, staff_name, session_type, notes, action_items } = req.body
  if (!staff_name) return res.status(400).json({ error: 'staff_name is required' })

  const db = supabase()

  const { data: session, error: sessErr } = await db
    .from('coaching_sessions')
    .insert({
      session_date: session_date || new Date().toISOString().split('T')[0],
      session_time: session_time || null,
      staff_name,
      session_type: session_type || 'one-on-one',
      notes: notes || null,
      created_by: req.user.id,
      studio_id: req.studio.id,
    })
    .select()
    .single()

  if (sessErr) return res.status(500).json({ error: sessErr.message })

  // Insert any action items
  let savedActions = []
  if (action_items?.length) {
    const { data: acts } = await db
      .from('coaching_action_items')
      .insert(action_items.map(a => ({
        session_id: session.id,
        title: a.title,
        notes: a.notes || null,
        studio_id: req.studio.id,
      })))
      .select()
    savedActions = acts || []
  }

  res.status(201).json({ ...session, action_items: savedActions })
})

// ─── PUT /api/coaching/:id ────────────────────────────────────────────────────
router.put('/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { session_date, session_time, staff_name, session_type, notes } = req.body
  const db = supabase()

  const { data, error } = await db
    .from('coaching_sessions')
    .update({
      session_date, session_time: session_time || null, staff_name, session_type, notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Return with action items
  const { data: actions } = await db
    .from('coaching_action_items')
    .select('*')
    .eq('session_id', req.params.id)
    .order('created_at')

  res.json({ ...data, action_items: actions || [] })
})

// ─── DELETE /api/coaching/:id ─────────────────────────────────────────────────
router.delete('/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await supabase()
    .from('coaching_sessions')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── POST /api/coaching/actions ───────────────────────────────────────────────
// Add a single action item to an existing session
router.post('/actions', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { session_id, title, notes } = req.body
  if (!session_id || !title) return res.status(400).json({ error: 'session_id and title required' })

  const { data, error } = await supabase()
    .from('coaching_action_items')
    .insert({ session_id, title, notes: notes || null, studio_id: req.studio.id })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── DELETE /api/coaching/actions/:id ────────────────────────────────────────
router.delete('/actions/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await supabase()
    .from('coaching_action_items')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── POST /api/coaching/actions/:id/push-to-todo ─────────────────────────────
// Push an action item to the Manager or Owner To-Do list
router.post('/actions/:id/push-to-todo', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const db = supabase()

  // Fetch the action item + its session for context
  const { data: action, error: actErr } = await db
    .from('coaching_action_items')
    .select('*, coaching_sessions(id, staff_name, session_date)')
    .eq('id', req.params.id)
    .single()

  if (actErr) return res.status(404).json({ error: 'Action item not found' })
  if (action.pushed_to_todo) return res.status(400).json({ error: 'Already pushed to To-Do' })

  const session = action.coaching_sessions
  const { due_date, list_target, assigned_to } = req.body
  const target = ['manager', 'owner'].includes(list_target) ? list_target : 'manager'

  // Create the todo item
  const { data: todo, error: todoErr } = await db
    .from('todo_items')
    .insert({
      title: action.title,
      notes: action.notes || `From coaching session with ${session?.staff_name || 'team member'} on ${session?.session_date || ''}`,
      due_date: due_date || null,
      priority: 'medium',
      status: 'open',
      source: 'coaching',
      list_target: target,
      assigned_to: assigned_to || null,
      coaching_session_id: session?.id || null,
      created_by: req.user.id,
      studio_id: req.studio.id,
    })
    .select()
    .single()

  if (todoErr) return res.status(500).json({ error: todoErr.message })

  // Mark the action item as pushed
  await db
    .from('coaching_action_items')
    .update({ pushed_to_todo: true, todo_id: todo.id })
    .eq('id', req.params.id)

  res.json({ todo, action_id: req.params.id })
})

module.exports = router
