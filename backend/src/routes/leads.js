const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const DAILY_GOAL  = Number(process.env.LEAD_DAILY_GOAL)   || 5
const MONTHLY_GOAL = Number(process.env.LEAD_MONTHLY_GOAL) || 145

// GET /api/leads?month=&year=
// Returns all entries for the month plus the last 7 days and goals
router.get('/', authenticate, async (req, res) => {
  const { month, year } = req.query
  if (!month || !year) return res.status(400).json({ error: 'month and year required' })

  // Month range
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

  // Last 7 days (for sparkline — may extend before month start)
  const today = new Date()
  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
  const sparkStart = sevenDaysAgo.toLocaleDateString('en-CA')
  const sparkEnd   = today.toLocaleDateString('en-CA')

  const queryStart = sparkStart < monthStart ? sparkStart : monthStart

  const { data, error } = await db()
    .from('leads')
    .select('*')
    .gte('lead_date', queryStart)
    .lte('lead_date', monthEnd > sparkEnd ? monthEnd : sparkEnd)
    .order('lead_date')

  if (error) return res.status(500).json({ error: error.message })

  const monthEntries = data.filter(r => r.lead_date >= monthStart && r.lead_date <= monthEnd)
  const monthTotal   = monthEntries.reduce((s, r) => s + r.count, 0)

  // Build 7-day sparkline array
  const sparkline = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dateStr = d.toLocaleDateString('en-CA')
    const entry = data.find(r => r.lead_date === dateStr)
    sparkline.push({ date: dateStr, count: entry?.count || 0 })
  }

  res.json({
    entries:      monthEntries,
    month_total:  monthTotal,
    daily_goal:   DAILY_GOAL,
    monthly_goal: MONTHLY_GOAL,
    sparkline,
  })
})

// PUT /api/leads — upsert today's lead entry
router.put('/', authenticate, async (req, res) => {
  const today = new Date().toLocaleDateString('en-CA')
  const { count, notes, date } = req.body
  const lead_date = date || today

  if (count === undefined || count === null) return res.status(400).json({ error: 'count is required' })

  const { data, error } = await db()
    .from('leads')
    .upsert({
      lead_date,
      count: Number(count),
      notes: notes || null,
      entered_by: req.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'lead_date' })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

module.exports = router
