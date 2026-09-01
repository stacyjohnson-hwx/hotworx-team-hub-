const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Build the notes summary that gets mirrored into the operational Orders tab.
function buildOrderNotes(po, items) {
  const lines = items.map(it => {
    let label = it.product_name || 'Item'
    if (it.size_quantities && Object.keys(it.size_quantities).length) {
      const sizes = Object.entries(it.size_quantities).map(([s, q]) => `${s}:${q}`).join(' ')
      label += ` (${sizes})`
    }
    return `• ${label} — qty ${it.quantity} @ $${num(it.unit_cost).toFixed(2)}`
  })
  const parts = [`Retail order from ${po.vendor_name}.`, ...lines]
  parts.push(`Subtotal $${num(po.subtotal).toFixed(2)} · Tax $${num(po.tax).toFixed(2)} · Shipping $${num(po.shipping).toFixed(2)} · Total $${num(po.total).toFixed(2)}`)
  if (po.notes) parts.push(`Note: ${po.notes}`)
  return parts.join('\n')
}

// ─── GET /api/retail/purchase-orders ─────────────────────────────────────────
// List purchase orders for the studio (newest first), each with its line items.
router.get('/', authenticate, requireStudio, async (req, res) => {
  const { data, error } = await db()
    .from('retail_purchase_orders')
    .select('*, items:retail_purchase_order_items(*)')
    .eq('studio_id', req.studio.id)
    .order('ordered_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── GET /api/retail/purchase-orders/:id ─────────────────────────────────────
router.get('/:id', authenticate, requireStudio, async (req, res) => {
  const { data, error } = await db()
    .from('retail_purchase_orders')
    .select('*, items:retail_purchase_order_items(*)')
    .eq('studio_id', req.studio.id)
    .eq('id', req.params.id)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Not found' })
  res.json(data)
})

// ─── POST /api/retail/purchase-orders ────────────────────────────────────────
// Create a purchase order. Body:
//   { vendor_id?, vendor_name, items:[{ sku_id, product_name, quantity,
//       size_quantities?, unit_cost }], tax?, shipping?, total?, notes? }
// Cross-posts a summary row into `orders` (category=retail, status=ordered).
// Does NOT change inventory — that happens on receive.
router.post('/', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { vendor_id, vendor_name, items, tax, shipping, total, notes } = req.body

  if (!vendor_name) return res.status(400).json({ error: 'vendor_name is required' })
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one line item is required' })
  }

  // Normalise line items and compute totals server-side.
  const cleanItems = items.map(it => {
    const quantity = Math.round(num(it.quantity))
    const unit_cost = num(it.unit_cost)
    const size_quantities =
      it.size_quantities && Object.keys(it.size_quantities).length ? it.size_quantities : null
    return {
      sku_id: it.sku_id,
      product_name: it.product_name || null,
      quantity,
      size_quantities,
      unit_cost,
      line_total: Math.round(quantity * unit_cost * 100) / 100,
    }
  }).filter(it => it.sku_id && it.quantity > 0)

  if (cleanItems.length === 0) {
    return res.status(400).json({ error: 'Line items need a product and a quantity' })
  }

  const subtotal = Math.round(cleanItems.reduce((s, it) => s + it.line_total, 0) * 100) / 100
  const taxN = num(tax)
  const shipN = num(shipping)
  // Total defaults to subtotal + tax + shipping, but the user may override it.
  const totalN = total !== undefined && total !== null && total !== ''
    ? num(total)
    : Math.round((subtotal + taxN + shipN) * 100) / 100

  const client = db()

  // 1) Cross-post the summary into the operational orders board.
  const totalUnits = cleanItems.reduce((s, it) => s + it.quantity, 0)
  const orderNotes = buildOrderNotes({ vendor_name, subtotal, tax: taxN, shipping: shipN, total: totalN, notes }, cleanItems)

  const { data: linkedOrder, error: orderErr } = await client
    .from('orders')
    .insert({
      item_name: `${vendor_name} Order`,
      quantity: totalUnits,
      category: 'retail',
      notes: orderNotes,
      vendor: vendor_name,
      est_cost: totalN,
      status: 'ordered',
      ordered_at: new Date().toISOString(),
      requested_by: req.user.id,
      studio_id: req.studio.id,
    })
    .select()
    .single()

  if (orderErr) return res.status(500).json({ error: `Order board: ${orderErr.message}` })

  // 2) Create the purchase order.
  const { data: po, error: poErr } = await client
    .from('retail_purchase_orders')
    .insert({
      studio_id: req.studio.id,
      vendor_id: vendor_id || null,
      vendor_name,
      status: 'ordered',
      subtotal,
      tax: taxN,
      shipping: shipN,
      total: totalN,
      notes: notes || null,
      linked_order_id: linkedOrder.id,
      created_by: req.user.id,
    })
    .select()
    .single()

  if (poErr) {
    // Roll back the order board entry so we don't orphan it.
    await client.from('orders').delete().eq('id', linkedOrder.id)
    return res.status(500).json({ error: poErr.message })
  }

  // 3) Insert the line items.
  const rows = cleanItems.map(it => ({ ...it, purchase_order_id: po.id }))
  const { error: itemsErr } = await client.from('retail_purchase_order_items').insert(rows)
  if (itemsErr) {
    await client.from('retail_purchase_orders').delete().eq('id', po.id)
    await client.from('orders').delete().eq('id', linkedOrder.id)
    return res.status(500).json({ error: itemsErr.message })
  }

  const { data: full } = await client
    .from('retail_purchase_orders')
    .select('*, items:retail_purchase_order_items(*)')
    .eq('id', po.id)
    .single()

  res.status(201).json(full)
})

// ─── POST /api/retail/purchase-orders/:id/receive ────────────────────────────
// Mark a PO received: add stock to inventory (per size), flip the linked order
// to "received".
router.post('/:id/receive', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const client = db()

  const { data: po, error: poErr } = await client
    .from('retail_purchase_orders')
    .select('*, items:retail_purchase_order_items(*)')
    .eq('studio_id', req.studio.id)
    .eq('id', req.params.id)
    .maybeSingle()

  if (poErr) return res.status(500).json({ error: poErr.message })
  if (!po) return res.status(404).json({ error: 'Not found' })
  if (po.status === 'received') return res.status(400).json({ error: 'Already received' })
  if (po.status === 'cancelled') return res.status(400).json({ error: 'Order was cancelled' })

  // Add each line item's quantity into inventory_levels (merging per-size counts).
  for (const it of po.items || []) {
    const { data: inv } = await client
      .from('inventory_levels')
      .select('quantity_on_hand, size_quantities')
      .eq('sku_id', it.sku_id)
      .eq('studio_id', req.studio.id)
      .maybeSingle()

    const currentQty = num(inv?.quantity_on_hand)
    const newQty = currentQty + num(it.quantity)

    let sizeQ = null
    const baseSizes = inv?.size_quantities || null
    if (baseSizes || it.size_quantities) {
      sizeQ = { ...(baseSizes || {}) }
      for (const [size, q] of Object.entries(it.size_quantities || {})) {
        sizeQ[size] = num(sizeQ[size]) + num(q)
      }
    }

    const { error: upErr } = await client
      .from('inventory_levels')
      .upsert({
        sku_id: it.sku_id,
        studio_id: req.studio.id,
        quantity_on_hand: newQty,
        size_quantities: sizeQ,
        last_updated_by: req.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'sku_id,studio_id' })

    if (upErr) return res.status(500).json({ error: `Inventory update: ${upErr.message}` })
  }

  // Flip the PO + linked order to received.
  const receivedAt = new Date().toISOString()
  const { data: updated, error: updErr } = await client
    .from('retail_purchase_orders')
    .update({ status: 'received', received_at: receivedAt, updated_at: receivedAt })
    .eq('id', po.id)
    .select('*, items:retail_purchase_order_items(*)')
    .single()

  if (updErr) return res.status(500).json({ error: updErr.message })

  if (po.linked_order_id) {
    await client.from('orders')
      .update({ status: 'received', received_at: receivedAt, updated_at: receivedAt })
      .eq('id', po.linked_order_id)
  }

  res.json(updated)
})

