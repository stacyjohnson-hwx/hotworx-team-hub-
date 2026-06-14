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

// ─── Content Library ──────────────────────────────────────────────────────────

async function staffNameMap(database, ids) {
  const map = {}
  for (const id of [...new Set(ids.filter(Boolean))]) {
    const { data } = await database.auth.admin.getUserById(id)
    map[id] = data?.user?.user_metadata?.full_name || data?.user?.email?.split('@')[0] || 'Team Member'
  }
  return map
}

// GET /api/marketing/content?category=&type=&staff_id=&status=&ready=
router.get('/content', async (req, res) => {
  const { category, type, staff_id, status, ready } = req.query
  const database = db()
  let q = database.from('marketing_content_assets').select('*')
    .eq('studio_id', req.studio.id)
    .neq('status', 'archived')
    .order('uploaded_at', { ascending: false })
  if (category) q = q.eq('category', category)
  if (type)     q = q.eq('file_type', type)
  if (staff_id) q = q.eq('staff_id', staff_id)
  if (status)   q = q.eq('status', status)
  if (ready === 'true') q = q.eq('ready_for_soci', true)

  const { data, error } = await q
  if (error) return res.status(500).json({ error: error.message })

  const names = await staffNameMap(database, (data || []).map(a => a.staff_id))
  const taskIds = [...new Set((data || []).map(a => a.task_id).filter(Boolean))]
  let taskMap = {}
  if (taskIds.length) {
    const { data: tasks } = await database.from('marketing_tasks').select('id, title').in('id', taskIds)
    for (const t of (tasks || [])) taskMap[t.id] = t.title
  }
  res.json((data || []).map(a => ({
    ...a,
    staff_name: names[a.staff_id] || 'Team Member',
    task_title: a.task_id ? (taskMap[a.task_id] || null) : null,
  })))
})

