const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Apply studio middleware to all routes
router.use(authenticate, requireStudio)

async function withRequesterNames(requests) {
  if (!requests.length) return []
  const userIds = [...new Set(requests.map(r => r.requested_by).filter(Boolean))]
  const nameMap = {}
  for (const uid of userIds) {
    const { data } = await db().auth.admin.getUserById(uid)
    const u = data?.user
    nameMap[uid] = u?.user_metadata?.full_name || u?.email?.split('@')[0] || 'Team Member'
  }
  return requests.map(r => ({ ...r, requester_name: nameMap[r.requested_by] || 'Team Member' }))
}

// GET /api/timeoff — own requests (TSA) or all (owner/manager)
router.get('/', async (req, res) => {
  let query = db()
    .from('time_off_requests')
    .select('*')
    .eq('studio_id', req.studio.id)
    .order('created_at', { ascending: false })

  if (req.role === 'tsa') {
    query = query.eq('requested_by', req.user.id)
  }

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  const withNames = await withRequesterNames(data)
  res.json(withNames)
})

// POST /api/timeoff — TSA submits a request
router.post('/', async (req, res) => {
  const { start_date, end_date, reason } = req.body
  if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date are required' })

  const { data, error } = await db()
    .from('time_off_requests')
    .insert({
      requested_by: req.user.id,
      start_date,
      end_date,
      reason: reason || null,
      studio_id: req.studio.id
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  const [withName] = await withRequesterNames([data])
  res.status(201).json(withName)
})

// PATCH /api/timeoff/:id — approve or deny (owner/manager only)
router.patch('/:id', requireRole('owner', 'manager'), async (req, res) => {
  const { status, review_note } = req.body
  if (!['approved', 'denied'].includes(status))
    return res.status(400).json({ error: 'status must be approved or denied' })

  const { data, error } = await db()
    .from('time_off_requests')
    .update({
      status,
      review_note: review_note || null,
      reviewed_by: req.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  const [withName] = await withRequesterNames([data])
  res.json(withName)
})

// DELETE /api/timeoff/:id — submitter (own pending), manager, or owner can delete
router.delete('/:id', async (req, res) => {
  const role = req.user.app_metadata?.role || req.role

  let query = db()
    .from('time_off_requests')
    .delete()
    .eq('id', req.params.id)

  // TSA: can only delete their own pending requests
  if (role === 'tsa') {
    query = query.eq('requested_by', req.user.id).eq('status', 'pending')
  }
  // owner/manager: can delete any request (no additional filters)

  const { error } = await query

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

module.exports = router
