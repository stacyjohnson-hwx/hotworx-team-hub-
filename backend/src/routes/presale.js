// Pre-Sale planner (PRD Phase 1 — Track). A campaign layer with a lead ledger:
// actuals are always SUM(lead_count), never typed over. Studio-scoped; the tab is
// only shown when studios.presale_enabled is true (Franchise Admin toggle).
const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireStudio } = require('../middleware/studioMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { todayInChicago } = require('../utils/dates')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
router.use(authenticate, requireStudio)

async function activeCampaign(sb, studioId) {
  const { data } = await sb.from('presale_campaigns').select('*')
    .eq('studio_id', studioId).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data || null
}

// ─── GET /api/presale/dashboard ──────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const sb = db(); const sid = req.studio.id
    const campaign = await activeCampaign(sb, sid)
    if (!campaign) return res.json({ campaign: null })

    const [{ data: channels }, { data: log }] = await Promise.all([
      sb.from('presale_channels').select('*').eq('campaign_id', campaign.id).order('sort_order'),
      sb.from('presale_lead_log').select('channel_id, lead_count, logged_on').eq('campaign_id', campaign.id),
    ])
    const actualByCh = {}, dailyMap = {}
    for (const l of log || []) {
      actualByCh[l.channel_id] = (actualByCh[l.channel_id] || 0) + (l.lead_count || 0)
      dailyMap[l.logged_on] = (dailyMap[l.logged_on] || 0) + (l.lead_count || 0)
    }
    const chRows = (channels || []).map(c => ({
      id: c.id, key: c.key, label: c.label, channel_group: c.channel_group || 'Other',
      plan_units: Number(c.plan_units) || 0, plan_per_unit: Number(c.plan_per_unit) || 0,
      planned: (Number(c.plan_units) || 0) * (Number(c.plan_per_unit) || 0),
      actual: actualByCh[c.id] || 0,
    }))
    const actual = chRows.reduce((s, c) => s + c.actual, 0)
    const planned = chRows.reduce((s, c) => s + c.planned, 0)

    // Pace: leads/day needed to hit the goal by launch day.
    const today = todayInChicago()
    let daysRemaining = null, perDayRequired = null
    if (campaign.launch_day) {
      daysRemaining = Math.max(0, Math.round((new Date(campaign.launch_day) - new Date(today)) / 86400000))
      const gap = Math.max(0, campaign.goal_leads - actual)
      perDayRequired = daysRemaining > 0 ? Math.ceil(gap / daysRemaining) : gap
    }
    // Last 14 days sparkline.
    const daily = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - i)
      const ds = d.toISOString().slice(0, 10)
      daily.push({ date: ds, count: dailyMap[ds] || 0 })
    }

    res.json({
      campaign, goal: campaign.goal_leads, actual, planned,
      channels: chRows,
      pace: { today, days_remaining: daysRemaining, per_day_required: perDayRequired, gap: Math.max(0, campaign.goal_leads - actual) },
      daily,
    })
  } catch (err) {
    console.error('GET /presale/dashboard', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── Phase 2 — Connect: shared helpers ───────────────────────────────────────
const ROLE_LABEL = { hour_sponsor: 'hour sponsor', prize_donor: 'prize donor', business_ambassador: 'business ambassador', event_host: 'event host', corporate: 'corporate partner', apartment: 'apartment' }
// Every pre-sale action writes a [Pre-Sale] interaction onto the business card.
async function logInteraction(sb, { contact_id, studio_id, type, note, logged_by }) {
  if (!contact_id) return
  await sb.from('b2b_interactions').insert({
    contact_id, studio_id, type, notes: `[Pre-Sale] ${note}`, logged_by, logged_at: new Date().toISOString(),
  })
}
const haversineMi = (aLat, aLng, bLat, bLng) => {
  if ([aLat, aLng, bLat, bLng].some(v => v == null)) return null
  const R = 3958.8, toRad = d => d * Math.PI / 180
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(s))
}

// ─── POST /api/presale/leads — append to the ledger (optionally attributed) ──
router.post('/leads', async (req, res) => {
  try {
    const sb = db(); const sid = req.studio.id
    const { channel_id, lead_count, logged_on, source_tag, notes, b2b_contact_id, event_id } = req.body
    const n = parseInt(lead_count)
    if (!channel_id || !Number.isFinite(n)) return res.status(400).json({ error: 'channel_id and lead_count required' })
    const { data: ch } = await sb.from('presale_channels').select('id, campaign_id, studio_id').eq('id', channel_id).maybeSingle()
    if (!ch || ch.studio_id !== sid) return res.status(404).json({ error: 'Channel not found for this studio' })
    const { data, error } = await sb.from('presale_lead_log').insert({
      campaign_id: ch.campaign_id, channel_id, studio_id: sid,
      logged_on: logged_on || todayInChicago(), lead_count: n,
      source_tag: source_tag || null, notes: notes || null,
      b2b_contact_id: b2b_contact_id || null, event_id: event_id || null, logged_by: req.user.id,
    }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    // Attributed to a business → bump guests_referred + write it onto the card.
    if (b2b_contact_id && n > 0) {
      const { data: c } = await sb.from('b2b_contacts').select('guests_referred').eq('id', b2b_contact_id).maybeSingle()
      await sb.from('b2b_contacts').update({ guests_referred: (c?.guests_referred || 0) + n, updated_at: new Date().toISOString() }).eq('id', b2b_contact_id)
      await logInteraction(sb, { contact_id: b2b_contact_id, studio_id: sid, type: 'other', note: `${n} leads attributed${source_tag ? ` via ?src=${source_tag}` : ''}`, logged_by: req.user.id })
    }
    res.status(201).json(data)
  } catch (err) {
    console.error('POST /presale/leads', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/presale/businesses — the B2B picker source ─────────────────────
router.get('/businesses', async (req, res) => {
  try {
    const sb = db(); const sid = req.studio.id
    const campaign = await activeCampaign(sb, sid)
    const [{ data: contacts }, { data: studio }, partnersRes] = await Promise.all([
      sb.from('b2b_contacts').select('id, business_name, industry, status, partner_type, logo_url, phone, email, address, latitude, longitude').eq('studio_id', sid).order('business_name'),
      sb.from('studios').select('latitude, longitude').eq('id', sid).maybeSingle(),
      campaign ? sb.from('presale_partners').select('b2b_contact_id, role').eq('campaign_id', campaign.id) : Promise.resolve({ data: [] }),
    ])
    const rolesBy = {}; for (const p of partnersRes.data || []) (rolesBy[p.b2b_contact_id] = rolesBy[p.b2b_contact_id] || []).push(p.role)
    res.json((contacts || []).map(c => {
      const d = studio ? haversineMi(studio.latitude, studio.longitude, c.latitude, c.longitude) : null
      return { ...c, distance_mi: d == null ? null : Math.round(d * 10) / 10, partner_roles: rolesBy[c.id] || [] }
    }))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ─── Partners (the campaign↔business join) ───────────────────────────────────
router.get('/partners', async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const campaign = await activeCampaign(sb, sid)
  if (!campaign) return res.json([])
  const [{ data: partners }, { data: leads }] = await Promise.all([
    sb.from('presale_partners').select('*, b2b_contacts(business_name, logo_url, phone, industry)').eq('campaign_id', campaign.id).order('created_at'),
    sb.from('presale_lead_log').select('b2b_contact_id, lead_count').eq('campaign_id', campaign.id).not('b2b_contact_id', 'is', null),
  ])
  const leadsBy = {}; for (const l of leads || []) leadsBy[l.b2b_contact_id] = (leadsBy[l.b2b_contact_id] || 0) + (l.lead_count || 0)
  res.json((partners || []).map(p => ({
    ...p, business_name: p.b2b_contacts?.business_name, logo_url: p.b2b_contacts?.logo_url,
    phone: p.b2b_contacts?.phone, industry: p.b2b_contacts?.industry,
    leads_attributed: leadsBy[p.b2b_contact_id] || 0, b2b_contacts: undefined,
  })))
})

router.post('/partners', async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const campaign = await activeCampaign(sb, sid)
  if (!campaign) return res.status(400).json({ error: 'No campaign for this studio' })
  const { contact_ids, role } = req.body
  if (!Array.isArray(contact_ids) || !contact_ids.length || !role) return res.status(400).json({ error: 'contact_ids and role required' })
  const rows = contact_ids.map(cid => ({ campaign_id: campaign.id, studio_id: sid, b2b_contact_id: cid, role }))
  const { data, error } = await sb.from('presale_partners').upsert(rows, { onConflict: 'campaign_id,b2b_contact_id,role', ignoreDuplicates: true }).select()
  if (error) return res.status(500).json({ error: error.message })
  for (const cid of contact_ids) await logInteraction(sb, { contact_id: cid, studio_id: sid, type: 'other', note: `Added as ${ROLE_LABEL[role] || role} — ${campaign.name}`, logged_by: req.user.id })
  res.status(201).json(data || [])
})

router.put('/partners/:id', async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const { data: existing } = await sb.from('presale_partners').select('*').eq('id', req.params.id).eq('studio_id', sid).maybeSingle()
  if (!existing) return res.status(404).json({ error: 'Partner not found' })
  const patch = { updated_at: new Date().toISOString() }
  for (const k of ['status', 'commitment', 'prize_item', 'hour_slot']) if (req.body[k] !== undefined) patch[k] = req.body[k] === '' ? null : req.body[k]
  if (req.body.ig_live_confirmed !== undefined) patch.ig_live_confirmed = !!req.body.ig_live_confirmed
  if (req.body.prize_value !== undefined) patch.prize_value = req.body.prize_value === '' ? null : Number(req.body.prize_value)
  const { data, error } = await sb.from('presale_partners').update(patch).eq('id', req.params.id).eq('studio_id', sid).select().single()
  if (error) return res.status(500).json({ error: error.message })
  if (patch.status && patch.status !== existing.status && ['committed', 'confirmed'].includes(patch.status)) {
    const detail = data.hour_slot ? `${data.hour_slot} hour` : (data.commitment || ROLE_LABEL[data.role] || data.role)
    await logInteraction(sb, { contact_id: data.b2b_contact_id, studio_id: sid, type: 'meeting', note: `${patch.status[0].toUpperCase() + patch.status.slice(1)} — ${detail}`, logged_by: req.user.id })
  }
  if (patch.prize_item && patch.prize_item !== existing.prize_item) {
    await logInteraction(sb, { contact_id: data.b2b_contact_id, studio_id: sid, type: 'drop', note: `Donated ${data.prize_item}${data.prize_value ? ` ($${data.prize_value})` : ''}`, logged_by: req.user.id })
  }
  res.json(data)
})

router.delete('/partners/:id', async (req, res) => {
  const { error } = await db().from('presale_partners').delete().eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── GET /api/presale/contact/:id/activity — the Pre-Sale section on the B2B card ─
router.get('/contact/:contactId/activity', async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const campaign = await activeCampaign(sb, sid)
  if (!campaign) return res.json({ enabled: false })
  const [{ data: partners }, { data: leads }] = await Promise.all([
    sb.from('presale_partners').select('role, status, hour_slot, prize_item, prize_value, ig_live_confirmed').eq('campaign_id', campaign.id).eq('b2b_contact_id', req.params.contactId),
    sb.from('presale_lead_log').select('lead_count').eq('campaign_id', campaign.id).eq('b2b_contact_id', req.params.contactId),
  ])
  if (!partners || !partners.length) return res.json({ enabled: true, in_campaign: false })
  res.json({
    enabled: true, in_campaign: true, campaign_name: campaign.name,
    partners, leads_attributed: (leads || []).reduce((s, l) => s + (l.lead_count || 0), 0),
  })
})

// ─── Events (create / link, attach businesses, capture leads) ────────────────
router.get('/events', async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const campaign = await activeCampaign(sb, sid)
  if (!campaign) return res.json({ linked: [], available: [] })
  const { data: links } = await sb.from('presale_event_links').select('event_id').eq('campaign_id', campaign.id)
  const linkedIds = (links || []).map(l => l.event_id)
  const [{ data: events }, { data: attachRows }, { data: eventLeads }, { data: evChannel }] = await Promise.all([
    sb.from('events').select('id, title, event_type, start_date').eq('studio_id', sid).order('start_date', { ascending: false }),
    linkedIds.length ? sb.from('event_b2b_contacts').select('event_id, b2b_contact_id').in('event_id', linkedIds) : Promise.resolve({ data: [] }),
    linkedIds.length ? sb.from('presale_lead_log').select('event_id, lead_count').eq('campaign_id', campaign.id).in('event_id', linkedIds) : Promise.resolve({ data: [] }),
    sb.from('presale_channels').select('id').eq('campaign_id', campaign.id).eq('key', 'events').maybeSingle(),
  ])
  const attachBy = {}; for (const a of attachRows || []) attachBy[a.event_id] = (attachBy[a.event_id] || 0) + 1
  const leadsBy = {}; for (const l of eventLeads || []) leadsBy[l.event_id] = (leadsBy[l.event_id] || 0) + (l.lead_count || 0)
  const isLinked = new Set(linkedIds)
  const shape = (e) => ({ ...e, businesses: attachBy[e.id] || 0, leads_captured: leadsBy[e.id] || 0 })
  res.json({
    events_channel_id: evChannel?.id || null,
    linked: (events || []).filter(e => isLinked.has(e.id)).map(shape),
    available: (events || []).filter(e => !isLinked.has(e.id)),
  })
})

router.post('/events', async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const campaign = await activeCampaign(sb, sid)
  if (!campaign) return res.status(400).json({ error: 'No campaign' })
  const { title, event_type, start_date } = req.body
  if (!title || !start_date) return res.status(400).json({ error: 'title and start_date required' })
  const d = new Date(start_date + 'T00:00:00')
  const { data: ev, error } = await sb.from('events').insert({
    studio_id: sid, title: String(title).trim(), event_type: event_type || 'pop_up',
    start_date, month: d.getMonth() + 1, year: d.getFullYear(), created_by: req.user.id,
  }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  await sb.from('presale_event_links').insert({ campaign_id: campaign.id, event_id: ev.id, studio_id: sid })
  res.status(201).json(ev)
})

router.post('/events/link', async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const campaign = await activeCampaign(sb, sid)
  if (!campaign || !req.body.event_id) return res.status(400).json({ error: 'campaign + event_id required' })
  const { error } = await sb.from('presale_event_links').upsert({ campaign_id: campaign.id, event_id: req.body.event_id, studio_id: sid }, { onConflict: 'campaign_id,event_id' })
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json({ ok: true })
})

router.post('/events/:id/attach', async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const { contact_ids } = req.body
  if (!Array.isArray(contact_ids) || !contact_ids.length) return res.status(400).json({ error: 'contact_ids required' })
  const rows = contact_ids.map(cid => ({ event_id: req.params.id, b2b_contact_id: cid }))
  const { error } = await sb.from('event_b2b_contacts').upsert(rows, { onConflict: 'event_id,b2b_contact_id', ignoreDuplicates: true })
  if (error) return res.status(500).json({ error: error.message })
  for (const cid of contact_ids) await logInteraction(sb, { contact_id: cid, studio_id: sid, type: 'other', note: 'Attached to a pre-sale event', logged_by: req.user.id })
  res.status(201).json({ ok: true })
})

router.post('/events/:id/leads', async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const campaign = await activeCampaign(sb, sid)
  const n = parseInt(req.body.lead_count)
  if (!campaign || !Number.isFinite(n)) return res.status(400).json({ error: 'lead_count required' })
  const { data: ch } = await sb.from('presale_channels').select('id').eq('campaign_id', campaign.id).eq('key', 'events').maybeSingle()
  if (!ch) return res.status(400).json({ error: 'No events channel' })
  const { data, error } = await sb.from('presale_lead_log').insert({
    campaign_id: campaign.id, channel_id: ch.id, studio_id: sid, logged_on: todayInChicago(),
    lead_count: n, event_id: req.params.id, source_tag: `evt-${String(req.params.id).slice(0, 8)}`, logged_by: req.user.id,
  }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── PUT /api/presale/channels/:id/plan — edit the plan (owner only) ──────────
router.put('/channels/:id/plan', requireRole('owner'), async (req, res) => {
  const sb = db()
  const num = (v) => (v === '' || v == null) ? 0 : Number(v)
  const patch = {}
  if (req.body.plan_units !== undefined) patch.plan_units = num(req.body.plan_units)
  if (req.body.plan_per_unit !== undefined) patch.plan_per_unit = num(req.body.plan_per_unit)
  const { data, error } = await sb.from('presale_channels').update(patch)
    .eq('id', req.params.id).eq('studio_id', req.studio.id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── PUT /api/presale/campaign — edit goal / launch day (owner only) ──────────
router.put('/campaign', requireRole('owner'), async (req, res) => {
  const sb = db()
  const patch = { updated_at: new Date().toISOString() }
  if (req.body.goal_leads !== undefined) patch.goal_leads = parseInt(req.body.goal_leads) || 1000
  if (req.body.launch_day !== undefined) patch.launch_day = req.body.launch_day || null
  if (req.body.name !== undefined) patch.name = String(req.body.name).trim()
  const { data, error } = await sb.from('presale_campaigns').update(patch)
    .eq('studio_id', req.studio.id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── Phase 3 — Field: shared helpers ─────────────────────────────────────────
const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 18) || 'x'
async function channelIdByKey(sb, campaignId, key) {
  const { data } = await sb.from('presale_channels').select('id').eq('campaign_id', campaignId).eq('key', key).maybeSingle()
  return data?.id || null
}
// All active team members of the studio (incl. owner/manager) → { map, team } for assignees.
async function studioNames(sb, studioId) {
  const [{ data: usersRes }, { data: members }, { data: inactive }] = await Promise.all([
    sb.auth.admin.listUsers(),
    sb.from('user_studios').select('user_id, role').eq('studio_id', studioId),
    sb.from('user_profiles').select('id').eq('is_active', false),
  ])
  const roleBy = Object.fromEntries((members || []).map(m => [m.user_id, m.role]))
  const inactiveIds = new Set((inactive || []).map(r => r.id))
  const map = {}, team = []
  for (const u of usersRes?.users || []) {
    if (!roleBy[u.id] || inactiveIds.has(u.id)) continue
    const name = u.user_metadata?.full_name || u.email?.split('@')[0] || 'Team Member'
    map[u.id] = name; team.push({ id: u.id, name, role: roleBy[u.id] })
  }
  team.sort((a, b) => a.name.localeCompare(b.name))
  return { map, team }
}
// Insert a ledger row and, when attributed to a business, mirror it onto the B2B card.
async function postLeads(sb, { campaign_id, channel_id, studio_id, n, logged_on, source_tag, b2b_contact_id, event_id, territory_id, ambassador_id, logged_by }) {
  const { data, error } = await sb.from('presale_lead_log').insert({
    campaign_id, channel_id, studio_id, logged_on: logged_on || todayInChicago(), lead_count: n,
    source_tag: source_tag || null, b2b_contact_id: b2b_contact_id || null, event_id: event_id || null,
    territory_id: territory_id || null, ambassador_id: ambassador_id || null, logged_by,
  }).select().single()
  if (error) throw new Error(error.message)
  if (b2b_contact_id && n > 0) {
    const { data: c } = await sb.from('b2b_contacts').select('guests_referred').eq('id', b2b_contact_id).maybeSingle()
    await sb.from('b2b_contacts').update({ guests_referred: (c?.guests_referred || 0) + n, updated_at: new Date().toISOString() }).eq('id', b2b_contact_id)
    await logInteraction(sb, { contact_id: b2b_contact_id, studio_id, type: 'other', note: `${n} leads attributed${source_tag ? ` via ?src=${source_tag}` : ''}`, logged_by })
  }
  return data
}

// ─── Canvass — routes read from territories; a visit dual-writes ──────────────
router.get('/canvass', async (req, res) => {
  try {
    const sb = db(); const sid = req.studio.id
    const campaign = await activeCampaign(sb, sid)
    const [{ data: terrs }, { data: visits }, { data: leads }, names, bizCh, aptCh] = await Promise.all([
      sb.from('territories').select('id, name, type, address, latitude, longitude, cadence_days, assigned_to, b2b_contact_id, active').eq('studio_id', sid).eq('active', true).order('name'),
      sb.from('territory_visits').select('territory_id, visit_date').eq('studio_id', sid),
      campaign ? sb.from('presale_lead_log').select('territory_id, lead_count').eq('campaign_id', campaign.id).not('territory_id', 'is', null) : Promise.resolve({ data: [] }),
      studioNames(sb, sid),
      campaign ? channelIdByKey(sb, campaign.id, 'bizcanvass') : Promise.resolve(null),
      campaign ? channelIdByKey(sb, campaign.id, 'apartments') : Promise.resolve(null),
    ])
    const lastBy = {}; for (const v of visits || []) if (!lastBy[v.territory_id] || v.visit_date > lastBy[v.territory_id]) lastBy[v.territory_id] = v.visit_date
    const leadsBy = {}; for (const l of leads || []) leadsBy[l.territory_id] = (leadsBy[l.territory_id] || 0) + (l.lead_count || 0)
    res.json({
      channels: { bizcanvass: bizCh, apartments: aptCh },
      team: names.team,
      routes: (terrs || []).map(t => ({
        ...t, assignee_name: t.assigned_to ? (names.map[t.assigned_to] || null) : null,
        last_visit: lastBy[t.id] || null, leads: leadsBy[t.id] || 0,
      })),
    })
  } catch (err) { console.error('GET /presale/canvass', err.message); res.status(500).json({ error: err.message }) }
})

router.post('/canvass/:territoryId/visit', async (req, res) => {
  try {
    const sb = db(); const sid = req.studio.id
    const { data: terr } = await sb.from('territories').select('id, name, type, b2b_contact_id').eq('id', req.params.territoryId).eq('studio_id', sid).maybeSingle()
    if (!terr) return res.status(404).json({ error: 'Route not found' })
    const doors = parseInt(req.body.doors) || 0
    const worked = parseInt(req.body.worked) || 0
    const leads = parseInt(req.body.leads) || 0
    const userNote = (req.body.notes || '').trim()
    const parts = []
    if (doors) parts.push(`${doors} doors`)
    if (worked) parts.push(`${worked} worked`)
    if (leads) parts.push(`${leads} leads`)
    if (userNote) parts.push(userNote)
    const note = parts.join(' · ') || 'Route visit'
    await sb.from('territory_visits').insert({
      territory_id: terr.id, studio_id: sid, visited_by: req.user.id,
      visit_date: todayInChicago(), activity_type: 'canvass', notes: note,
    })
    // Dual write: if the route is a business, the visit shows on its B2B card.
    if (terr.b2b_contact_id) {
      await logInteraction(sb, { contact_id: terr.b2b_contact_id, studio_id: sid, type: 'visit', note: `Route visit — ${note}`, logged_by: req.user.id })
    }
    // Leads post to the ledger on the right channel, tagged to the route.
    let logged = null
    if (leads > 0) {
      const campaign = await activeCampaign(sb, sid)
      if (campaign) {
        const key = terr.type === 'apartment' ? 'apartments' : 'bizcanvass'
        const channel_id = await channelIdByKey(sb, campaign.id, key)
        if (channel_id) {
          logged = await postLeads(sb, {
            campaign_id: campaign.id, channel_id, studio_id: sid, n: leads,
            source_tag: `terr-${slugify(terr.name)}`, territory_id: terr.id,
            b2b_contact_id: terr.b2b_contact_id || null, logged_by: req.user.id,
          })
        }
      }
    }
    res.status(201).json({ ok: true, leads_logged: logged?.lead_count || 0 })
  } catch (err) { console.error('POST /presale/canvass/visit', err.message); res.status(500).json({ error: err.message }) }
})

// ─── Ambassadors — roster + source-tag attribution ───────────────────────────
router.get('/ambassadors', async (req, res) => {
  try {
    const sb = db(); const sid = req.studio.id
    const campaign = await activeCampaign(sb, sid)
    if (!campaign) return res.json({ ambassadors: [], team: [] })
    const [{ data: ambs }, { data: leads }, names] = await Promise.all([
      sb.from('presale_ambassadors').select('*').eq('campaign_id', campaign.id).order('created_at'),
      sb.from('presale_lead_log').select('ambassador_id, lead_count').eq('campaign_id', campaign.id).not('ambassador_id', 'is', null),
      studioNames(sb, sid),
    ])
    const leadsBy = {}; for (const l of leads || []) leadsBy[l.ambassador_id] = (leadsBy[l.ambassador_id] || 0) + (l.lead_count || 0)
    res.json({
      team: names.team,
      ambassadors: (ambs || []).map(a => ({ ...a, leads_attributed: leadsBy[a.id] || 0, assignee_name: a.assigned_to ? (names.map[a.assigned_to] || null) : null })),
    })
  } catch (err) { console.error('GET /presale/ambassadors', err.message); res.status(500).json({ error: err.message }) }
})

router.post('/ambassadors', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const sb = db(); const sid = req.studio.id
    const campaign = await activeCampaign(sb, sid)
    if (!campaign) return res.status(400).json({ error: 'No campaign' })
    const { full_name, handle, type, org_name, b2b_contact_id, reward_tier, contact, assigned_to } = req.body
    if (!full_name) return res.status(400).json({ error: 'full_name required' })
    const t = ['member', 'community', 'staff'].includes(type) ? type : 'community'
    const prefix = t === 'member' ? 'mem' : t === 'staff' ? 'staff' : 'comm'
    const base = `${prefix}-${slugify(handle || full_name)}`
    let tag = base, attempt = 0, row = null
    while (attempt < 5 && !row) {
      const { data, error } = await sb.from('presale_ambassadors').insert({
        campaign_id: campaign.id, studio_id: sid, full_name: String(full_name).trim(),
        handle: handle || null, type: t, org_name: org_name || null, b2b_contact_id: b2b_contact_id || null,
        source_tag: tag, reward_tier: reward_tier || null, contact: contact || null, assigned_to: assigned_to || null,
      }).select().single()
      if (!error) { row = data; break }
      if (String(error.message).includes('duplicate') || error.code === '23505') { attempt++; tag = `${base}${attempt + 1}` }
      else return res.status(500).json({ error: error.message })
    }
    if (!row) return res.status(500).json({ error: 'Could not generate a unique source tag' })
    res.status(201).json(row)
  } catch (err) { console.error('POST /presale/ambassadors', err.message); res.status(500).json({ error: err.message }) }
})

router.put('/ambassadors/:id', requireRole('owner', 'manager'), async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const patch = {}
  for (const k of ['full_name', 'handle', 'org_name', 'reward_tier', 'contact']) if (req.body[k] !== undefined) patch[k] = req.body[k] === '' ? null : req.body[k]
  if (req.body.assigned_to !== undefined) patch.assigned_to = req.body.assigned_to || null
  if (req.body.active !== undefined) patch.active = !!req.body.active
  const { data, error } = await sb.from('presale_ambassadors').update(patch).eq('id', req.params.id).eq('studio_id', sid).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.delete('/ambassadors/:id', requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await db().from('presale_ambassadors').delete().eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

router.post('/ambassadors/:id/leads', async (req, res) => {
  try {
    const sb = db(); const sid = req.studio.id
    const campaign = await activeCampaign(sb, sid)
    const n = parseInt(req.body.lead_count)
    if (!campaign || !Number.isFinite(n) || n === 0) return res.status(400).json({ error: 'lead_count required' })
    const { data: amb } = await sb.from('presale_ambassadors').select('*').eq('id', req.params.id).eq('studio_id', sid).maybeSingle()
    if (!amb) return res.status(404).json({ error: 'Ambassador not found' })
    const key = amb.type === 'member' ? 'members' : 'commamb'
    const channel_id = await channelIdByKey(sb, campaign.id, key)
    if (!channel_id) return res.status(400).json({ error: `No ${key} channel` })
    const data = await postLeads(sb, {
      campaign_id: campaign.id, channel_id, studio_id: sid, n,
      source_tag: amb.source_tag, ambassador_id: amb.id, b2b_contact_id: amb.b2b_contact_id || null, logged_by: req.user.id,
    })
    res.status(201).json(data)
  } catch (err) { console.error('POST /presale/ambassadors/leads', err.message); res.status(500).json({ error: err.message }) }
})

// ─── Daily drivers — per-person targets with an upsert counter + 7-day strip ──
router.get('/drivers', async (req, res) => {
  try {
    const sb = db(); const sid = req.studio.id
    const campaign = await activeCampaign(sb, sid)
    if (!campaign) return res.json({ drivers: [], team: [] })
    const { data: drivers } = await sb.from('presale_daily_drivers').select('*').eq('campaign_id', campaign.id).eq('active', true).order('sort_order')
    const ids = (drivers || []).map(d => d.id)
    const today = todayInChicago()
    const since = new Date(today + 'T00:00:00Z'); since.setUTCDate(since.getUTCDate() - 6)
    const sinceStr = since.toISOString().slice(0, 10)
    const [{ data: logs }, names] = await Promise.all([
      ids.length ? sb.from('presale_driver_log').select('driver_id, logged_on, count, logged_by').in('driver_id', ids).gte('logged_on', sinceStr) : Promise.resolve({ data: [] }),
      studioNames(sb, sid),
    ])
    const dayList = []
    for (let i = 6; i >= 0; i--) { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - i); dayList.push(d.toISOString().slice(0, 10)) }
    const byDriver = {}
    for (const l of logs || []) {
      const bd = byDriver[l.driver_id] || (byDriver[l.driver_id] = { total: {}, mine: {} })
      bd.total[l.logged_on] = (bd.total[l.logged_on] || 0) + (l.count || 0)
      if (l.logged_by === req.user.id) bd.mine[l.logged_on] = (bd.mine[l.logged_on] || 0) + (l.count || 0)
    }
    res.json({
      team: names.team, today,
      drivers: (drivers || []).map(d => {
        const bd = byDriver[d.id] || { total: {}, mine: {} }
        return {
          ...d, assignee_name: d.assigned_to ? (names.map[d.assigned_to] || null) : null,
          my_today: bd.mine[today] || 0,
          strip: dayList.map(ds => ({ date: ds, count: bd.total[ds] || 0, hit: d.target > 0 && (bd.total[ds] || 0) >= d.target })),
        }
      }),
    })
  } catch (err) { console.error('GET /presale/drivers', err.message); res.status(500).json({ error: err.message }) }
})

router.post('/drivers', requireRole('owner', 'manager'), async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const campaign = await activeCampaign(sb, sid)
  if (!campaign) return res.status(400).json({ error: 'No campaign' })
  const { label, target, assigned_to, sort_order } = req.body
  if (!label) return res.status(400).json({ error: 'label required' })
  const { data, error } = await sb.from('presale_daily_drivers').insert({
    campaign_id: campaign.id, studio_id: sid, label: String(label).trim(),
    target: parseInt(target) || 0, assigned_to: assigned_to || null, sort_order: parseInt(sort_order) || 0,
  }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.put('/drivers/:id', requireRole('owner', 'manager'), async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const patch = {}
  if (req.body.label !== undefined) patch.label = String(req.body.label).trim()
  if (req.body.target !== undefined) patch.target = parseInt(req.body.target) || 0
  if (req.body.assigned_to !== undefined) patch.assigned_to = req.body.assigned_to || null
  if (req.body.active !== undefined) patch.active = !!req.body.active
  const { data, error } = await sb.from('presale_daily_drivers').update(patch).eq('id', req.params.id).eq('studio_id', sid).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.delete('/drivers/:id', requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await db().from('presale_daily_drivers').delete().eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// Upsert today's count for the current user (absolute value, not an increment).
router.post('/drivers/:id/log', async (req, res) => {
  const sb = db(); const sid = req.studio.id
  const { data: driver } = await sb.from('presale_daily_drivers').select('id').eq('id', req.params.id).eq('studio_id', sid).maybeSingle()
  if (!driver) return res.status(404).json({ error: 'Driver not found' })
  const count = Math.max(0, parseInt(req.body.count) || 0)
  const { data, error } = await sb.from('presale_driver_log').upsert(
    { driver_id: driver.id, studio_id: sid, logged_on: todayInChicago(), count, logged_by: req.user.id },
    { onConflict: 'driver_id,logged_on,logged_by' },
  ).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

module.exports = router
