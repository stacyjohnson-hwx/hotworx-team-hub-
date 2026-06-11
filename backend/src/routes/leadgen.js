const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const todayStr = () => new Date().toISOString().slice(0, 10)
function weekStartStr() {
  const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10)
}
function targetsRole(roleTarget, role) {
  if (!roleTarget || roleTarget === 'all') return true
  if (roleTarget === 'manager') return role === 'owner' || role === 'manager'
  if (roleTarget === 'tsa' || roleTarget === 'staff') return role === 'tsa'
  return true
}
async function staffNameMap(database, ids) {
  const map = {}
  for (const id of [...new Set(ids.filter(Boolean))]) {
    const { data } = await database.auth.admin.getUserById(id)
    map[id] = data?.user?.user_metadata?.full_name || data?.user?.email?.split('@')[0] || 'Team Member'
  }
  return map
}

router.use(authenticate, requireStudio)

// ─── My Lead Gen: active plays as tasks, with my completion status ────────────
router.get('/tasks', async (req, res) => {
  const database = db()
  const [{ data: plays, error }, { data: completions }] = await Promise.all([
    database.from('leadgen_plays').select('*').eq('studio_id', req.studio.id).eq('active', true).eq('archived', false).order('created_at'),
    database.from('leadgen_completions').select('play_id, completion_date').eq('studio_id', req.studio.id).eq('staff_id', req.user.id),
  ])
  if (error) return res.status(500).json({ error: error.message })
  const today = todayStr(), wk = weekStartStr()
  const mine = completions || []
  const result = (plays || []).filter(p => targetsRole(p.role_target, req.role)).map(p => {
    const done = mine.some(c => {
      if (c.play_id !== p.id) return false
      if (p.cadence === 'weekly') return c.completion_date >= wk
      if (p.cadence === 'one_off') return true
      return c.completion_date === today
    })
    return { ...p, completed: done }
  })
  res.json(result)
})

router.post('/plays/:id/complete', async (req, res) => {
  const database = db()
  const { data: play, error: pErr } = await database.from('leadgen_plays')
    .select('point_value').eq('id', req.params.id).eq('studio_id', req.studio.id).maybeSingle()
  if (pErr) return res.status(500).json({ error: pErr.message })
  if (!play) return res.status(404).json({ error: 'Play not found' })
  const { data, error } = await database.from('leadgen_completions')
    .insert({ play_id: req.params.id, studio_id: req.studio.id, staff_id: req.user.id, completion_date: todayStr(), notes: req.body.notes || null, points_awarded: play.point_value || 0 })
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── Play Library (the bank) — manager ───────────────────────────────────────
router.get('/plays', requireRole('owner', 'manager'), async (req, res) => {
  const { data, error } = await db().from('leadgen_plays')
    .select('*').eq('studio_id', req.studio.id).eq('archived', false).order('active', { ascending: false }).order('category').order('created_at')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.post('/plays', requireRole('owner', 'manager'), async (req, res) => {
  const { title, description, steps, category, point_value, cadence, role_target, active } = req.body
  if (!title) return res.status(400).json({ error: 'title is required' })
  const { data, error } = await db().from('leadgen_plays').insert({
    studio_id: req.studio.id, title, description: description || null, steps: steps || null,
    category: category || 'in_studio', point_value: parseInt(point_value) || 20,
    cadence: cadence || 'weekly', role_target: role_target || 'all', active: !!active, created_by: req.user.id,
  }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.put('/plays/:id', requireRole('owner', 'manager'), async (req, res) => {
  const { title, description, steps, category, point_value, cadence, role_target, active } = req.body
  const updates = { updated_at: new Date().toISOString() }
  if (title !== undefined) updates.title = title
  if (description !== undefined) updates.description = description || null
  if (steps !== undefined) updates.steps = steps || null
  if (category !== undefined) updates.category = category
  if (point_value !== undefined) updates.point_value = parseInt(point_value) || 20
  if (cadence !== undefined) updates.cadence = cadence
  if (role_target !== undefined) updates.role_target = role_target || 'all'
  if (active !== undefined) updates.active = !!active
  const { data, error } = await db().from('leadgen_plays').update(updates)
    .eq('id', req.params.id).eq('studio_id', req.studio.id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.delete('/plays/:id', requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await db().from('leadgen_plays').update({ archived: true, active: false })
    .eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── Suggestion board ─────────────────────────────────────────────────────────
router.get('/suggestions', async (req, res) => {
  const database = db()
  const { data, error } = await database.from('leadgen_suggestions')
    .select('*').eq('studio_id', req.studio.id).order('submitted_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  const names = await staffNameMap(database, (data || []).map(s => s.staff_id))
  res.json((data || []).map(s => ({ ...s, staff_name: names[s.staff_id] || 'Team Member' })))
})

router.post('/suggestions', async (req, res) => {
  const { text, category } = req.body
  if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' })
  const { data, error } = await db().from('leadgen_suggestions')
    .insert({ studio_id: req.studio.id, staff_id: req.user.id, text: text.trim(), category: category || 'in_studio' })
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.put('/suggestions/:id', requireRole('owner', 'manager'), async (req, res) => {
  const { data, error } = await db().from('leadgen_suggestions')
    .update({ status: req.body.status }).eq('id', req.params.id).eq('studio_id', req.studio.id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Promote a suggestion into the bank as a new (inactive) play
router.post('/suggestions/:id/promote', requireRole('owner', 'manager'), async (req, res) => {
  const database = db()
  const { data: s, error: sErr } = await database.from('leadgen_suggestions')
    .select('*').eq('id', req.params.id).eq('studio_id', req.studio.id).maybeSingle()
  if (sErr) return res.status(500).json({ error: sErr.message })
  if (!s) return res.status(404).json({ error: 'Suggestion not found' })
  const { data: play, error: pErr } = await database.from('leadgen_plays').insert({
    studio_id: req.studio.id, title: (req.body.title || s.text).slice(0, 120),
    description: req.body.description || s.text, category: s.category,
    point_value: 20, cadence: 'weekly', active: false, created_by: req.user.id,
  }).select().single()
  if (pErr) return res.status(500).json({ error: pErr.message })
  await database.from('leadgen_suggestions').update({ status: 'promoted' }).eq('id', s.id)
  res.status(201).json(play)
})

router.delete('/suggestions/:id', async (req, res) => {
  const database = db()
  const isManager = req.role === 'owner' || req.role === 'manager'
  let q = database.from('leadgen_suggestions').delete().eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (!isManager) q = q.eq('staff_id', req.user.id)
  const { error } = await q
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

module.exports = router
