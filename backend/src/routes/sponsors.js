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

// Brands + outreach + success are shared across an owner's studios (the "org").
// A studio with no org_id falls back to its own id, so other owners stay isolated.
async function resolveOrg(sb, studioId) {
  const { data } = await sb.from('studios').select('org_id, id').eq('id', studioId).maybeSingle()
  return data?.org_id || data?.id || studioId
}
async function orgStudioIds(sb, org) {
  const { data } = await sb.from('studios').select('id').or(`org_id.eq.${org},id.eq.${org}`)
  return (data || []).map(s => s.id)
}
async function studioNameMap(sb, ids) {
  if (!ids.length) return {}
  const { data } = await sb.from('studios').select('id, name, code').in('id', ids)
  const m = {}; for (const s of data || []) m[s.id] = s.name || s.code || 'Studio'
  return m
}

// Auto-advance stage on activity, never downgrading a partner (PRD §8).
const ADVANCEABLE = new Set(['prospect', 'contacted', 'talking', 'committed'])

// ─── GET /api/sponsors/brands — grid rows (rollup) + stat-strip metrics ───────
router.get('/brands', async (req, res) => {
  try {
    const sb = db(); const sid = req.studio.id
    const org = await resolveOrg(sb, sid)
    const [{ data: brands, error }, names, studioIds] = await Promise.all([
      sb.from('v_sponsor_brand_rollup').select('*').eq('org_id', org).order('name'),
      userNames(sb),
      orgStudioIds(sb, org),
    ])
    if (error) return res.status(500).json({ error: error.message })
    // Give-backs still owed across the org's studios' events (for the stat strip).
    const { data: evs } = await sb.from('sponsor_events').select('id').in('studio_id', studioIds)
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
    const org = await resolveOrg(sb, sid)
    const { data: brand } = await sb.from('v_sponsor_brand_rollup').select('*').eq('id', req.params.id).eq('org_id', org).maybeSingle()
    if (!brand) return res.status(404).json({ error: 'Brand not found' })
    const [{ data: touches }, { data: samples }, { data: orders }, { data: eventLinks }, names, studioIds] = await Promise.all([
      sb.from('sponsor_touches').select('*').eq('brand_id', brand.id).order('occurred_on', { ascending: false }),
      sb.from('sponsor_samples').select('*').eq('brand_id', brand.id).order('received_on', { ascending: false }),
      sb.from('sponsor_orders').select('*').eq('brand_id', brand.id).order('ordered_on', { ascending: false }),
      sb.from('sponsor_event_brands').select('*, sponsor_events(name, event_date)').eq('brand_id', brand.id),
      userNames(sb),
      orgStudioIds(sb, org),
    ])
    const studioNames = await studioNameMap(sb, studioIds)
    res.json({
      brand: { ...brand, owner_name: brand.owner_user_id ? (names[brand.owner_user_id] || null) : null },
      touches: (touches || []).map(t => ({ ...t, by_name: t.by_user_id ? (names[t.by_user_id] || null) : null })),
      samples: samples || [],
      orders: (orders || []).map(o => ({ ...o, studio_name: o.studio_id ? (studioNames[o.studio_id] || null) : null })),
      reorder_cadence_days: reorderCadenceDays((orders || []).map(o => o.ordered_on)),
      events: (eventLinks || []).map(e => ({ id: e.id, event_id: e.event_id, role: e.role, status: e.status, slot: e.slot, item: e.item, name: e.sponsor_events?.name, event_date: e.sponsor_events?.event_date })),
    })
  } catch (err) { console.error('GET /sponsors/brands/:id', err.message); res.status(500).json({ error: err.message }) }
})

const BRAND_FIELDS = ['name', 'domain', 'category', 'stage', 'ask_level', 'contact_type', 'owner_user_id', 'contact_name', 'contact_title', 'email', 'phone', 'social_handle', 'next_action_at', 'notes']

router.post('/brands', async (req, res) => {
  const sb = db(); const sid = req.studio.id
  if (!req.body.name) return res.status(400).json({ error: 'name required' })
  const org = await resolveOrg(sb, sid)
  const row = { studio_id: sid, org_id: org }
  for (const k of BRAND_FIELDS) if (req.body[k] !== undefined) row[k] = req.body[k] === '' ? null : req.body[k]
  const { data, error } = await sb.from('sponsor_brands').insert(row).select().single()
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'A brand with that name already exists.' : error.message })
  res.status(201).json(data)
})

