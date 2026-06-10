const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

router.use(authenticate, requireStudio)

async function nameMapFor(database, ids) {
  const map = {}
  const unique = [...new Set(ids.filter(Boolean))]
  for (const id of unique) {
    const { data } = await database.auth.admin.getUserById(id)
    map[id] = data?.user?.user_metadata?.full_name || data?.user?.email?.split('@')[0] || 'Team Member'
  }
  return map
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// ─── GET /api/territories ─────────────────────────────────────────────────────
// All zones with computed last_visit / next_due / status.
router.get('/', async (req, res) => {
  const database = db()
  const [{ data: zones, error }, { data: visits }] = await Promise.all([
    database.from('territories').select('*').eq('studio_id', req.studio.id).eq('active', true).order('name'),
    database.from('territory_visits').select('territory_id, visit_date, visited_by, activity_type').eq('studio_id', req.studio.id),
  ])
  if (error) return res.status(500).json({ error: error.message })

  // Last visit per zone
  const lastByZone = {}
  for (const v of (visits || [])) {
    if (!lastByZone[v.territory_id] || v.visit_date > lastByZone[v.territory_id]) {
      lastByZone[v.territory_id] = v.visit_date
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const nameMap = await nameMapFor(database, (zones || []).map(z => z.assigned_to))

  const result = (zones || []).map(z => {
    const lastVisit = lastByZone[z.id] || null
    const base = lastVisit || z.created_at.slice(0, 10)
    const nextDue = addDays(base, z.cadence_days)
    let status = 'ok'
    if (nextDue < today) status = 'overdue'
    else if (nextDue <= addDays(today, 6)) status = 'due_soon'
    const daysOverdue = status === 'overdue'
      ? Math.round((new Date(today) - new Date(nextDue + 'T00:00:00')) / 86400000)
      : 0
    return {
      ...z,
      assigned_to_name: z.assigned_to ? (nameMap[z.assigned_to] || 'Team Member') : null,
      last_visit: lastVisit,
      next_due: nextDue,
      status,
      days_overdue: daysOverdue,
      never_visited: !lastVisit,
    }
  })

  res.json(result)
})

// ─── POST /api/territories ────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, type, address, latitude, longitude, cadence_days, assigned_to, notes } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })

  const { data, error } = await db()
    .from('territories')
    .insert({
      studio_id: req.studio.id,
      name,
      type: type === 'apartment' ? 'apartment' : 'neighborhood',
      address: address || null,
      latitude: latitude || null,
      longitude: longitude || null,
      cadence_days: parseInt(cadence_days) || 21,
      assigned_to: assigned_to || null,
      notes: notes || null,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── PUT /api/territories/:id ─────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const { name, type, address, latitude, longitude, cadence_days, assigned_to, notes } = req.body
  const updates = { updated_at: new Date().toISOString() }
  if (name !== undefined) updates.name = name
  if (type !== undefined) updates.type = type === 'apartment' ? 'apartment' : 'neighborhood'
  if (address !== undefined) updates.address = address || null
  if (latitude !== undefined) updates.latitude = latitude || null
  if (longitude !== undefined) updates.longitude = longitude || null
  if (cadence_days !== undefined) updates.cadence_days = parseInt(cadence_days) || 21
  if (assigned_to !== undefined) updates.assigned_to = assigned_to || null
  if (notes !== undefined) updates.notes = notes || null

  const { data, error } = await db()
    .from('territories').update(updates)
    .eq('id', req.params.id).eq('studio_id', req.studio.id)
    .select().single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── DELETE /api/territories/:id ──────────────────────────────────────────────
router.delete('/:id', requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await db()
    .from('territories').update({ active: false })
    .eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── POST /api/territories/:id/visits ─────────────────────────────────────────
// Log a "hit" — resets the cadence clock.
router.post('/:id/visits', async (req, res) => {
  const { visit_date, activity_type, notes } = req.body
  const { data, error } = await db()
    .from('territory_visits')
    .insert({
      territory_id: req.params.id,
      studio_id: req.studio.id,
      visited_by: req.user.id,
      visit_date: visit_date || new Date().toISOString().slice(0, 10),
      activity_type: activity_type || null,
      notes: notes || null,
    })
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── GET /api/territories/:id/visits ──────────────────────────────────────────
router.get('/:id/visits', async (req, res) => {
  const database = db()
  const { data, error } = await database
    .from('territory_visits')
    .select('*')
    .eq('territory_id', req.params.id)
    .order('visit_date', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  const nameMap = await nameMapFor(database, (data || []).map(v => v.visited_by))
  res.json((data || []).map(v => ({ ...v, visited_by_name: nameMap[v.visited_by] || 'Team Member' })))
})

module.exports = router
