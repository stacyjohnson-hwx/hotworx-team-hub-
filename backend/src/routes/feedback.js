const express  = require('express')
const router   = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate     = require('../middleware/authMiddleware')

const supabase = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// POST /api/feedback — submit or update a rating
router.post('/', authenticate, async (req, res) => {
  const { item_type, item_id, item_title, rating, notes, month, year } = req.body
  if (!item_type || !item_id || !rating) {
    return res.status(400).json({ error: 'item_type, item_id, and rating are required' })
  }

  try {
    // Upsert: one rating per user per item
    const { data, error } = await supabase()
      .from('feedback')
      .upsert({
        item_type, item_id,
        item_title: item_title || null,
        rating: parseInt(rating),
        notes: notes || null,
        month: month ? parseInt(month) : null,
        year:  year  ? parseInt(year)  : null,
        rated_by: req.user.id,
      }, { onConflict: 'item_id,rated_by' })
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    console.error('POST /feedback', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/feedback?item_type=event&item_id=xxx
// Also supports ?year=2026&month=5 for bulk fetching all feedback in a period
router.get('/', authenticate, async (req, res) => {
  const { item_type, item_id, year, month } = req.query
  try {
    let q = supabase().from('feedback').select('*').order('created_at', { ascending: false })
    if (item_type) q = q.eq('item_type', item_type)
    if (item_id)   q = q.eq('item_id', item_id)
    if (year)      q = q.eq('year', parseInt(year))
    if (month)     q = q.eq('month', parseInt(month))

    const { data, error } = await q
    if (error) throw error
    res.json(data)
  } catch (err) {
    console.error('GET /feedback', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