router.put('/brands/:id', async (req, res) => {
  const sb = db(); const org = await resolveOrg(sb, req.studio.id)
  const patch = { updated_at: new Date().toISOString() }
  for (const k of BRAND_FIELDS) if (req.body[k] !== undefined) patch[k] = req.body[k] === '' ? null : req.body[k]
  const { data, error } = await sb.from('sponsor_brands').update(patch).eq('id', req.params.id).eq('org_id', org).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.delete('/brands/:id', requireRole('owner', 'manager'), async (req, res) => {
  const sb = db(); const org = await resolveOrg(sb, req.studio.id)
  const { error } = await sb.from('sponsor_brands').delete().eq('id', req.params.id).eq('org_id', org)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// helper: load an org-shared brand or null
async function ownedBrand(sb, sid, id) {
  const org = await resolveOrg(sb, sid)
  const { data } = await sb.from('sponsor_brands').select('id, stage').eq('id', id).eq('org_id', org).maybeSingle()
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
    brand_id: brand.id, studio_id: sid, ordered_on: req.body.ordered_on || todayInChicago(), item: req.body.item,
    quantity: parseInt(req.body.quantity) || 0, cost: Number(req.body.cost) || 0,
    source: req.body.source || null, external_ref: req.body.external_ref || null, note: req.body.note || null,
  }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── Delete child rows (scoped through the org's brands) ──────────────────────
for (const [seg, table] of [['touches', 'sponsor_touches'], ['samples', 'sponsor_samples'], ['orders', 'sponsor_orders']]) {
  router.delete(`/${seg}/:rowId`, async (req, res) => {
    const sb = db(); const org = await resolveOrg(sb, req.studio.id)
    const { data: brandIds } = await sb.from('sponsor_brands').select('id').eq('org_id', org)
    const ids = (brandIds || []).map(b => b.id)
    const { error } = await sb.from(table).delete().eq('id', req.params.rowId).in('brand_id', ids)
    if (error) return res.status(500).json({ error: error.message })
    res.status(204).end()
  })
}

// ── Linked calendar events: keep sponsor events in sync with the real `events` row.
async function calendarMap(sb, eventIds) {
  const ids = [...new Set((eventIds || []).filter(Boolean))]
  if (!ids.length) return {}
  const { data } = await sb.from('events').select('id, title, start_date, location, event_type').in('id', ids)
  const m = {}; for (const e of data || []) m[e.id] = e
  return m
}
function applyLinkedEvent(e, cal) {
  const c = e.event_id && cal[e.event_id]
  if (!c) return { ...e, linked: false }
  return { ...e, linked: true, name: c.title || e.name, event_date: c.start_date || e.event_date, location: c.location ?? e.location, linked_title: c.title }
}

// GET /api/sponsors/linkable-events — this studio's calendar events not yet linked.
router.get('/linkable-events', async (req, res) => {
  try {
    const sb = db(); const sid = req.studio.id
    const [{ data: cal }, { data: taken }] = await Promise.all([
      sb.from('events').select('id, title, start_date, event_type, location').eq('studio_id', sid).order('start_date', { ascending: false }).limit(200),
      sb.from('sponsor_events').select('event_id').eq('studio_id', sid).not('event_id', 'is', null),
    ])
    const used = new Set((taken || []).map(t => t.event_id))
    res.json((cal || []).filter(e => !used.has(e.id)))
  } catch (err) { console.error('GET /sponsors/linkable-events', err.message); res.status(500).json({ error: err.message }) }
})

// ══ Phase 2 — Events (studio-specific activations + brand roster) ═════════════
// GET /api/sponsors/events — this studio's events with roster/lock/giveback counts.
router.get('/events', async (req, res) => {
  try {
    const sb = db(); const sid = req.studio.id
    const { data: events } = await sb.from('sponsor_events').select('*').eq('studio_id', sid).order('event_date', { ascending: true })
    const ids = (events || []).map(e => e.id)
    const [{ data: roster }, { data: gbs }] = await Promise.all([
      ids.length ? sb.from('sponsor_event_brands').select('event_id, status').in('event_id', ids) : Promise.resolve({ data: [] }),
      ids.length ? sb.from('sponsor_givebacks').select('event_id, completed_at').in('event_id', ids) : Promise.resolve({ data: [] }),
    ])
    const total = {}, locked = {}, owed = {}
    for (const r of roster || []) { total[r.event_id] = (total[r.event_id] || 0) + 1; if (['confirmed', 'delivered'].includes(r.status)) locked[r.event_id] = (locked[r.event_id] || 0) + 1 }
    for (const g of gbs || []) if (!g.completed_at) owed[g.event_id] = (owed[g.event_id] || 0) + 1
    // Overlay live values from linked calendar events so they stay in sync.
    const cal = await calendarMap(sb, (events || []).map(e => e.event_id).filter(Boolean))
    res.json((events || []).map(e => ({ ...applyLinkedEvent(e, cal), brands_total: total[e.id] || 0, brands_locked: locked[e.id] || 0, givebacks_owed: owed[e.id] || 0 })))
  } catch (err) { console.error('GET /sponsors/events', err.message); res.status(500).json({ error: err.message }) }
})

router.post('/events', async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const row = { studio_id: sid }
  // Link an existing calendar event (name/date come from it) or create standalone.
  if (req.body.event_id) {
    const { data: cal } = await sb.from('events').select('id, title, start_date, location, event_type').eq('id', req.body.event_id).eq('studio_id', sid).maybeSingle()
    if (!cal) return res.status(400).json({ error: 'Calendar event not found for this studio' })
    row.event_id = cal.id; row.name = cal.title; row.event_date = cal.start_date; row.location = cal.location || null; row.event_type = cal.event_type || null
  } else {
    if (!req.body.name || !req.body.event_date) return res.status(400).json({ error: 'name and event_date required' })
    for (const k of ['name', 'event_date', 'location', 'event_type', 'attendance', 'leads_collected', 'notes']) if (req.body[k] !== undefined) row[k] = req.body[k] === '' ? null : req.body[k]
  }
  const { data, error } = await sb.from('sponsor_events').insert(row).select().single()
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'That calendar event is already on the sponsor desk.' : error.message })
  res.status(201).json(data)
})

router.put('/events/:id', async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const patch = {}
  for (const k of ['name', 'event_date', 'location', 'event_type', 'attendance', 'leads_collected', 'notes']) if (req.body[k] !== undefined) patch[k] = req.body[k] === '' ? null : req.body[k]
  // Link / unlink a calendar event.
  if (req.body.event_id !== undefined) {
    if (!req.body.event_id) { patch.event_id = null }
    else {
      const { data: cal } = await sb.from('events').select('id, title, start_date, location, event_type').eq('id', req.body.event_id).eq('studio_id', sid).maybeSingle()
      if (!cal) return res.status(400).json({ error: 'Calendar event not found for this studio' })
      patch.event_id = cal.id; patch.name = cal.title; patch.event_date = cal.start_date; patch.location = cal.location || null
    }
  }
  const { data, error } = await sb.from('sponsor_events').update(patch).eq('id', req.params.id).eq('studio_id', sid).select().single()
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'That calendar event is already linked.' : error.message })
  res.json(data)
})

