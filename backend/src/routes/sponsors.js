// Sample, Sponsor & Vendor Desk (PRD). Studio-scoped CRM for sourcing free product
// from brands. Phase 1 = brands core (grid + detail: details/samples/orders/outreach).
const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireStudio } = require('../middleware/studioMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { todayInChicago } = require('../utils/dates')
const { computeSponsorMetrics, reorderCadenceDays } = require('../services/sponsorMetrics')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
router.use(authenticate, requireStudio)

async function userNames(sb) {
  const { data: { users } } = await sb.auth.admin.listUsers({ perPage: 200 })
  const map = {}
  for (const u of users || []) map[u.id] = u.user_metadata?.full_name || u.email?.split('@')[0] || 'Team Member'
  return map
}

// Auto-advance stage on activity, never downgrading a partner (PRD §8).
const ADVANCEABLE = new Set(['prospect', 'contacted', 'talking', 'committed'])

// ─── GET /api/sponsors/brands — grid rows (rollup) + stat-strip metrics ───────
router.get('/brands', async (req, res) => {
  try {
    const sb = db(); const sid = req.studio.id
    const [{ data: brands, error }, names] = await Promise.all([
      sb.from('v_sponsor_brand_rollup').select('*').eq('studio_id', sid).order('name'),
      userNames(sb),
    ])
    if (error) return res.status(500).json({ error: error.message })
    // Give-backs still owed across this studio's events (for the stat strip).
    const { data: evs } = await sb.from('sponsor_events').select('id').eq('studio_id', sid)
    const evIds = (evs || []).map(e => e.id)
    let givebacksOwed = 0
    if (evIds.length) {
      const { count } = await sb.from('sponsor_givebacks').select('id', { count: 'exact', head: true }).is('completed_at', null).in('event_id', evIds)
      givebacksOwed = count || 0
    }
    const today = todayInChicago()
    const rows = (brands || []).map(b => ({ ...b, owner_name: b.owner_user_id ? (names[b.owner_user_id] || null) : null }))
    res.json({ brands: rows, metrics: computeSponsorMetrics(rows, today, givebacksOwed) })
  } catch (err) { console.error('GET /sponsors/brands', err.message); res.status(500).json({ error: err.message }) }
})

// ─── GET /api/sponsors/brands/:id — detail: rollup + child timelines ──────────
router.get('/brands/:id', async (req, res) => {
  try {
    const sb = db(); const sid = req.studio.id
    const { data: brand } = await sb.from('v_sponsor_brand_rollup').select('*').eq('id', req.params.id).eq('studio_id', sid).maybeSingle()
    if (!brand) return res.status(404).json({ error: 'Brand not found' })
    const [{ data: touches }, { data: samples }, { data: orders }, { data: eventLinks }, names] = await Promise.all([
      sb.from('sponsor_touches').select('*').eq('brand_id', brand.id).order('occurred_on', { ascending: false }),
      sb.from('sponsor_samples').select('*').eq('brand_id', brand.id).order('received_on', { ascending: false }),
      sb.from('sponsor_orders').select('*').eq('brand_id', brand.id).order('ordered_on', { ascending: false }),
      sb.from('sponsor_event_brands').select('*, sponsor_events(name, event_date)').eq('brand_id', brand.id),
      userNames(sb),
    ])
    res.json({
      brand: { ...brand, owner_name: brand.owner_user_id ? (names[brand.owner_user_id] || null) : null },
      touches: (touches || []).map(t => ({ ...t, by_name: t.by_user_id ? (names[t.by_user_id] || null) : null })),
      samples: samples || [],
      orders: orders || [],
      reorder_cadence_days: reorderCadenceDays((orders || []).map(o => o.ordered_on)),
      events: (eventLinks || []).map(e => ({ id: e.id, event_id: e.event_id, role: e.role, status: e.status, slot: e.slot, item: e.item, name: e.sponsor_events?.name, event_date: e.sponsor_events?.event_date })),
    })
  } catch (err) { console.error('GET /sponsors/brands/:id', err.message); res.status(500).json({ error: err.message }) }
})

const BRAND_FIELDS = ['name', 'domain', 'category', 'stage', 'ask_level', 'contact_type', 'owner_user_id', 'contact_name', 'contact_title', 'email', 'phone', 'social_handle', 'next_action_at', 'notes']

router.post('/brands', async (req, res) => {
  const sb = db(); const sid = req.studio.id
  if (!req.body.name) return res.status(400).json({ error: 'name required' })
  const row = { studio_id: sid }
  for (const k of BRAND_FIELDS) if (req.body[k] !== undefined) row[k] = req.body[k] === '' ? null : req.body[k]
  const { data, error } = await sb.from('sponsor_brands').insert(row).select().single()
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'A brand with that name already exists.' : error.message })
  res.status(201).json(data)
})

