const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Apply studio middleware to all routes
router.use(authenticate, requireStudio)

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
router.get('/', async (req, res) => {
  const { weekStart, end } = req.query
  if (!weekStart) return res.status(400).json({ error: 'weekStart required' })
  const weekEnd = resolveRange(weekStart, end)

  const { data, error } = await db()
    .from('shifts')
    .select('*')
    .eq('studio_id', req.studio.id)
    .gte('shift_date', weekStart)
    .lte('shift_date', weekEnd)
    .order('shift_date')
    .order('start_time')

  if (error) return res.status(500).json({ error: error.message })
  const shifts = await withUserNames(data)
  res.json(shifts)
})

// GET /api/schedule/timeoff-week?weekStart=YYYY-MM-DD[&end=YYYY-MM-DD]
router.get('/timeoff-week', async (req, res) => {
  const { weekStart, end } = req.query
  if (!weekStart) return res.status(400).json({ error: 'weekStart required' })
  const weekEnd = resolveRange(weekStart, end)

  const { data, error } = await db()
    .from('time_off_requests')
    .select('*')
    .eq('studio_id', req.studio.id)
    .eq('status', 'approved')
    .lte('start_date', weekEnd)
    .gte('end_date', weekStart)

  if (error) return res.status(500).json({ error: error.message })
  const requests = await withRequesterNames(data)
  res.json(requests)
})