// POST /api/marketing/content — register an uploaded asset (after storage upload)
router.post('/content', async (req, res) => {
  const { file_url, file_path, file_type, category, member_name, caption, task_id, completion_id } = req.body
  const { data, error } = await db()
    .from('marketing_content_assets')
    .insert({
      studio_id: req.studio.id,
      staff_id: req.user.id,
      task_id: task_id || null,
      completion_id: completion_id || null,
      file_url: file_url || null,
      file_path: file_path || null,
      file_type: file_type || 'photo',
      category: category || 'member_photos',
      member_name: member_name || null,
      caption: caption || null,
    })
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// PUT /api/marketing/content/:id — manager: approve/flag/archive, ready-for-soci, edits
router.put('/content/:id', requireRole('owner', 'manager'), async (req, res) => {
  const { status, ready_for_soci, posted_link, category, member_name, caption } = req.body
  const updates = {}
  if (status !== undefined)         updates.status = status
  if (ready_for_soci !== undefined) updates.ready_for_soci = !!ready_for_soci
  if (posted_link !== undefined)    updates.posted_link = posted_link || null
  if (category !== undefined)       updates.category = category
  if (member_name !== undefined)    updates.member_name = member_name || null
  if (caption !== undefined)        updates.caption = caption || null

  const { data, error } = await db()
    .from('marketing_content_assets').update(updates)
    .eq('id', req.params.id).eq('studio_id', req.studio.id)
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /api/marketing/content/:id — manager (also removes the storage file)
router.delete('/content/:id', requireRole('owner', 'manager'), async (req, res) => {
  const database = db()
  const { data: asset } = await database.from('marketing_content_assets')
    .select('file_path').eq('id', req.params.id).eq('studio_id', req.studio.id).maybeSingle()
  if (asset?.file_path) {
    await database.storage.from('marketing-content').remove([asset.file_path]).catch(() => {})
  }
  const { error } = await database.from('marketing_content_assets')
    .delete().eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── Leaderboard + weekly summary (Phase 3) ──────────────────────────────────

// GET /api/marketing/leaderboard — weekly + all-time points, your summary, team totals
router.get('/leaderboard', async (req, res) => {
  const database = db()
  const wkStart = weekStartStr()

  const [{ data: members }, { data: inactive }, { data: settings }, { data: completions }, { data: assets }, { data: leadgenCompletions }] = await Promise.all([
    database.from('user_studios').select('user_id, role').eq('studio_id', req.studio.id),
    database.from('user_profiles').select('id').eq('is_active', false),
    database.from('marketing_settings').select('*').eq('studio_id', req.studio.id).maybeSingle(),
    database.from('marketing_task_completions').select('staff_id, points_awarded, completion_date, completed_at').eq('studio_id', req.studio.id),
    database.from('marketing_content_assets').select('staff_id, uploaded_at').eq('studio_id', req.studio.id).neq('status', 'archived'),
    database.from('leadgen_completions').select('staff_id, points_awarded, completion_date, completed_at').eq('studio_id', req.studio.id),
  ])

  const inactiveIds = new Set((inactive || []).map(r => r.id))
  const ownerIds = new Set((members || []).filter(m => m.role === 'owner').map(m => m.user_id))
  const memberIds = [...new Set((members || []).map(m => m.user_id).filter(id => !inactiveIds.has(id)))]
  const resetAt = settings?.leaderboard_reset_at ? settings.leaderboard_reset_at.slice(0, 10) : null
  const effStart = resetAt && resetAt > wkStart ? resetAt : wkStart

  // Combined points: Content (marketing) + Marketing (leadgen) task completions
  const compl = [...(completions || []), ...(leadgenCompletions || [])]
  const names = await staffNameMap(database, memberIds)

  // Profile photos for each member (avatar_url on user_profiles)
  const avatarMap = {}
  if (memberIds.length) {
    const { data: profileRows } = await database.from('user_profiles').select('id, avatar_url').in('id', memberIds)
    for (const p of (profileRows || [])) avatarMap[p.id] = p.avatar_url || null
  }

  // Weekly streak: consecutive Sundays back from this week with >=1 completion
  function streakFor(staffId) {
    const weeks = new Set(compl.filter(c => c.staff_id === staffId).map(c => {
      const d = new Date(c.completion_date + 'T00:00:00'); d.setDate(d.getDate() - d.getDay())
      return d.toISOString().slice(0, 10)
    }))
    let streak = 0
    const cur = new Date(wkStart + 'T00:00:00')
    // allow the streak to count from this week or last week
    if (!weeks.has(wkStart)) cur.setDate(cur.getDate() - 7)
    while (weeks.has(cur.toISOString().slice(0, 10))) { streak++; cur.setDate(cur.getDate() - 7) }
    return streak
  }

  const allRows = memberIds.map(id => {
    const mine = compl.filter(c => c.staff_id === id)
    const weekly = mine.filter(c => (c.completed_at || '').slice(0, 10) >= effStart).reduce((s, c) => s + (c.points_awarded || 0), 0)
    const allTime = mine.reduce((s, c) => s + (c.points_awarded || 0), 0)
    const tasksThisWeek = mine.filter(c => c.completion_date >= wkStart).length
    const contentThisWeek = (assets || []).filter(a => a.staff_id === id && (a.uploaded_at || '').slice(0, 10) >= wkStart).length
    return {
      staff_id: id, name: names[id] || 'Team Member', avatar_url: avatarMap[id] || null,
      weekly_points: weekly, all_time_points: allTime,
      tasks_this_week: tasksThisWeek, content_this_week: contentThisWeek,
      streak: streakFor(id),
    }
  }).sort((a, b) => b.weekly_points - a.weekly_points || b.all_time_points - a.all_time_points)

  // The owner is excluded from the competitive leaderboard (but still sees their own points via `me`).
  const me = allRows.find(r => r.staff_id === req.user.id) || { weekly_points: 0, all_time_points: 0, tasks_this_week: 0, content_this_week: 0, streak: 0 }
  const rows = allRows.filter(r => !ownerIds.has(r.staff_id))
  const team = rows.reduce((acc, r) => ({
    tasks: acc.tasks + r.tasks_this_week,
    content: acc.content + r.content_this_week,
    points: acc.points + r.weekly_points,
  }), { tasks: 0, content: 0, points: 0 })

  res.json({
    week_start: wkStart,
    reward_label: settings?.weekly_reward_label || null,
    rows, me, team,
  })
})

// POST /api/marketing/leaderboard/reset — manager: reset the weekly board
router.post('/leaderboard/reset', requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await db().from('marketing_settings')
    .upsert({ studio_id: req.studio.id, leaderboard_reset_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'studio_id' })
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// PUT /api/marketing/settings — manager: set the weekly reward label
router.put('/settings', requireRole('owner', 'manager'), async (req, res) => {
  const { weekly_reward_label } = req.body
  const { data, error } = await db().from('marketing_settings')
    .upsert({ studio_id: req.studio.id, weekly_reward_label: weekly_reward_label || null, updated_at: new Date().toISOString() }, { onConflict: 'studio_id' })
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── Manager dashboard + content review (Phase 4) ─────────────────────────────

// GET /api/marketing/dashboard — weekly manager metrics
router.get('/dashboard', requireRole('owner', 'manager'), async (req, res) => {
  const database = db()
  const wkStart = weekStartStr()
  const [{ data: members }, { data: inactive }, { data: tasks }, { data: completions }, { data: assets }] = await Promise.all([
    database.from('user_studios').select('user_id, role').eq('studio_id', req.studio.id),
    database.from('user_profiles').select('id').eq('is_active', false),
    database.from('marketing_tasks').select('id, title, role_target, point_value').eq('studio_id', req.studio.id).eq('active', true),
    database.from('marketing_task_completions').select('task_id, staff_id, points_awarded, completion_date, completed_at, task:marketing_tasks(title)').eq('studio_id', req.studio.id).gte('completion_date', wkStart),
    database.from('marketing_content_assets').select('id, staff_id, status, uploaded_at').eq('studio_id', req.studio.id).neq('status', 'archived'),
  ])

  const inactiveIds = new Set((inactive || []).map(r => r.id))
  const memberList = (members || []).filter(m => !inactiveIds.has(m.user_id))
  const compl = completions || []

  // Completion rate = completed (staff,task) pairs / eligible (staff,task) pairs this week
  let expectedPairs = 0
  for (const t of (tasks || [])) {
    expectedPairs += memberList.filter(m => {
      if (!t.role_target || t.role_target === 'all') return true
      if (t.role_target === 'manager') return m.role === 'owner' || m.role === 'manager'
      if (t.role_target === 'tsa' || t.role_target === 'staff') return m.role === 'tsa'
      return true
    }).length
  }
  const donePairs = new Set(compl.map(c => `${c.task_id}|${c.staff_id}`)).size
  const completionRate = expectedPairs > 0 ? Math.round((donePairs / expectedPairs) * 100) : 0

  const reviewsRequested  = compl.filter(c => (c.task?.title || '').toLowerCase().includes('google review')).length
  const referralsRequested = compl.filter(c => (c.task?.title || '').toLowerCase().includes('referral')).length
  const contentThisWeek = (assets || []).filter(a => (a.uploaded_at || '').slice(0, 10) >= wkStart).length
  const pendingReview = (assets || []).filter(a => a.status === 'pending').length

  // Top performer this week
  const pts = {}
  for (const c of compl) pts[c.staff_id] = (pts[c.staff_id] || 0) + (c.points_awarded || 0)
  let topId = null, topPts = 0
  for (const [id, p] of Object.entries(pts)) if (p > topPts) { topPts = p; topId = id }
  let topPerformer = null
  if (topId) {
    const names = await staffNameMap(database, [topId])
    topPerformer = { name: names[topId], points: topPts }
  }

  res.json({
    completion_rate: completionRate,
    content_this_week: contentThisWeek,
    reviews_requested: reviewsRequested,
    referrals_requested: referralsRequested,
    pending_review: pendingReview,
    top_performer: topPerformer,
  })
})

// GET /api/marketing/tasks/all — manager: every task incl. inactive (to activate/deactivate)
router.get('/tasks/all', requireRole('owner', 'manager'), async (req, res) => {
  const { data, error } = await db().from('marketing_tasks')
    .select('*').eq('studio_id', req.studio.id).order('type').order('created_at')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/marketing/content/batch-approve — approve all pending assets
router.post('/content/batch-approve', requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await db().from('marketing_content_assets')
    .update({ status: 'approved' })
    .eq('studio_id', req.studio.id).eq('status', 'pending')
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// ─── Idea submissions (Phase 5) ───────────────────────────────────────────────

// GET /api/marketing/ideas — shared idea board for the studio
router.get('/ideas', async (req, res) => {
  const database = db()
  const { data, error } = await database.from('marketing_ideas')
    .select('*').eq('studio_id', req.studio.id).order('submitted_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  const names = await staffNameMap(database, (data || []).map(i => i.staff_id))
  res.json((data || []).map(i => ({ ...i, staff_name: names[i.staff_id] || 'Team Member' })))
})

// POST /api/marketing/ideas — any staff can submit
router.post('/ideas', async (req, res) => {
  const { text, category, reference_url } = req.body
  if (!text || !text.trim()) return res.status(400).json({ error: 'idea text is required' })
  const { data, error } = await db().from('marketing_ideas')
    .insert({
      studio_id: req.studio.id, staff_id: req.user.id,
      text: text.trim(), category: category || 'other', reference_url: reference_url || null,
    })
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// PUT /api/marketing/ideas/:id — manager: set review status
router.put('/ideas/:id', requireRole('owner', 'manager'), async (req, res) => {
  const { status } = req.body
  const { data, error } = await db().from('marketing_ideas')
    .update({ status }).eq('id', req.params.id).eq('studio_id', req.studio.id)
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /api/marketing/ideas/:id — manager or the submitter
router.delete('/ideas/:id', async (req, res) => {
  const database = db()
  const isManager = req.role === 'owner' || req.role === 'manager'
  let q = database.from('marketing_ideas').delete().eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (!isManager) q = q.eq('staff_id', req.user.id)
  const { error } = await q
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

module.exports = router
