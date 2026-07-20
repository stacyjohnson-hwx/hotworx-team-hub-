const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')
const { markContacted } = require('../services/b2bAutomation')
const authenticate = require('../middleware/authMiddleware')
const { todayInChicago } = require('../utils/dates')

const supabase = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ─── GET /api/b2b/contacts ───────────────────────────────────────────────────
// All roles: full contact list
router.get('/contacts', authenticate, requireStudio, async (req, res) => {
  const db = supabase()

  const { data, error } = await db
    .from('b2b_contacts')
    .select('*')
    .eq('studio_id', req.studio.id)
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })

  // "Last contacted" = most recent of a logged interaction OR a linked event
  // that has already occurred.
  const today = todayInChicago()

  const [{ data: lastRows }, { data: evRows }] = await Promise.all([
    db.from('b2b_interactions').select('contact_id, logged_at').order('logged_at', { ascending: false }),
    db.from('event_b2b_contacts').select('b2b_contact_id, events(start_date)'),
  ])

  const lastMap = {}
  for (const row of lastRows || []) {
    if (!lastMap[row.contact_id]) lastMap[row.contact_id] = row.logged_at
  }

  const eventMap = {}
  for (const row of evRows || []) {
    const sd = row.events?.start_date
    if (!sd || sd > today) continue // only events that have happened
    if (!eventMap[row.b2b_contact_id] || sd > eventMap[row.b2b_contact_id]) eventMap[row.b2b_contact_id] = sd
  }

  res.json(data.map(c => {
    let last = lastMap[c.id] || null
    const lastEvent = eventMap[c.id] || null
    if (lastEvent && (!last || new Date(lastEvent) > new Date(last))) last = lastEvent
    return { ...c, last_interacted_at: last }
  }))
})

// ─── POST /api/b2b/contacts ──────────────────────────────────────────────────
// When a B2B contact is an Apartment, mirror it into the Canvassing tracker as a
// linked territory — once. No-op if a linked zone already exists; if an unlinked
// same-named apartment zone exists, link it instead of creating a duplicate.
async function ensureApartmentTerritory(db, contact) {
  try {
    if (!contact || !(contact.industry || '').toLowerCase().includes('apart')) return
    const { data: linked } = await db.from('territories')
      .select('id').eq('studio_id', contact.studio_id).eq('b2b_contact_id', contact.id).limit(1)
    if (linked && linked.length) return // already linked

    const { data: sameName } = await db.from('territories')
      .select('id').eq('studio_id', contact.studio_id).eq('type', 'apartment')
      .is('b2b_contact_id', null).ilike('name', contact.business_name).limit(1)
    if (sameName && sameName.length) {
      await db.from('territories').update({
        b2b_contact_id: contact.id,
        address: contact.address || null,
        latitude: contact.latitude || null,
        longitude: contact.longitude || null,
      }).eq('id', sameName[0].id)
      return
    }
    await db.from('territories').insert({
      studio_id: contact.studio_id, name: contact.business_name, type: 'apartment',
      address: contact.address || null, latitude: contact.latitude || null, longitude: contact.longitude || null,
      cadence_days: 21, b2b_contact_id: contact.id, active: true,
    })
  } catch (e) { /* non-fatal: contact still saved even if territory mirror fails */ }
}

