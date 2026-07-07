const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const { requireRole } = require('../middleware/roleGuard')
const authenticate = require('../middleware/authMiddleware')
const { requireStudio } = require('../middleware/studioMiddleware')
const { todayInChicago } = require('../utils/dates')

const supabase = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Apply studio middleware to all routes
router.use(authenticate, requireStudio)

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
      // Stays open from its scheduled weekday through the end of that week (Sat),
      // so an unfinished weekly task carries through the week. Resets next week.
      return dow >= task.day_of_week
    case 'specific_days':
      // Appears only on the chosen weekdays (e.g. Mon/Wed/Fri). Resets each day.
      return Array.isArray(task.days_of_week) && task.days_of_week.includes(dow)
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
router.get('/today', async (req, res) => {
  const date = req.query.date || todayInChicago()
  const db = supabase()

  const [tasksRes, completionsRes, recentRes] = await Promise.all([
    db.from('cleaning_tasks').select('*').eq('studio_id', req.studio.id).eq('active', true).order('sort_order').order('created_at'),
    db.from('cleaning_completions').select('*').eq('studio_id', req.studio.id).eq('completion_date', date),
    // Last 90 days of completions to find "last completed" per task
    db.from('cleaning_completions').select('task_id, completion_date, completed_by, completed_at')
      .eq('studio_id', req.studio.id)
      .order('completed_at', { ascending: false }).limit(2000),
  ])

  if (tasksRes.error) return res.status(500).json({ error: tasksRes.error.message })
  if (completionsRes.error) return res.status(500).json({ error: completionsRes.error.message })

  // Build last-completion map: task_id → most recent completion
  const lastMap = {}
  for (const c of (recentRes.data || [])) {
    if (!lastMap[c.task_id]) lastMap[c.task_id] = c
  }

  // For weekly tasks, "completed" spans the whole week (Sun–Sat) containing the
  // date — completing on any day that week closes it; it reopens next week.
  const dObj = new Date(date + 'T00:00:00')
  const weekStart = new Date(dObj); weekStart.setDate(dObj.getDate() - dObj.getDay())
  const weekStartStr = weekStart.toISOString().slice(0, 10)
  const weekCompletionByTask = {}   // task_id → latest completion this week (recentRes is completed_at desc)
  for (const c of (recentRes.data || [])) {
    if (c.completion_date >= weekStartStr && c.completion_date <= date && !weekCompletionByTask[c.task_id]) {
      weekCompletionByTask[c.task_id] = c
    }
  }

  // Resolve user names for all unique completed_by IDs
  const userMap = await buildUserMap(db)

  const completedIds = new Set(completionsRes.data.map(c => c.task_id))

  const todaysTasks = tasksRes.data
    .filter(t => taskIsActiveOnDate(t, date))
    .map(t => {
      const last = lastMap[t.id] || null
      const weekly = t.frequency === 'weekly'
      const weekComp = weekly ? (weekCompletionByTask[t.id] || null) : null
      return {
        ...t,
        completed: weekly ? !!weekComp : completedIds.has(t.id),
        completion: weekly ? weekComp : (completionsRes.data.find(c => c.task_id === t.id) || null),
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
router.get('/history/:taskId', async (req, res) => {
  const db = supabase()

  const [histRes, userMap] = await Promise.all([
    db.from('cleaning_completions')
      .select('*')
      .eq('studio_id', req.studio.id)
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
router.get('/tasks', requireRole('owner', 'manager'), async (req, res) => {
  const { data, error } = await supabase()
    .from('cleaning_tasks')
    .select('*')
    .eq('studio_id', req.studio.id)
    .order('sort_order')
    .order('frequency')
    .order('created_at')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── POST /api/cleaning/tasks ─────────────────────────────────────────────────
router.post('/tasks', requireRole('owner', 'manager'), async (req, res) => {
  const { title, area, description, task_type, frequency, day_of_week, days_of_week, day_of_month, quarterly_dates, one_off_date, sort_order } = req.body

  if (!title || !frequency) return res.status(400).json({ error: 'title and frequency are required' })

  const { data, error } = await supabase()
    .from('cleaning_tasks')
    .insert({
      title, area,
      description: description ?? null,
      task_type: task_type || 'Cleaning',
      frequency,
      day_of_week: day_of_week ?? null,
      days_of_week: days_of_week ?? null,
      day_of_month: day_of_month ?? null,
      quarterly_dates: quarterly_dates ?? null,
      one_off_date: one_off_date ?? null,
      sort_order: sort_order ?? 0,
      created_by: req.user.id,
      studio_id: req.studio.id,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── PUT /api/cleaning/tasks/:id ─────────────────────────────────────────────
router.put('/tasks/:id', requireRole('owner', 'manager'), async (req, res) => {
  const { title, area, description, task_type, frequency, day_of_week, days_of_week, day_of_month, quarterly_dates, one_off_date, active, sort_order } = req.body

  const { data, error } = await supabase()
    .from('cleaning_tasks')
    .update({ title, area, description, task_type, frequency, day_of_week, days_of_week, day_of_month, quarterly_dates, one_off_date, active, sort_order })
    .eq('id', req.params.id)
    .eq('studio_id', req.studio.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── DELETE /api/cleaning/tasks/:id ──────────────────────────────────────────
router.delete('/tasks/:id', requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await supabase()
    .from('cleaning_tasks')
    .delete()
    .eq('id', req.params.id)
    .eq('studio_id', req.studio.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── GET /api/cleaning/analytics?days=30 ─────────────────────────────────────
// Returns completion stats per task and per staff member for the last N days.
// Accessible to all authenticated roles.
router.get('/analytics', async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days) || 30, 7), 90)
  const db   = supabase()

  // Build date range
  const toDate   = new Date()
  const fromDate = new Date(toDate)
  fromDate.setDate(fromDate.getDate() - (days - 1))
  const fromStr  = fromDate.toISOString().slice(0, 10)
  const toStr    = toDate.toISOString().slice(0, 10)

  // Build array of every date in range
  const dateRange = []
  for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
    dateRange.push(d.toISOString().slice(0, 10))
  }

  const [tasksRes, completionsRes, userMapRes, inactiveRes] = await Promise.all([
    db.from('cleaning_tasks').select('*').eq('studio_id', req.studio.id).eq('active', true),
    db.from('cleaning_completions')
      .select('task_id, completed_by, completion_date')
      .eq('studio_id', req.studio.id)
      .gte('completion_date', fromStr)
      .lte('completion_date', toStr),
    buildUserMap(db),
    db.from('user_profiles').select('id').eq('is_active', false),
  ])
  const inactiveIds = new Set((inactiveRes?.data || []).map(r => r.id))

  if (tasksRes.error)       return res.status(500).json({ error: tasksRes.error.message })
  if (completionsRes.error) return res.status(500).json({ error: completionsRes.error.message })

  const tasks       = tasksRes.data || []
  const completions = completionsRes.data || []
  const userMap     = userMapRes

  // ── Per-task stats ──────────────────────────────────────────────────────────
  const taskStats = tasks.map(task => {
    const scheduledDates = dateRange.filter(d => taskIsActiveOnDate(task, d))
    const scheduledCount = scheduledDates.length
    const taskCompletions = completions.filter(c => c.task_id === task.id)
    const completedDates  = new Set(taskCompletions.map(c => c.completion_date))
    const completedCount  = scheduledDates.filter(d => completedDates.has(d)).length

    // Last completed date
    const sorted = taskCompletions.slice().sort((a, b) => b.completion_date.localeCompare(a.completion_date))
    const last   = sorted[0] || null

    // Days since last completed
    const daysSinceLast = last
      ? Math.floor((toDate - new Date(last.completion_date)) / 86400000)
      : null

    return {
      id:             task.id,
      title:          task.title,
      task_type:      task.task_type,
      frequency:      task.frequency,
      area:           task.area,
      scheduledCount,
      completedCount,
      completionRate: scheduledCount > 0 ? completedCount / scheduledCount : null,
      lastCompletedDate:   last?.completion_date || null,
      lastCompletedBy:     last ? (userMap[last.completed_by] || 'Team Member') : null,
      daysSinceLast,
      // Missed = scheduled but no completion that day
      missedCount: scheduledCount - completedCount,
    }
  }).filter(t => t.scheduledCount > 0) // only tasks that appeared during this period

  // ── Per-user stats ──────────────────────────────────────────────────────────
  const userTotals = {}
  for (const c of completions) {
    const uid = c.completed_by
    if (!userTotals[uid]) userTotals[uid] = { userId: uid, name: userMap[uid] || 'Team Member', count: 0, taskSet: new Set() }
    userTotals[uid].count++
    userTotals[uid].taskSet.add(c.task_id)
  }
  const userStats = Object.values(userTotals)
    .filter(u => !inactiveIds.has(u.userId)) // hide deactivated employees from the leaderboard
    .map(u => ({ userId: u.userId, name: u.name, count: u.count, uniqueTasks: u.taskSet.size }))
    .sort((a, b) => b.count - a.count)

  // ── Totals ──────────────────────────────────────────────────────────────────
  const totalScheduled = taskStats.reduce((s, t) => s + t.scheduledCount, 0)
  const totalCompleted = taskStats.reduce((s, t) => s + t.completedCount, 0)

  res.json({
    period: { from: fromStr, to: toStr, days },
    taskStats,
    userStats,
    totalScheduled,
    totalCompleted,
    overallRate: totalScheduled > 0 ? totalCompleted / totalScheduled : 0,
  })
})

// ─── POST /api/cleaning/complete ─────────────────────────────────────────────
// TSA marks a task done
router.post('/complete', async (req, res) => {
  const { task_id, date } = req.body
  const completion_date = date || todayInChicago()

  const { data, error} = await supabase()
    .from('cleaning_completions')
    .upsert({
      task_id,
      completion_date,
      completed_by: req.user.id,
      completed_at: new Date().toISOString(),
      studio_id: req.studio.id
    }, { onConflict: 'studio_id, task_id, completion_date', ignoreDuplicates: false })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── DELETE /api/cleaning/complete ───────────────────────────────────────────
// TSA un-checks a task
router.delete('/complete', async (req, res) => {
  const { task_id, date } = req.body
  const completion_date = date || todayInChicago()
  const db = supabase()

  // Weekly tasks may have been completed on a different day this week — clear the
  // whole week so un-checking works regardless of which day it was completed.
  const { data: task } = await db.from('cleaning_tasks').select('frequency').eq('id', task_id).maybeSingle()

  let q = db.from('cleaning_completions').delete()
    .eq('studio_id', req.studio.id)
    .eq('task_id', task_id)
    .eq('completed_by', req.user.id)

  if (task?.frequency === 'weekly') {
    const dObj = new Date(completion_date + 'T00:00:00')
    const ws = new Date(dObj); ws.setDate(dObj.getDate() - dObj.getDay())
    const we = new Date(ws); we.setDate(ws.getDate() + 6)
    q = q.gte('completion_date', ws.toISOString().slice(0, 10)).lte('completion_date', we.toISOString().slice(0, 10))
  } else {
    q = q.eq('completion_date', completion_date)
  }

  const { error } = await q
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

module.exports = router
