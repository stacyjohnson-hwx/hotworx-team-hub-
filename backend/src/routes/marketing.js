const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

router.use(authenticate, requireStudio)

// Sunday-based week start (matches the rest of the app)
function weekStartStr() {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().slice(0, 10)
}
const todayStr = () => new Date().toISOString().slice(0, 10)

// Does this task's role target apply to the given role? owner+manager => manager.
function targetsRole(roleTarget, role) {
  if (!roleTarget || roleTarget === 'all') return true
  if (roleTarget === 'manager') return role === 'owner' || role === 'manager'
  if (roleTarget === 'tsa' || roleTarget === 'staff') return role === 'tsa'
  return true // unknown designations show to everyone for now
}

// ─── GET /api/marketing/tasks — my task list with completion status ───────────
router.get('/tasks', async (req, res) => {
  const database = db()
  const [{ data: tasks, error }, { data: completions }] = await Promise.all([
    database.from('marketing_tasks').select('*').eq('studio_id', req.studio.id).eq('active', true).order('created_at'),
    database.from('marketing_task_completions').select('task_id, completion_date')
      .eq('studio_id', req.studio.id).eq('staff_id', req.user.id),
  ])
  if (error) return res.status(500).json({ error: error.message })

  const today = todayStr()
  const wkStart = weekStartStr()

  // Build a quick lookup of this staff's completions
  const myCompletions = completions || []

  const result = (tasks || [])
    .filter(t => targetsRole(t.role_target, req.role))
    .map(t => {
      // Has the current user completed it for the active period?
      const done = myCompletions.some(c => {
        if (c.task_id !== t.id) return false
        if (t.cadence === 'weekly') return c.completion_date >= wkStart
        return c.completion_date === today // daily / shift treated as per-day for now
      })
      return { ...t, completed: done }
    })

  res.json(result)
})

// ─── POST /api/marketing/tasks/:id/complete ───────────────────────────────────
router.post('/tasks/:id/complete', async (req, res) => {
  const { notes, field_values } = req.body
  const database = db()

  const { data: task, error: tErr } = await database
    .from('marketing_tasks').select('point_value, cadence')
    .eq('id', req.params.id).eq('studio_id', req.studio.id).maybeSingle()
  if (tErr) return res.status(500).json({ error: tErr.message })
  if (!task) return res.status(404).json({ error: 'Task not found' })

  const { data, error } = await database
    .from('marketing_task_completions')
    .insert({
      task_id: req.params.id,
      studio_id: req.studio.id,
      staff_id: req.user.id,
      completion_date: todayStr(),
      notes: notes || null,
      field_values: field_values || {},
      points_awarded: task.point_value || 0,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── Manager task management (create / edit / delete) ─────────────────────────
router.post('/tasks', requireRole('owner', 'manager'), async (req, res) => {
  const { title, description, type, category, role_target, point_value, required_uploads, required_fields, cadence } = req.body
  if (!title) return res.status(400).json({ error: 'title is required' })
  const { data, error } = await db()
    .from('marketing_tasks')
    .insert({
      studio_id: req.studio.id,
      title,
      description: description || null,
      type: type || 'studio_wide',
      category: category || 'content',
      role_target: role_target || 'all',
      point_value: parseInt(point_value) || 10,
      required_uploads: parseInt(required_uploads) || 0,
      required_fields: Array.isArray(required_fields) ? required_fields : [],
      cadence: cadence || 'daily',
      created_by: req.user.id,
    })
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.put('/tasks/:id', requireRole('owner', 'manager'), async (req, res) => {
  const { title, description, type, category, role_target, point_value, required_uploads, required_fields, cadence, active } = req.body
  const updates = { updated_at: new Date().toISOString() }
  if (title !== undefined) updates.title = title
  if (description !== undefined) updates.description = description || null
  if (type !== undefined) updates.type = type
  if (category !== undefined) updates.category = category
  if (role_target !== undefined) updates.role_target = role_target || 'all'
  if (point_value !== undefined) updates.point_value = parseInt(point_value) || 10
  if (required_uploads !== undefined) updates.required_uploads = parseInt(required_uploads) || 0
  if (required_fields !== undefined) updates.required_fields = Array.isArray(required_fields) ? required_fields : []
  if (cadence !== undefined) updates.cadence = cadence
  if (active !== undefined) updates.active = !!active

  const { data, error } = await db()
    .from('marketing_tasks').update(updates)
    .eq('id', req.params.id).eq('studio_id', req.studio.id)
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.delete('/tasks/:id', requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await db()
    .from('marketing_tasks').update({ active: false })
    .eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

module.exports = router
