const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const { requireRole } = require('../middleware/roleGuard')
const authenticate = require('../middleware/authMiddleware')

const supabase = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function buildUserMap(db) {
  const { data: { users } } = await db.auth.admin.listUsers({ perPage: 200 })
  const map = {}
  for (const u of users || []) {
    map[u.id] = u.user_metadata?.full_name || u.email?.split('@')[0] || 'Team Member'
  }
  return map
}

// ─── GET /api/orders ─────────────────────────────────────────────────────────
// owner/manager: all orders. TSA: pending + own orders.
router.get('/', authenticate, async (req, res) => {
  const db = supabase()
  const role = req.user.app_metadata?.role
  const { status, category } = req.query

  let query = db
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (category) query = query.eq('category', category)

  // TSA can only see pending orders + their own
  if (role === 'tsa') {
    query = query.or(`status.eq.pending,requested_by.eq.${req.user.id}`)
  }

  const [ordersRes, userMap] = await Promise.all([query, buildUserMap(db)])
  if (ordersRes.error) return res.status(500).json({ error: ordersRes.error.message })

  const enriched = (ordersRes.data || []).map(o => ({
    ...o,
    requested_by_name: userMap[o.requested_by] || 'Team Member',
    approved_by_name: o.approved_by ? (userMap[o.approved_by] || 'Team Member') : null,
  }))

  res.json(enriched)
})

// ─── POST /api/orders ────────────────────────────────────────────────────────
// Anyone authenticated can request an order
router.post('/', authenticate, async (req, res) => {
  const { item_name, quantity, category, notes, vendor, est_cost } = req.body

  if (!item_name) return res.status(400).json({ error: 'item_name is required' })

  const { data, error } = await supabase()
    .from('orders')
    .insert({
      item_name,
      quantity: quantity || 1,
      category: category || 'supplies',
      notes: notes || null,
      vendor: vendor || null,
      est_cost: est_cost || null,
      status: 'pending',
      requested_by: req.user.id,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── PUT /api/orders/:id ─────────────────────────────────────────────────────
// Update order details (owner/manager only for status changes)
router.put('/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { item_name, quantity, category, notes, vendor, est_cost, status } = req.body
  const db = supabase()

  // Fetch current order to handle timestamp logic
  const { data: current, error: fetchErr } = await db
    .from('orders')
    .select('status')
    .eq('id', req.params.id)
    .single()

  if (fetchErr) return res.status(404).json({ error: 'Order not found' })

  const updates = {
    item_name, quantity, category, notes, vendor, est_cost,
    updated_at: new Date().toISOString(),
  }

  if (status) {
    updates.status = status
    if (status === 'approved') {
      updates.approved_by = req.user.id
    }
    if (status === 'ordered' && current.status !== 'ordered') {
      updates.ordered_at = new Date().toISOString()
    }
    if (status === 'received' && current.status !== 'received') {
      updates.received_at = new Date().toISOString()
    }
  }

  const { data, error } = await db
    .from('orders')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Enrich with user names so the frontend stays in sync without a reload
  const userMap = await buildUserMap(db)
  res.json({
    ...data,
    requested_by_name: userMap[data.requested_by] || 'Team Member',
    approved_by_name: data.approved_by ? (userMap[data.approved_by] || 'Team Member') : null,
  })
})

// ─── DELETE /api/orders/:id ──────────────────────────────────────────────────
router.delete('/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await supabase()
    .from('orders')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

module.exports = router