// ─── DELETE /api/retail/purchase-orders/:id ──────────────────────────────────
// Cancel + delete a purchase order. Cancels the linked order board entry too.
// (Received orders keep their inventory effect; deleting one does not remove stock.)
router.delete('/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const client = db()

  const { data: po } = await client
    .from('retail_purchase_orders')
    .select('id, linked_order_id')
    .eq('studio_id', req.studio.id)
    .eq('id', req.params.id)
    .maybeSingle()

  if (!po) return res.status(404).json({ error: 'Not found' })

  if (po.linked_order_id) {
    await client.from('orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', po.linked_order_id)
  }

  const { error } = await client.from('retail_purchase_orders').delete().eq('id', po.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// ─── GET /api/retail/purchase-orders/spend/by-month ──────────────────────────
// Retail spend rolled up by month and by vendor (from PO totals). Powers the
// "how much am I spending on retail" view. ?months=12
router.get('/spend/summary', authenticate, requireStudio, async (req, res) => {
  const months = Math.min(36, Math.max(1, parseInt(req.query.months, 10) || 12))
  const since = new Date()
  since.setMonth(since.getMonth() - (months - 1))
  since.setDate(1)

  const { data, error } = await db()
    .from('retail_purchase_orders')
    .select('vendor_name, total, ordered_at, status')
    .eq('studio_id', req.studio.id)
    .neq('status', 'cancelled')
    .gte('ordered_at', since.toISOString())

  if (error) return res.status(500).json({ error: error.message })

  const byMonth = {}
  const byVendor = {}
  for (const po of data || []) {
    const ym = String(po.ordered_at).slice(0, 7)
    byMonth[ym] = (byMonth[ym] || 0) + num(po.total)
    byVendor[po.vendor_name] = (byVendor[po.vendor_name] || 0) + num(po.total)
  }

  const round = (n) => Math.round(n * 100) / 100
  res.json({
    by_month: Object.entries(byMonth).map(([month, spend]) => ({ month, spend: round(spend) }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    by_vendor: Object.entries(byVendor).map(([vendor, spend]) => ({ vendor, spend: round(spend) }))
      .sort((a, b) => b.spend - a.spend),
    total: round((data || []).reduce((s, p) => s + num(p.total), 0)),
  })
})

module.exports = router