// GET /api/schedule/blocked?weekStart=YYYY-MM-DD[&end=YYYY-MM-DD]
router.get('/blocked', async (req, res) => {
  const { weekStart, end } = req.query
  if (!weekStart) return res.status(400).json({ error: 'weekStart required' })
  const weekEnd = resolveRange(weekStart, end)

  const { data, error } = await db()
    .from('blocked_days')
    .select('*')
    .eq('studio_id', req.studio.id)
    .gte('block_date', weekStart)
    .lte('block_date', weekEnd)
    .order('block_date')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/schedule/blocked
router.post('/blocked', requireRole('owner', 'manager'), async (req, res) => {
  const { block_date, label, block_type } = req.body
  if (!block_date) return res.status(400).json({ error: 'block_date is required' })

  const { data, error } = await db()
    .from('blocked_days')
    .upsert(
      {
        block_date,
        label: label || 'Holiday',
        block_type: block_type || 'holiday',
        created_by: req.user.id,
        studio_id: req.studio.id
      },
      { onConflict: 'block_date' }
    )
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// DELETE /api/schedule/blocked/:id
router.delete('/blocked/:id', requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await db().from('blocked_days').delete().eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// POST /api/schedule
router.post('/', requireRole('owner', 'manager'), async (req, res) => {
  const { tsa_id, shift_date, start_time, end_time, notes } = req.body
  if (!tsa_id || !shift_date || !start_time || !end_time)
    return res.status(400).json({ error: 'tsa_id, shift_date, start_time, end_time are required' })

  const { data, error } = await db()
    .from('shifts')
    .insert({
      tsa_id,
      shift_date,
      start_time,
      end_time,
      notes: notes || null,
      created_by: req.user.id,
      studio_id: req.studio.id
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  const [withName] = await withUserNames([data])
  res.status(201).json(withName)
})

// PUT /api/schedule/:id
router.put('/:id', requireRole('owner', 'manager'), async (req, res) => {
  const { tsa_id, shift_date, start_time, end_time, notes } = req.body

  const { data, error } = await db()
    .from('shifts')
    .update({ tsa_id, shift_date, start_time, end_time, notes: notes || null })
    .eq('id', req.params.id)
    .eq('studio_id', req.studio.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  const [withName] = await withUserNames([data])
  res.json(withName)
})

// DELETE /api/schedule/:id
router.delete('/:id', requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await db().from('shifts').delete().eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── Scheduling suggestions (Phase 2) ─────────────────────────────────────────
// Ranks team members for an open shift using availability + approved time off +
// existing shifts that week. Rule-based and explainable (returns reasons).

const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const hhmm = (t) => (t ? t.slice(0, 5) : null)
const toMin = (t) => { const [h, m] = hhmm(t).split(':').map(Number); return h * 60 + m }
function fmt12(t) {
  const [h, m] = hhmm(t).split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
function sundayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().slice(0, 10)
}
function addDaysStr(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// GET /api/schedule/suggestions?date=YYYY-MM-DD&start=HH:MM&end=HH:MM
router.get('/suggestions', requireRole('owner', 'manager'), async (req, res) => {
  const { date, start, end } = req.query
  if (!date || !start || !end) {
    return res.status(400).json({ error: 'date, start, and end are required' })
  }

  const dow = new Date(date + 'T00:00:00').getDay()
  const dayName = DAY_NAMES_FULL[dow]
  const sStart = hhmm(start)
  const sEnd = hhmm(end)
  const shiftHours = Math.max(0, (toMin(sEnd) - toMin(sStart)) / 60)
  const weekStart = sundayOf(date)
  const weekEnd = addDaysStr(weekStart, 6)

  try {
    // 1. Studio members — only schedulable roles (managers + TSAs, not owners), active only
    const [{ data: memberRows, error: memErr }, { data: inactive }] = await Promise.all([
      db().from('user_studios').select('user_id, role').eq('studio_id', req.studio.id).in('role', ['manager', 'tsa']),
      db().from('user_profiles').select('id').eq('is_active', false),
    ])
    if (memErr) return res.status(500).json({ error: memErr.message })
    const inactiveIds = new Set((inactive || []).map(r => r.id))
    const memberIds = [...new Set((memberRows || []).map(m => m.user_id))].filter(id => !inactiveIds.has(id))
    if (!memberIds.length) return res.json({ shift_hours: shiftHours, day: dayName, candidates: [] })

    // 2. Availability for this day-of-week
    const { data: availRows } = await db()
      .from('availability')
      .select('*')
      .eq('studio_id', req.studio.id)
      .eq('day_of_week', dow)
    const availByUser = {}
    for (const a of availRows || []) availByUser[a.user_id] = a

    // 3. Approved time off covering this date
    const { data: offRows } = await db()
      .from('time_off_requests')
      .select('requested_by, start_date, end_date, status')
      .eq('studio_id', req.studio.id)
      .eq('status', 'approved')
      .lte('start_date', date)
      .gte('end_date', date)
    const offUsers = new Set((offRows || []).map(r => r.requested_by))

    // 4. Existing shifts that week (for fairness + same-day conflict)
    const { data: weekShifts } = await db()
      .from('shifts')
      .select('tsa_id, shift_date, start_time, end_time')
      .eq('studio_id', req.studio.id)
      .gte('shift_date', weekStart)
      .lte('shift_date', weekEnd)
    const hoursByUser = {}
    const sameDayByUser = {}
    for (const s of weekShifts || []) {
      const h = Math.max(0, (toMin(s.end_time) - toMin(s.start_time)) / 60)
      hoursByUser[s.tsa_id] = (hoursByUser[s.tsa_id] || 0) + h
      if (s.shift_date === date) (sameDayByUser[s.tsa_id] = sameDayByUser[s.tsa_id] || []).push(s)
    }

    // 5. Names
    const nameMap = await fetchNameMap(memberIds)

    // 6. Score each member
    const candidates = memberIds.map(uid => {
      const reasons = []
      let status = 'available' // available | partial | unavailable
      let score = 100
      const avail = availByUser[uid]
      const hoursThisWeek = Math.round((hoursByUser[uid] || 0) * 10) / 10
      const conflict = !!(sameDayByUser[uid] && sameDayByUser[uid].length)

      // Time off is a hard block
      if (offUsers.has(uid)) {
        status = 'unavailable'
        reasons.push('Approved time off this day')
      } else if (avail && avail.available === false) {
        status = 'unavailable'
        reasons.push(`Marked unavailable on ${dayName}s`)
      } else if (avail && avail.all_day === false) {
        const aStart = hhmm(avail.start_time)
        const aEnd = hhmm(avail.end_time)
        if (aStart && aEnd && toMin(aStart) <= toMin(sStart) && toMin(aEnd) >= toMin(sEnd)) {
          reasons.push(`Available ${fmt12(aStart)}–${fmt12(aEnd)}`)
        } else if (aStart && aEnd) {
          status = 'partial'
          score -= 45
          reasons.push(`Only available ${fmt12(aStart)}–${fmt12(aEnd)}`)
        } else {
          reasons.push('Availability hours not fully set')
        }
      } else {
        reasons.push(`Available all day ${dayName}`)
      }

      if (conflict) {
        score -= 60
        reasons.push('Already has a shift this day')
      }

      // Fairness — fewer hours already scheduled ranks higher
      score -= hoursThisWeek * 3
      reasons.push(`${hoursThisWeek}h scheduled this week`)

      return {
        user_id: uid,
        name: nameMap[uid]?.name || 'Team Member',
        role: (memberRows.find(m => m.user_id === uid) || {}).role || 'tsa',
        status,
        score: Math.round(score),
        conflict,
        hours_this_week: hoursThisWeek,
        reasons,
      }
    })

    // Rank: available first (by score), then partial, then unavailable
    const rank = { available: 0, partial: 1, unavailable: 2 }
    candidates.sort((a, b) =>
      rank[a.status] - rank[b.status] || b.score - a.score || a.name.localeCompare(b.name)
    )

    res.json({ shift_hours: shiftHours, day: dayName, candidates })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
