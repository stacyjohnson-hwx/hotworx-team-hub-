const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')

// PUBLIC, NO AUTH. Only returns client-safe fields for a studio's calendar.
// Never expose internal fields (notes, goal, marketing_plan, supplies, b2b internals).
const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const pad = (n) => String(n).padStart(2, '0')

// Normalize a stored social handle into a full Instagram URL.
// Accepts "@handle", "handle", "instagram.com/handle", or a full URL.
function instagramUrl(handle) {
  if (!handle) return null
  let h = String(handle).trim()
  if (/^https?:\/\//i.test(h)) return h
  if (/instagram\.com/i.test(h)) return 'https://' + h.replace(/^\/+/, '')
  h = h.replace(/^@/, '').replace(/\s+/g, '')
  if (!h) return null
  return `https://instagram.com/${h}`
}

// GET /api/public/calendar/:studioId?month=&year=
router.get('/calendar/:studioId', async (req, res) => {
  const { studioId } = req.params
  const now = new Date()
  const year = Number(req.query.year) || now.getFullYear()
  const month = Number(req.query.month) || (now.getMonth() + 1)
  const lastDay = new Date(year, month, 0).getDate()
  const monthStart = `${year}-${pad(month)}-01`
  const monthEnd = `${year}-${pad(month)}-${pad(lastDay)}`

  const sb = db()
  const { data: studio } = await sb.from('studios').select('name, code').eq('id', studioId).maybeSingle()
  if (!studio) return res.status(404).json({ error: 'Studio not found' })

  // Client-safe columns only. Filter by actual date; exclude Team events.
  const { data: rows, error } = await sb.from('events')
    .select('id, title, description, event_type, start_date, end_date, start_time, end_time, location, registration_url')
    .eq('studio_id', studioId)
    .gte('start_date', monthStart).lte('start_date', monthEnd)
    .neq('event_type', 'team')
    .order('start_date')
  if (error) return res.status(500).json({ error: error.message })

  const all = rows || []
  const bomEvent = all.find(e => e.event_type === 'business_of_the_month') || null
  const events = all.filter(e => e.event_type !== 'business_of_the_month')

  // Business of the Month: pull the linked business (name + logo + website + location + socials).
  let businessOfMonth = null
  if (bomEvent) {
    const { data: links } = await sb
      .from('event_b2b_contacts')
      .select('b2b_contacts(business_name, logo_url, website, address, social_handle)')
      .eq('event_id', bomEvent.id).limit(1)
    const c = links && links[0] && links[0].b2b_contacts
    businessOfMonth = {
      title: bomEvent.title,
      description: bomEvent.description || null,
      business_name: c?.business_name || bomEvent.title,
      logo_url: c?.logo_url || null,
      website: c?.website || null,
      location: c?.address || null,
      instagram: instagramUrl(c?.social_handle),
    }
  }

  res.json({ studio_name: studio.name, year, month, events, business_of_month: businessOfMonth })
})

module.exports = router
