const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const { requireRole } = require('../middleware/roleGuard')
const authenticate = require('../middleware/authMiddleware')

const supabase = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ─── Helpers ────────────────────────────────────────────────────────────────

function taskIsActiveOnDate(task, date) {
  const d = new Date(date)
  const dow = d.getDay()           // 0=Sun
  const dom = d.getDate()
  const dateStr = date             // 'YYYY-MM-DD'

  switch (task.frequency) {
    case 'daily':
      return true
    case 'weekly':
      return task.day_of_week === dow
    case 'monthly':
      return task.day_of_month === dom
    case 'quarterly':
      return Array.isArray(task.quarterly_dates) &&
        task.quarterly_dates.includes(dateStr)
    case 'one_off':
      return task.one_off_date === dateStr
    default:
      return false
  }
}

// ─── Shared helper: build userId→name map from Supabase Auth ─────────────────
async function buildUserMap(db) {
  const { data: { users } } = await db.auth.admin.listUsers({ perPage: 200 })
  const map = {}
  for (const u of users || []) {
    map[u.id] = u.user_metadata?.full_name || u.email?.split('@')[0] || 'Team Member'
  }
  return map
}

// ─── GET /api/cleaning/today?date=YYYY-MM-DD ────────────────────────────────
// Returns tasks that should appear today + their completion status + last completion
router.get('/today', authenticate, async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10)
  const db = supabase()

  const [tasksRes, completionsRes, recentRes] = await Promise.all([
    db.from('cleaning_tasks').select('*').eq('active', true).order('sort_order').order('created_at'),
    db.from('cleaning_completions').select('*').eq('completion_date', date),
    // Last 90 days of completions to find "last completed" per task
    db.from('cleaning_completions').select('task_id, completion_date, completed_by, completed_at')
      .order('completed_at', { ascending: false }).limit(2000),
  ])

  if (tasksRes.error) return res.status(500).json({ error: tasksRes.error.message })
  if (completionsRes.error) return res.status(500).json({ error: completionsRes.error.message })

  // Build last-completion map: task_id → most recent completion
  const lastMap = {}
  for (const c of (recentRes.data || [])) {
    if (!lastMap[c.task_id]) lastMap[c.task_id] = c
  }

  // Resolve user names for all unique completed_by IDs
  const userMap = await buildUserMap(db)

  const completedIds = new Set(completionsRes.data.map(c => c.task_id))

  const todaysTasks = tasksRes.data
    .filter(t => taskIsActiveOnDate(t, date))
    .map(t => {
      const last = lastMap[t.id] || null
      return {
        ...t,
        completed: completedIds.has(t.id),
        completion: completionsRes.data.find(c => c.task_id === t.id) || null,
        last_completion: last ? {
          date: last.completion_date,
          completed_at: last.completed_at,
          by_id: last.completed_by,
          by_name: userMap[last.completed_by] || 'Team Member',
        } : null,
      }
    })

  res.json({ date, tasks: todaysTasks })
})

// ─── GET /api/cleaning/history/:taskId ───────────────────────────────────────
// Returns the last 60 completions for a single task, with user names
router.get('/history/:taskId', authenticate, async (req, res) => {
  const db = supabase()

  const [histRes, userMap] = await Promise.all([
    db.from('cleaning_completions')
      .select('*')
      .eq('task_id', req.params.taskId)
      .order('completed_at', { ascending: false })
      .limit(60),
    buildUserMap(db),
  ])

  if (histRes.error) return res.status(500).json({ error: histRes.error.message })

  const enriched = (histRes.data || []).map(c => ({
    ...c,
    by_name: userMap[c.completed_by] || 'Team Member',
  }))

  res.json(enriched)
})

// ─── GET /api/cleaning/tasks ─────────────────────────────────────────────────
// Full library (owner/manager only)
router.get('/tasks', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { data, error } = await supabase()
    .from('cleaning_tasks')
    .select('*')
    .order('sort_order')
    .order('frequency')
    .order('created_at')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── POST /api/cleaning/tasks ─────────────────────────────────────────────────
router.post('/tasks', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { title, area, description, task_type, frequency, day_of_week, day_of_month, quarterly_dates, one_off_date, sort_order } = req.body

  if (!title || !frequency) return res.status(400).json({ error: 'title and frequency are required' })

  const { data, error } = await supabase()
    .from('cleaning_tasks')
    .insert({
      title, area,
      description: description ?? null,
      task_type: task_type || 'Cleaning',
      frequency,
      day_of_week: day_of_week ?? null,
      day_of_month: day_of_month ?? null,
      quarterly_dates: quarterly_dates ?? null,
      one_off_date: one_off_date ?? null,
      sort_order: sort_order ?? 0,
      created_by: req.user.id,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── PUT /api/cleaning/tasks/:id ─────────────────────────────────────────────
router.put('/tasks/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { title, area, description, task_type, frequency, day_of_week, day_of_month, quarterly_dates, one_off_date, active, sort_order } = req.body

  const { data, error } = await supabase()
    .from('cleaning_tasks')
    .update({ title, area, description, task_type, frequency, day_of_week, day_of_month, quarterly_dates, one_off_date, active, sort_order })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── DELETE /api/cleaning/tasks/:id ──────────────────────────────────────────
router.delete('/tasks/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await supabase()
    .from('cleaning_tasks')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── POST /api/cleaning/complete ─────────────────────────────────────────────
// TSA marks a task done
router.post('/complete', authenticate, async (req, res) => {
  const { task_id, date } = req.body
  const completion_date = date || new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase()
    .from('cleaning_completions')
    .upsert({ task_id, completion_date, completed_by: req.user.id }, { onConflict: 'task_id,completion_date' })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── DELETE /api/cleaning/complete ───────────────────────────────────────────
// TSA un-checks a task
router.delete('/complete', authenticate, async (req, res) => {
  const { task_id, date } = req.body
  const completion_date = date || new Date().toISOString().slice(0, 10)

  const { error } = await supabase()
    .from('cleaning_completions')
    .delete()
    .eq('task_id', task_id)
    .eq('completion_date', completion_date)
    .eq('completed_by', req.user.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

module.exports = router
