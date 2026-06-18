const express = require('express')
const router  = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate    = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')

const supabase = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Fetch b2b contacts linked to an event and attach as event.b2b_partners
async function attachPartners(events) {
  if (!events.length) return events
  const ids = events.map(e => e.id)
  const { data } = await supabase()
    .from('event_b2b_contacts')
    .select('event_id, b2b_contacts(id, business_name, logo_url, website)')
    .in('event_id', ids)
  const map = {}
  for (const row of data || []) {
    if (!map[row.event_id]) map[row.event_id] = []
    if (row.b2b_contacts) map[row.event_id].push(row.b2b_contacts)
  }
  return events.map(e => ({ ...e, b2b_partners: map[e.id] || [] }))
}

// Replace all b2b links for an event
async function syncPartners(eventId, contactIds = []) {
  await supabase().from('event_b2b_contacts').delete().eq('event_id', eventId)
  if (!contactIds.length) return
  const rows = contactIds.map(cid => ({ event_id: eventId, b2b_contact_id: cid }))
  await supabase().from('event_b2b_contacts').insert(rows)
}

// ─── EVENTS ──────────────────────────────────────────────────────────────────

// GET /api/events?month=5&year=2026  — or ?startDate=2026-05-01&endDate=2026-05-31 for range
router.get('/', authenticate, requireStudio, async (req, res) => {
  const { month, year, startDate, endDate } = req.query
  try {
    let q = supabase()
      .from('events')
      .select('*')
      .eq('studio_id', req.studio.id)
      .order('start_date', { ascending: true })

    if (startDate && endDate) {
      // Events whose start_date is on or before the range end
      // (end_date or start_date must be >= range start — filtered client-side below)
      q = q.lte('start_date', endDate)
    } else {
      if (month) q = q.eq('month', parseInt(month))
      if (year)  q = q.eq('year',  parseInt(year))
    }

    const { data, error } = await q
    if (error) throw error

    let events = data || []
    if (startDate && endDate) {
      // Keep only events whose date range overlaps with [startDate, endDate]
      events = events.filter(e => (e.end_date || e.start_date) >= startDate)
    }

    res.json(await attachPartners(events))
  } catch (err) {
    console.error('GET /events', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/events  — owner/manager only
// body.b2b_contact_ids: string[]  (array of contact UUIDs)
router.post('/', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const {
    title, description, event_type, start_date, end_date,
    start_time, end_time, location, notes, month, year,
    goal, marketing_plan, supplies,
    b2b_contact_ids = [],
  } = req.body

  if (!title || !start_date || !month || !year) {
    return res.status(400).json({ error: 'title, start_date, month, and year are required' })
  }

  try {
    const { data, error } = await supabase().from('events').insert([{
      title, description, event_type: event_type || 'in-store',
      start_date, end_date: end_date || null,
      start_time: start_time || null, end_time: end_time || null,
      location, notes, month: parseInt(month), year: parseInt(year),
      goal: goal || null, marketing_plan: marketing_plan || null,
      supplies: Array.isArray(supplies) ? supplies : [],
      created_by: req.user.id,
      studio_id: req.studio.id,
    }]).select().single()
    if (error) throw error
    await syncPartners(data.id, b2b_contact_ids)
    const [enriched] = await attachPartners([data])
    res.status(201).json(enriched)
  } catch (err) {
    console.error('POST /events', err)
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/events/:id  — owner/manager only
router.put('/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const {
    title, description, event_type, start_date, end_date,
    start_time, end_time, location, notes, month, year,
    goal, marketing_plan, supplies,
    b2b_contact_ids = [],
  } = req.body

  try {
    const { data, error } = await supabase().from('events').update({
      title, description, event_type, start_date,
      end_date: end_date || null,
      start_time: start_time || null, end_time: end_time || null,
      location, notes, month: parseInt(month), year: parseInt(year),
      goal: goal ?? null, marketing_plan: marketing_plan ?? null,
      ...(supplies !== undefined ? { supplies: Array.isArray(supplies) ? supplies : [] } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id).select().single()
    if (error) throw error
    await syncPartners(req.params.id, b2b_contact_ids)
    const [enriched] = await attachPartners([data])
    res.json(enriched)
  } catch (err) {
    console.error('PUT /events/:id', err)
    res.status(500).json({ error: err.message })
  }
})

// PATCH supplies only — used to tick off the supplies checklist without
// resending the whole event (owner/manager only).
router.put('/:id/supplies', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const supplies = Array.isArray(req.body?.supplies) ? req.body.supplies : []
  try {
    const { data, error } = await supabase().from('events')
      .update({ supplies, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('studio_id', req.studio.id).select().single()
    if (error) throw error
    res.json(data)
  } catch (err) {
    console.error('PUT /events/:id/supplies', err)
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/events/:id  — owner/manager only
router.delete('/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { error } = await supabase().from('events').delete().eq('id', req.params.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /events/:id', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── PROMOTIONS ───────────────────────────────────────────────────────────────

router.get('/promotions', authenticate, requireStudio, async (req, res) => {
  const { month, year, startDate, endDate } = req.query
  try {
    let mainQ = supabase().from('promotions').select('*').eq('studio_id', req.studio.id)

    if (startDate && endDate) {
      // Date-range mode (schedule page): no active filter — show every promo whose
      // dates overlap the visible range regardless of the active flag.
      mainQ = mainQ.lte('start_date', endDate)
    } else {
      // Month/year mode (Events page): respect the active flag
      mainQ = mainQ.eq('active', true)
      if (month) mainQ = mainQ.eq('month', parseInt(month))
      if (year)  mainQ = mainQ.eq('year',  parseInt(year))
    }

    // Ongoing promos: always include when in date-range mode; respect active in month/year mode
    const ongoingQ = startDate && endDate
      ? supabase().from('promotions').select('*').eq('studio_id', req.studio.id).eq('ongoing', true)
      : supabase().from('promotions').select('*').eq('studio_id', req.studio.id).eq('ongoing', true).eq('active', true)
    const [{ data: mainData, error: e1 }, { data: ongoingData, error: e2 }] = await Promise.all([mainQ, ongoingQ])
    if (e1) throw e1
    if (e2) throw e2

    let merged = [...(ongoingData || []), ...(mainData || [])]

    // Client-side filter: promo must overlap the date range
    if (startDate && endDate) {
      merged = merged.filter(p => {
        if (!p.start_date) return p.ongoing // ongoing promos without dates always show
        const pEnd = p.end_date || p.start_date
        return p.start_date <= endDate && pEnd >= startDate
      })
    }

    const seen = new Set()
    res.json(merged.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true }))
  } catch (err) {
    console.error('GET /promotions', err)
    res.status(500).json({ error: err.message })
  }
})

router.post('/promotions', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { title, description, promo_type, discount_value, discount_unit, start_date, end_date, ongoing, active, notes, month, year } = req.body
  if (!title || !month || !year) return res.status(400).json({ error: 'title, month, and year are required' })
  try {
    const { data, error } = await supabase().from('promotions').insert([{
      title, description, promo_type: promo_type || 'discount',
      discount_value: discount_value || null, discount_unit: discount_unit || '%',
      start_date: start_date || null, end_date: end_date || null,
      ongoing: ongoing ?? false, active: active ?? true,
      notes, month: parseInt(month), year: parseInt(year), created_by: req.user.id,
      studio_id: req.studio.id,
    }]).select().single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    console.error('POST /promotions', err)
    res.status(500).json({ error: err.message })
  }
})

router.put('/promotions/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { title, description, promo_type, discount_value, discount_unit, start_date, end_date, ongoing, active, notes, month, year } = req.body
  try {
    const { data, error } = await supabase().from('promotions').update({
      title, description, promo_type, discount_value: discount_value || null, discount_unit,
      start_date: start_date || null, end_date: end_date || null,
      ongoing: ongoing ?? false, active: active ?? true,
      notes, month: parseInt(month), year: parseInt(year), updated_at: new Date().toISOString(),
    }).eq('id', req.params.id).select().single()
    if (error) throw error
    res.json(data)
  } catch (err) {
    console.error('PUT /promotions/:id', err)
    res.status(500).json({ error: err.message })
  }
})

router.delete('/promotions/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { error } = await supabase().from('promotions').delete().eq('id', req.params.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /promotions/:id', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── B2B DISCOUNTS ────────────────────────────────────────────────────────────

router.get('/b2b-discounts', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase()
      .from('b2b_contacts')
      .select('id, business_name, contact_name, phone, email, industry, discount_desc, discount_ongoing, status')
      .not('discount_desc', 'is', null)
      .neq('discount_desc', '')
      .order('business_name', { ascending: true })
    if (error) throw error
    res.json(data)
  } catch (err) {
    console.error('GET /b2b-discounts', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