router.post('/contacts', authenticate, requireStudio, async (req, res) => {
  const {
    business_name, contact_name, phone, email, address, industry,
    website, social_handle, logo_url, partner_type,
    status, discount_desc, discount_ongoing, next_action, next_action_date,
    notes, assigned_to, latitude, longitude,
    guests_referred, members_referred, revenue_generated, is_partner, has_lead_box,
  } = req.body

  if (!business_name) return res.status(400).json({ error: 'business_name is required' })

  const { data, error } = await supabase()
    .from('b2b_contacts')
    .insert({
      business_name,
      contact_name: contact_name || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      industry: industry || null,
      website: website || null,
      social_handle: social_handle || null,
      logo_url: logo_url || null,
      partner_type: partner_type === 'corporate' ? 'corporate' : 'referral_collab',
      status: status || 'new_lead',
      discount_desc: discount_desc || null,
      discount_ongoing: discount_ongoing || false,
      next_action: next_action || null,
      next_action_date: next_action_date || null,
      notes: notes || null,
      assigned_to: assigned_to || null,
      latitude: latitude || null,
      longitude: longitude || null,
      guests_referred: Number(guests_referred) || 0,
      members_referred: Number(members_referred) || 0,
      revenue_generated: Number(revenue_generated) || 0,
      is_partner: !!is_partner,
      has_lead_box: !!has_lead_box,
      created_by: req.user.id,
      studio_id: req.studio.id,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  await ensureApartmentTerritory(supabase(), data)
  res.status(201).json(data)
})

// ─── PUT /api/b2b/contacts/:id ───────────────────────────────────────────────
router.put('/contacts/:id', authenticate, requireStudio, async (req, res) => {
  const {
    business_name, contact_name, phone, email, address, industry,
    website, social_handle, logo_url, partner_type,
    status, discount_desc, discount_ongoing, next_action, next_action_date,
    notes, assigned_to, latitude, longitude,
    guests_referred, members_referred, revenue_generated, is_partner, has_lead_box,
  } = req.body

  const { data, error } = await supabase()
    .from('b2b_contacts')
    .update({
      business_name, contact_name, phone, email, address, industry,
      website, social_handle, logo_url,
      ...(partner_type ? { partner_type: partner_type === 'corporate' ? 'corporate' : 'referral_collab' } : {}),
      status, discount_desc, discount_ongoing, next_action,
      next_action_date: next_action_date || null, // empty string → null (DATE column)
      notes, assigned_to: assigned_to || null,
      latitude: latitude || null,
      longitude: longitude || null,
      ...(guests_referred  !== undefined ? { guests_referred:  Number(guests_referred)  || 0 } : {}),
      ...(members_referred !== undefined ? { members_referred: Number(members_referred) || 0 } : {}),
      ...(revenue_generated !== undefined ? { revenue_generated: Number(revenue_generated) || 0 } : {}),
      ...(is_partner !== undefined ? { is_partner: !!is_partner } : {}),
      ...(has_lead_box !== undefined ? { has_lead_box: !!has_lead_box } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .eq('studio_id', req.studio.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  await ensureApartmentTerritory(supabase(), data)
  res.json(data)
})

// ─── DELETE /api/b2b/contacts/:id ────────────────────────────────────────────
router.delete('/contacts/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await supabase()
    .from('b2b_contacts')
    .delete()
    .eq('id', req.params.id)
    .eq('studio_id', req.studio.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── GET /api/b2b/contacts/:id/interactions ──────────────────────────────────
router.get('/contacts/:id/interactions', authenticate, requireStudio, async (req, res) => {
  const { data, error} = await supabase()
    .from('b2b_interactions')
    .select('*')
    .eq('contact_id', req.params.id)
    .eq('studio_id', req.studio.id)
    .order('logged_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  // Enrich with user names
  const db = supabase()
  const { data: { users } } = await db.auth.admin.listUsers({ perPage: 200 })
  const userMap = {}
  for (const u of users || []) {
    userMap[u.id] = u.user_metadata?.full_name || u.email?.split('@')[0] || 'Team Member'
  }

  const enriched = (data || []).map(i => ({
    ...i,
    logged_by_name: userMap[i.logged_by] || 'Team Member',
  }))

  res.json(enriched)
})

// ─── POST /api/b2b/contacts/:id/interactions ─────────────────────────────────
router.post('/contacts/:id/interactions', authenticate, requireStudio, async (req, res) => {
  const { type, notes, logged_at, follow_up_date } = req.body

  if (!type) return res.status(400).json({ error: 'type is required' })

  const { data, error } = await supabase()
    .from('b2b_interactions')
    .insert({
      contact_id: req.params.id,
      type,
      notes: notes || null,
      logged_by: req.user.id,
      studio_id: req.studio.id,
      follow_up_date: follow_up_date || null,
      ...(logged_at ? { logged_at } : {}),
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  await markContacted(req.params.id)   // automation: reaching out → Contacted

  res.status(201).json(data)
})

// ─── PUT /api/b2b/interactions/:id ───────────────────────────────────────────
router.put('/interactions/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { type, notes, logged_at, follow_up_date, follow_up_done } = req.body
  if (!type) return res.status(400).json({ error: 'type is required' })

  const { data, error } = await supabase()
    .from('b2b_interactions')
    .update({
      type,
      notes: notes || null,
      ...(logged_at ? { logged_at } : {}),
      ...(follow_up_date !== undefined ? { follow_up_date: follow_up_date || null } : {}),
      ...(follow_up_done !== undefined ? { follow_up_done: !!follow_up_done } : {}),
    })
    .eq('id', req.params.id)
    .eq('studio_id', req.studio.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── POST /api/b2b/interactions/:id/followup-done ────────────────────────────
// Mark a scheduled follow-up complete (from the Follow-ups Due strip).
router.post('/interactions/:id/followup-done', authenticate, requireStudio, async (req, res) => {
  const { data, error } = await supabase()
    .from('b2b_interactions')
    .update({ follow_up_done: req.body.done === false ? false : true })
    .eq('id', req.params.id)
    .eq('studio_id', req.studio.id)
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── GET /api/b2b/followups ──────────────────────────────────────────────────
// All scheduled, not-yet-done follow-ups (each an interaction with a future or
// past follow_up_date), joined to its vendor. The B2B page splits these into a
// "due today / overdue" queue and uses the future ones to know who's scheduled.
router.get('/followups', authenticate, requireStudio, async (req, res) => {
  const db = supabase()
  const today = todayInChicago()
  const { data, error } = await db
    .from('b2b_interactions')
    .select('id, contact_id, type, notes, follow_up_date, logged_by')
    .eq('studio_id', req.studio.id)
    .eq('follow_up_done', false)
    .not('follow_up_date', 'is', null)
    .order('follow_up_date', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })

  const ids = [...new Set((data || []).map(r => r.contact_id))]
  const { data: contacts } = ids.length
    ? await db.from('b2b_contacts').select('id, business_name, contact_name, phone, email, status').in('id', ids)
    : { data: [] }
  const cMap = Object.fromEntries((contacts || []).map(c => [c.id, c]))
  res.json((data || []).map(r => ({
    ...r,
    overdue: r.follow_up_date < today,
    contact: cMap[r.contact_id] || null,
  })).filter(r => r.contact && r.contact.status !== 'closed'))   // closed vendors drop out of the follow-up queue
})

// ─── DELETE /api/b2b/interactions/:id ────────────────────────────────────────
router.delete('/interactions/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await supabase()
    .from('b2b_interactions')
    .delete()
    .eq('id', req.params.id)
    .eq('studio_id', req.studio.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── Events linked to a contact ──────────────────────────────────────────────

// GET /api/b2b/contacts/:id/events
router.get('/contacts/:id/events', authenticate, requireStudio, async (req, res) => {
  try {
    const db = supabase()

    // Use a SECURITY DEFINER function to bypass any PostgREST table-access issues
    const { data, error } = await db
      .rpc('get_contact_linked_events', { p_contact_id: req.params.id })

    if (error) throw new Error(error.message)
    res.json(data || [])
  } catch (err) {
    console.error('GET /b2b/contacts/:id/events', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/b2b/report ─────────────────────────────────────────────────────
// Pipeline + activity report for the studio.
router.get('/report', authenticate, requireStudio, async (req, res) => {
  try {
    const db = supabase()
    const sid = req.studio.id
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const since30 = new Date(Date.now() - 30 * 86400000).toISOString()

    const [{ data: contacts }, { data: inter }] = await Promise.all([
      db.from('b2b_contacts').select('status, is_partner, has_lead_box, created_at').eq('studio_id', sid),
      db.from('b2b_interactions').select('logged_by, logged_at, contact_id').eq('studio_id', sid).gte('logged_at', since30),
    ])

    const byStage = {}
    let partners = 0, leadBoxes = 0, addedThisMonth = 0
    for (const c of contacts || []) {
      byStage[c.status] = (byStage[c.status] || 0) + 1
      if (c.is_partner) partners++
      if (c.has_lead_box) leadBoxes++
      if (c.created_at && c.created_at >= monthStart) addedThisMonth++
    }

    // Activity per rep (interactions logged in the last 30 days) — active users only.
    const { data: { users } } = await db.auth.admin.listUsers({ perPage: 200 })
    const { data: profiles } = await db.from('user_profiles').select('id, is_active')
    const activeSet = new Set((profiles || []).filter(p => p.is_active !== false).map(p => p.id))
    const nameMap = {}
    for (const u of users || []) nameMap[u.id] = u.user_metadata?.full_name || u.email?.split('@')[0] || 'Team Member'

    const repCount = {}                       // rep id -> interaction count
    const repContacts = {}                    // rep id -> Set of contact ids
    const activityContactIds = new Set()      // all contacts touched in the window
    for (const i of inter || []) {
      if (i.contact_id) activityContactIds.add(i.contact_id)
      if (!i.logged_by) continue
      repCount[i.logged_by] = (repCount[i.logged_by] || 0) + 1
      if (i.contact_id) (repContacts[i.logged_by] = repContacts[i.logged_by] || new Set()).add(i.contact_id)
    }
    const activityByRep = Object.entries(repCount)
      .filter(([id]) => activeSet.has(id))
      .map(([id, count]) => ({ id, name: nameMap[id] || 'Team Member', interactions: count, contactIds: [...(repContacts[id] || [])] }))
      .sort((a, b) => b.interactions - a.interactions)

    res.json({
      total: (contacts || []).length,
      byStage, addedThisMonth, partners, leadBoxes,
      interactions30: (inter || []).length,
      activityContactIds: [...activityContactIds],
      activityByRep,
    })
  } catch (err) {
    console.error('GET /b2b/report', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