router.delete('/events/:id', requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await db().from('sponsor_events').delete().eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// GET /api/sponsors/events/:id — event + brand roster (brands are the shared pool).
router.get('/events/:id', async (req, res) => {
  try {
    const sb = db(); const sid = req.studio.id
    const { data: event } = await sb.from('sponsor_events').select('*').eq('id', req.params.id).eq('studio_id', sid).maybeSingle()
    if (!event) return res.status(404).json({ error: 'Event not found' })
    const cal = await calendarMap(sb, [event.event_id].filter(Boolean))
    const { data: roster } = await sb.from('sponsor_event_brands').select('*, sponsor_brands(name, domain, category)').eq('event_id', event.id)
    res.json({
      event: applyLinkedEvent(event, cal),
      brands: (roster || []).map(r => ({ id: r.id, brand_id: r.brand_id, role: r.role, slot: r.slot, item: r.item, status: r.status, name: r.sponsor_brands?.name, domain: r.sponsor_brands?.domain, category: r.sponsor_brands?.category })),
    })
  } catch (err) { console.error('GET /sponsors/events/:id', err.message); res.status(500).json({ error: err.message }) }
})

// Attach a brand (from the shared org pool) to a studio event.
router.post('/events/:id/brands', async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const { data: event } = await sb.from('sponsor_events').select('id').eq('id', req.params.id).eq('studio_id', sid).maybeSingle()
  if (!event) return res.status(404).json({ error: 'Event not found' })
  const { brand_id, role, slot, item } = req.body
  if (!brand_id || !role) return res.status(400).json({ error: 'brand_id and role required' })
  const { data, error } = await sb.from('sponsor_event_brands').upsert(
    { event_id: event.id, brand_id, role, slot: slot || null, item: item || null },
    { onConflict: 'event_id,brand_id,role', ignoreDuplicates: false },
  ).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.put('/event-brands/:rowId', async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const { data: evs } = await sb.from('sponsor_events').select('id').eq('studio_id', sid)
  const evIds = (evs || []).map(e => e.id)
  const patch = {}
  for (const k of ['role', 'slot', 'item', 'status']) if (req.body[k] !== undefined) patch[k] = req.body[k] === '' ? null : req.body[k]
  const { data, error } = await sb.from('sponsor_event_brands').update(patch).eq('id', req.params.rowId).in('event_id', evIds).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.delete('/event-brands/:rowId', async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const { data: evs } = await sb.from('sponsor_events').select('id').eq('studio_id', sid)
  const evIds = (evs || []).map(e => e.id)
  const { error } = await sb.from('sponsor_event_brands').delete().eq('id', req.params.rowId).in('event_id', evIds)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

module.exports = router