router.put('/brands/:id', async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const patch = { updated_at: new Date().toISOString() }
  for (const k of BRAND_FIELDS) if (req.body[k] !== undefined) patch[k] = req.body[k] === '' ? null : req.body[k]
  const { data, error } = await sb.from('sponsor_brands').update(patch).eq('id', req.params.id).eq('studio_id', sid).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.delete('/brands/:id', requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await db().from('sponsor_brands').delete().eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// helper: load a studio-owned brand or null
async function ownedBrand(sb, sid, id) {
  const { data } = await sb.from('sponsor_brands').select('id, stage').eq('id', id).eq('studio_id', sid).maybeSingle()
  return data
}
async function maybeAdvance(sb, brand, toStage) {
  if (brand && ADVANCEABLE.has(brand.stage)) await sb.from('sponsor_brands').update({ stage: toStage, updated_at: new Date().toISOString() }).eq('id', brand.id)
}

// ─── Touches (outreach) — logging one advances prospect → contacted ──────────
router.post('/brands/:id/touches', async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const brand = await ownedBrand(sb, sid, req.params.id)
  if (!brand) return res.status(404).json({ error: 'Brand not found' })
  const { channel, occurred_on, note } = req.body
  if (!channel) return res.status(400).json({ error: 'channel required' })
  const { data, error } = await sb.from('sponsor_touches').insert({
    brand_id: brand.id, channel, occurred_on: occurred_on || todayInChicago(), note: note || null, by_user_id: req.user.id,
  }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  if (brand.stage === 'prospect') await sb.from('sponsor_brands').update({ stage: 'contacted', updated_at: new Date().toISOString() }).eq('id', brand.id)
  res.status(201).json(data)
})

// ─── Samples (donated product) — logging one advances to 'received' ──────────
router.post('/brands/:id/samples', async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const brand = await ownedBrand(sb, sid, req.params.id)
  if (!brand) return res.status(404).json({ error: 'Brand not found' })
  if (!req.body.item) return res.status(400).json({ error: 'item required' })
  const { data, error } = await sb.from('sponsor_samples').insert({
    brand_id: brand.id, received_on: req.body.received_on || todayInChicago(), item: req.body.item,
    quantity: parseInt(req.body.quantity) || 0, retail_value: Number(req.body.retail_value) || 0,
    used_for: req.body.used_for || null, note: req.body.note || null,
  }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  await maybeAdvance(sb, brand, 'received')
  res.status(201).json(data)
})

// ─── Orders (product we bought) ──────────────────────────────────────────────
router.post('/brands/:id/orders', async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const brand = await ownedBrand(sb, sid, req.params.id)
  if (!brand) return res.status(404).json({ error: 'Brand not found' })
  if (!req.body.item) return res.status(400).json({ error: 'item required' })
  const { data, error } = await sb.from('sponsor_orders').insert({
    brand_id: brand.id, ordered_on: req.body.ordered_on || todayInChicago(), item: req.body.item,
    quantity: parseInt(req.body.quantity) || 0, cost: Number(req.body.cost) || 0,
    source: req.body.source || null, external_ref: req.body.external_ref || null, note: req.body.note || null,
  }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── Delete child rows (studio-scoped through the parent brand) ───────────────
for (const [seg, table] of [['touches', 'sponsor_touches'], ['samples', 'sponsor_samples'], ['orders', 'sponsor_orders']]) {
  router.delete(`/${seg}/:rowId`, async (req, res) => {
    const sb = db(); const sid = req.studio.id
    const { data: brandIds } = await sb.from('sponsor_brands').select('id').eq('studio_id', sid)
    const ids = (brandIds || []).map(b => b.id)
    const { error } = await sb.from(table).delete().eq('id', req.params.rowId).in('brand_id', ids)
    if (error) return res.status(500).json({ error: error.message })
    res.status(204).end()
  })
}

module.exports = router
