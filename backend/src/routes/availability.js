const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

router.use(authenticate, requireStudio)

const DAYS = [0, 1, 2, 3, 4, 5, 6] // 0 = Sunday ... 6 = Saturday
const defaultDay = (day_of_week) => ({
  day_of_week, available: true, all_day: true, start_time: null, end_time: null,
})

// Normalize a posted day object into a clean DB row
function toRow(d, userId, studioId) {
  const available = d.available !== false
  const all_day = d.all_day !== false
  const usesHours = available && !all_day
  return {
    user_id: userId,
    studio_id: studioId,
    day_of_week: d.day_of_week,
    available,
    all_day,
    start_time: usesHours ? (d.start_time || null) : null,
    end_time: usesHours ? (d.end_time || null) : null,
    updated_at: new Date().toISOString(),
  }
}

// ─── GET /api/availability/me — the current user's weekly availability ────────
router.get('/me', async (req, res) => {
  const { data, error } = await db()
    .from('availability')
    .select('*')
    .eq('user_id', req.user.id)
    .eq('studio_id', req.studio.id)

  if (error) return res.status(500).json({ error: error.message })

  const map = {}
  for (const row of data) map[row.day_of_week] = row
  // Always return all 7 days, filling unset days with defaults
  res.json(DAYS.map(d => map[d] || defaultDay(d)))
})

// ─── PUT /api/availability/me — upsert the current user's whole week ──────────
router.put('/me', async (req, res) => {
  const { days } = req.body
  if (!Array.isArray(days)) return res.status(400).json({ error: 'days array required' })

  const rows = days
    .filter(d => DAYS.includes(d.day_of_week))
    .map(d => toRow(d, req.user.id, req.studio.id))

  if (!rows.length) return res.status(400).json({ error: 'no valid days provided' })

  const { error } = await db()
    .from('availability')
    .upsert(rows, { onConflict: 'user_id,studio_id,day_of_week' })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

// ─── GET /api/availability — everyone's availability (owner/manager) ──────────
// Returns one entry per team member with their 7-day grid + display name.
router.get('/', requireRole('owner', 'manager'), async (req, res) => {
  const { data, error } = await db()
    .from('availability')
    .select('*')
    .eq('studio_id', req.studio.id)

  if (error) return res.status(500).json({ error: error.message })

  // Group rows by user
  const byUser = {}
  for (const row of data) {
    if (!byUser[row.user_id]) byUser[row.user_id] = {}
    byUser[row.user_id][row.day_of_week] = row
  }

  // Attach display names for everyone who has set availability
  const userIds = Object.keys(byUser)
  const result = []
  for (const uid of userIds) {
    const { data: udata } = await db().auth.admin.getUserById(uid)
    const u = udata?.user
    const name = u?.user_metadata?.full_name || u?.email?.split('@')[0] || 'Team Member'
    result.push({
      user_id: uid,
      name,
      days: DAYS.map(d => byUser[uid][d] || defaultDay(d)),
    })
  }

  result.sort((a, b) => a.name.localeCompare(b.name))
  res.json(result)
})

module.exports = router
