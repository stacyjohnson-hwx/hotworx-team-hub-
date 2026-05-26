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

// ─── Signal endpoints (thumbs up/down for AI advisor) ────────────────────────

// POST /api/feedback/signal — cast or flip a thumbs signal
router.post('/signal', authenticate, async (req, res) => {
  const { entity_type, entity_id, entity_label, signal, note } = req.body
  if (!entity_type || !entity_id || ![1, -1].includes(Number(signal))) {
    return res.status(400).json({ error: 'entity_type, entity_id, and signal (1 or -1) are required' })
  }
  try {
    const { data, error } = await supabase()
      .from('feedback_signals')
      .upsert({
        entity_type,
        entity_id:    String(entity_id),
        entity_label: entity_label || null,
        signal:       Number(signal),
        note:         note || null,
        rated_by:     req.user.id,
      }, { onConflict: 'entity_type,entity_id,rated_by' })
      .select()
      .single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    console.error('POST /feedback/signal', err)
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/feedback/signal — remove your signal (neutral)
router.delete('/signal', authenticate, async (req, res) => {
  const { entity_type, entity_id } = req.body
  try {
    const { error } = await supabase()
      .from('feedback_signals')
      .delete()
      .eq('entity_type', entity_type)
      .eq('entity_id', String(entity_id))
      .eq('rated_by', req.user.id)
    if (error) throw error
    res.status(204).end()
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/feedback/signals?entity_type=event&ids=id1,id2,id3
// Returns summary { entity_id: { up, down, mine } } for a batch of IDs
router.get('/signals', authenticate, async (req, res) => {
  const { entity_type, ids } = req.query
  if (!entity_type) return res.status(400).json({ error: 'entity_type required' })

  try {
    let q = supabase()
      .from('feedback_signals')
      .select('entity_id, signal, rated_by')
      .eq('entity_type', entity_type)

    if (ids) q = q.in('entity_id', ids.split(',').map(s => s.trim()))

    const { data, error } = await q
    if (error) throw error

    // Summarise into { [entity_id]: { up, down, mine } }
    const summary = {}
    for (const row of data || []) {
      if (!summary[row.entity_id]) summary[row.entity_id] = { up: 0, down: 0, mine: null }
      if (row.signal === 1)  summary[row.entity_id].up++
      if (row.signal === -1) summary[row.entity_id].down++
      if (row.rated_by === req.user.id) summary[row.entity_id].mine = row.signal
    }
    res.json(summary)
  } catch (err) {
    console.error('GET /feedback/signals', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
