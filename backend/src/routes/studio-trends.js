const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const DEFAULTS = {
  vending: 0, retail: 0, rewards: 0, refunds: 0,
  membership_cash: 0, net_eft: 0, eft_increase: 0, eft_decrease: 0,
  net_eft_increase: 0, in_the_bank: 0, itb_goal: 0, expenses: 0, net_income: 0,
  leads: 0, red_appts_booked: 0, red_appts_held: 0,
  new_members: 0, cancellations: 0, total_member_count: 0, sweat_elite_pct: 0,
  instagram_followers: 0, facebook_followers: 0, tiktok_followers: 0,
  five_star_reviews: 0, calls_made: 0, texts_made: 0, manager_notes: '',
}

// GET /api/studio-trends?startYear=&startMonth=&endYear=&endMonth=
// Returns all months in the range (defaults to last 24 months)
router.get('/', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  let { startYear, startMonth, endYear, endMonth } = req.query

  if (!endYear || !endMonth) {
    const now = new Date()
    endYear  = now.getFullYear()
    endMonth = now.getMonth() + 1
  }
  if (!startYear || !startMonth) {
    // Default: 24 months back
    const start = new Date(Number(endYear), Number(endMonth) - 1 - 23, 1)
    startYear  = start.getFullYear()
    startMonth = start.getMonth() + 1
  }

  // Build a list of all month/year pairs in range
  const pairs = []
  let y = Number(startYear), m = Number(startMonth)
  const ey = Number(endYear), em = Number(endMonth)
  while (y < ey || (y === ey && m <= em)) {
    pairs.push({ month: m, year: y })
    m++; if (m > 12) { m = 1; y++ }
  }

  const { data, error } = await db()
    .from('studio_trends')
    .select('*')
    .eq('studio_id', req.studio.id)
    .gte('year', startYear)
    .lte('year', endYear)
    .order('year').order('month')

  if (error) return res.status(500).json({ error: error.message })

  const dataMap = {}
  for (const row of data) dataMap[`${row.year}-${row.month}`] = row

  // Fill in missing months with defaults
  const result = pairs.map(({ month, year }) =>
    dataMap[`${year}-${month}`] || { ...DEFAULTS, month, year, id: null }
  )

  res.json(result)
})

// GET /api/studio-trends/:year/:month — single month
router.get('/:year/:month', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { year, month } = req.params
  const { data, error } = await db()
    .from('studio_trends')
    .select('*')
    .eq('studio_id', req.studio.id)
    .eq('month', month)
    .eq('year', year)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data || { ...DEFAULTS, month: Number(month), year: Number(year) })
})

// PUT /api/studio-trends — upsert a month's data
router.put('/', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { month, year, ...fields } = req.body
  if (!month || !year) return res.status(400).json({ error: 'month and year required' })

  const { data, error } = await db()
    .from('studio_trends')
    .upsert({
      month,
      year,
      studio_id: req.studio.id,
      ...fields,
      updated_by: req.user.id,
      updated_at: new Date().toISOString()
    }, { onConflict: 'studio_id, month, year' })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

module.exports = router
