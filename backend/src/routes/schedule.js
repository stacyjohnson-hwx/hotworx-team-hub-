const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Fetch display names via RPC function that queries auth.users directly
async function fetchNameMap(userIds) {
  if (!userIds.length) return {}
  const { data, error } = await db().rpc('get_user_display_names', { user_ids: userIds })
  if (error) throw error
  const map = {}
  for (const row of data) {
    map[row.id] = {
      name: row.full_name || row.email?.split('@')[0] || 'Team Member',
      email: row.email,
    }
  }
  return map
}

async function withUserNames(shifts) {
  if (!shifts.length) return []
  const userIds = [...new Set(shifts.map(s => s.tsa_id))]
  const nameMap = await fetchNameMap(userIds)
  return shifts.map(s => ({
    ...s,
    tsa_name: nameMap[s.tsa_id]?.name || 'Team Member',
    tsa_email: nameMap[s.tsa_id]?.email,
  }))
}

async function withRequesterNames(requests) {
  if (!requests.length) return []
  const userIds = [...new Set(requests.map(r => r.requested_by).filter(Boolean))]
  const nameMap = await fetchNameMap(userIds)
  return requests.map(r => ({ ...r, requester_name: nameMap[r.requested_by]?.name || 'Team Member' }))
}

// Compute end date: use explicit ?end= if provided, otherwise weekStart + 6 days
function resolveRange(weekStart, endOverride) {
  if (endOverride) return endOverride
  const start = new Date(weekStart + 'T00:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return end.toISOString().slice(0, 10)
}

// GET /api/schedule?weekStart=YYYY-MM-DD[&end=YYYY-MM-DD]
router.get('/', authenticate, async (req, res) => {
  const { weekStart, end } = req.query
  if (!weekStart) return res.status(400).json({ error: 'weekStart required' })
  const weekEnd = resolveRange(weekStart, end)

  const { data, error } = await db()
    .from('shifts')
    .select('*')
    .gte('shift_date', weekStart)
    .lte('shift_date', weekEnd)
    .order('shift_date')
    .order('start_time')

  if (error) return res.status(500).json({ error: error.message })
  const shifts = await withUserNames(data)
  res.json(shifts)
})

// GET /api/schedule/timeoff-week?weekStart=YYYY-MM-DD[&end=YYYY-MM-DD]
router.get('/timeoff-week', authenticate, async (req, res) => {
  const { weekStart, end } = req.query
  if (!weekStart) return res.status(400).json({ error: 'weekStart required' })
  const weekEnd = resolveRange(weekStart, end)

  const { data, error } = await db()
    .from('time_off_requests')
    .select('*')
    .eq('status', 'approved')
    .lte('start_date', weekEnd)
    .gte('end_date', weekStart)

  if (error) return res.status(500).json({ error: error.message })
  const requests = await withRequesterNames(data)
  res.json(requests)
})

// GET /api/schedule/blocked?weekStart=YYYY-MM-DD[&end=YYYY-MM-DD]
router.get('/blocked', authenticate, async (req, res) => {
  const { weekStart, end } = req.query
  if (!weekStart) return res.status(400).json({ error: 'weekStart required' })
  const weekEnd = resolveRange(weekStart, end)

  const { data, error } = await db()
    .from('blocked_days')
    .select('*')
    .gte('block_date', weekStart)
    .lte('block_date', weekEnd)
    .order('block_date')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/schedule/blocked
router.post('/blocked', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { block_date, label, block_type } = req.body
  if (!block_date) return res.status(400).json({ error: 'block_date is required' })

  const { data, error } = await db()
    .from('blocked_days')
    .upsert(
      { block_date, label: label || 'Holiday', block_type: block_type || 'holiday', created_by: req.user.id },
      { onConflict: 'block_date' }
    )
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// DELETE /api/schedule/blocked/:id
router.delete('/blocked/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await db().from('blocked_days').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// POST /api/schedule
router.post('/', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { tsa_id, shift_date, start_time, end_time, notes } = req.body
  if (!tsa_id || !shift_date || !start_time || !end_time)
    return res.status(400).json({ error: 'tsa_id, shift_date, start_time, end_time are required' })

  const { data, error } = await db()
    .from('shifts')
    .insert({ tsa_id, shift_date, start_time, end_time, notes: notes || null, created_by: req.user.id })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  const [withName] = await withUserNames([data])
  res.status(201).json(withName)
})

// PUT /api/schedule/:id
router.put('/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { tsa_id, shift_date, start_time, end_time, notes } = req.body

  const { data, error } = await db()
    .from('shifts')
    .update({ tsa_id, shift_date, start_time, end_time, notes: notes || null })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  const [withName] = await withUserNames([data])
  res.json(withName)
})

// DELETE /api/schedule/:id
router.delete('/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await db().from('shifts').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

module.exports = router
