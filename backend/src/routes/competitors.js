const express  = require('express')
const router   = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate    = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')
const Anthropic       = require('@anthropic-ai/sdk')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ─── GET /api/competitors ────────────────────────────────────────────────────
router.get('/', authenticate, requireStudio, async (req, res) => {
  const { data, error } = await db()
    .from('competitors')
    .select('*')
    .eq('studio_id', req.studio.id)
    .eq('is_active', true)
    .order('sort_order')
    .order('name')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── POST /api/competitors ───────────────────────────────────────────────────
router.post('/', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { data, error } = await db()
    .from('competitors')
    .insert({ ...req.body, studio_id: req.studio.id })
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── PUT /api/competitors/:id ────────────────────────────────────────────────
router.put('/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { data, error } = await db()
    .from('competitors')
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('studio_id', req.studio.id)
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── DELETE /api/competitors/:id ─────────────────────────────────────────────
router.delete('/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await db().from('competitors').delete().eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── GET /api/competitors/:id/visits ─────────────────────────────────────────
router.get('/:id/visits', authenticate, async (req, res) => {
  const { data, error } = await db()
    .from('competitor_visits')
    .select('*')
    .eq('studio_id', req.studio.id)
    .eq('competitor_id', req.params.id)
    .order('visited_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })

  // Enrich with visitor names
  const userIds = [...new Set((data || []).map(v => v.visited_by).filter(Boolean))]
  const nameMap = {}
  for (const uid of userIds) {
    const { data: u } = await db().auth.admin.getUserById(uid)
    nameMap[uid] = u?.user?.user_metadata?.full_name || u?.user?.email?.split('@')[0] || 'Team'
  }

  res.json((data || []).map(v => ({ ...v, visitor_name: nameMap[v.visited_by] || 'Team' })))
})

// ─── POST /api/competitors/:id/visits ────────────────────────────────────────
router.post('/:id/visits', authenticate, async (req, res) => {
  const { data, error } = await db()
    .from('competitor_visits')
    .insert({ ...req.body, competitor_id: req.params.id, visited_by: req.user.id })
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── POST /api/competitors/ai-refresh ────────────────────────────────────────
// Calls Claude to research each competitor for pricing/new info updates
router.post('/ai-refresh', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { data: comps, error } = await db()
    .from('competitors')
    .select('id, name, city, website, price_monthly')
    .eq('studio_id', req.studio.id)
    .eq('is_active', true)
  if (error) return res.status(500).json({ error: error.message })

  const client = new Anthropic()
  const now    = new Date().toISOString()
  const updates = []

  const prompt = `You are a competitive intelligence analyst for HOTWORX Pewaukee, WI (an infrared sauna workout studio).
Research these local fitness competitors and provide a brief current summary for each.
Focus on: current pricing, any notable recent changes, what they're currently promoting, and how they compare to HOTWORX.
Be factual and concise. Format each as JSON.

Competitors:
${comps.map(c => `- ${c.name} (${c.city}) — website: ${c.website || 'unknown'}`).join('\n')}

Return a JSON array with objects: { "name": "...", "ai_summary": "2-3 sentence current summary", "price_monthly": number_or_null, "price_notes": "any pricing detail" }
Return ONLY valid JSON, no other text.`

  try {
    const msg = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = msg.content[0].text.trim().replace(/^```json\s*/,'').replace(/\s*```$/,'')
    const results = JSON.parse(raw)

    for (const r of results) {
      const comp = comps.find(c => c.name === r.name)
      if (!comp) continue
      const patch = { ai_summary: r.ai_summary, ai_last_updated: now, updated_at: now }
      if (r.price_monthly) patch.price_monthly = r.price_monthly
      await db().from('competitors').update(patch).eq('id', comp.id)
      updates.push({ id: comp.id, name: comp.name, ...patch })
    }
    res.json({ updated: updates.length, updates })
  } catch (err) {
    console.error('[competitors/ai-refresh]', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
