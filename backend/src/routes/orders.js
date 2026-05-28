const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const { requireRole } = require('../middleware/roleGuard')
const authenticate = require('../middleware/authMiddleware')
const { Resend } = require('resend')

async function sendOrderEmail(order, requesterName) {
  if (!process.env.RESEND_API_KEY) return
  const resend = new Resend(process.env.RESEND_API_KEY)
  const catLabel = { supplies: 'Supplies', retail: 'Retail', equipment: 'Equipment', marketing: 'Marketing', other: 'Other' }[order.category] || order.category
  const costLine = order.est_cost ? `<tr><td style="color:#6b7280;font-size:13px;padding:4px 0">Est. Cost</td><td style="font-size:13px;text-align:right">$${Number(order.est_cost).toFixed(2)}</td></tr>` : ''
  const vendorLine = order.vendor ? `<tr><td style="color:#6b7280;font-size:13px;padding:4px 0">Vendor</td><td style="font-size:13px;text-align:right">${order.vendor}</td></tr>` : ''
  const notesLine = order.notes ? `<p style="margin:12px 0 0;font-size:13px;color:#374151"><strong>Notes:</strong> ${order.notes}</p>` : ''
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <div style="background:#C8102E;padding:16px 20px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0;font-size:16px">New Order Request — HOTWORX Pewaukee</h2>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px">
        <p style="margin:0 0 12px;font-size:14px;color:#111827">
          <strong>${requesterName}</strong> submitted a new order request.
        </p>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="color:#6b7280;font-size:13px;padding:4px 0">Item</td><td style="font-size:13px;text-align:right;font-weight:600">${order.item_name}</td></tr>
          <tr><td style="color:#6b7280;font-size:13px;padding:4px 0">Quantity</td><td style="font-size:13px;text-align:right">${order.quantity}</td></tr>
          <tr><td style="color:#6b7280;font-size:13px;padding:4px 0">Category</td><td style="font-size:13px;text-align:right">${catLabel}</td></tr>
          ${vendorLine}
          ${costLine}
        </table>
        ${notesLine}
      </div>
    </div>`
  await resend.emails.send({
    from: 'HOTWORX Pewaukee <noreply@hotworx.net>',
    to: [process.env.OWNER_EMAIL, process.env.MANAGER_EMAIL].filter(Boolean),
    subject: `Order Request: ${order.item_name} — HOTWORX Pewaukee`,
    html,
  }).catch(err => console.error('Order email failed:', err.message))
}

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
// all roles can see all orders
router.get('/', authenticate, async (req, res) => {
  const db = supabase()
  const { status, category, vendor } = req.query

  let query = db
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (category) query = query.eq('category', category)
  if (vendor) query = query.eq('vendor', vendor)

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

  // Send notification email to owner and manager (fire-and-forget)
  const db2 = supabase()
  buildUserMap(db2).then(userMap => {
    const requesterName = userMap[data.requested_by] || 'Team Member'
    sendOrderEmail(data, requesterName)
  }).catch(() => {})

  res.status(201).json(data)
})

// ─── PUT /api/orders/:id ─────────────────────────────────────────────────────
// Owner/manager: full update. TSA: may only mark ordered → received.
router.put('/:id', authenticate, async (req, res) => {
  const { item_name, quantity, category, notes, vendor, est_cost, status } = req.body
  const role = req.user?.app_metadata?.role || req.user?.role
  const isOwnerOrManager = role === 'owner' || role === 'manager'
  const db = supabase()

  // Fetch current order to validate transition and set timestamps
  const { data: current, error: fetchErr } = await db
    .from('orders')
    .select('status')
    .eq('id', req.params.id)
    .single()

  if (fetchErr) return res.status(404).json({ error: 'Order not found' })

  // TSA: only allowed to mark an ordered item as received
  if (!isOwnerOrManager) {
    if (status !== 'received' || current.status !== 'ordered') {
      return res.status(403).json({ error: 'TSA can only mark ordered items as received' })
    }
    const { data, error } = await db
      .from('orders')
      .update({ status: 'received', received_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    const userMap = await buildUserMap(db)
    return res.json({
      ...data,
      requested_by_name: userMap[data.requested_by] || 'Team Member',
      approved_by_name: data.approved_by ? (userMap[data.approved_by] || 'Team Member') : null,
    })
  }

  // Owner/manager: full update
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
