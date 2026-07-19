const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')
const authenticate = require('../middleware/authMiddleware')
const { discoverTrends, RECENCY_DAYS } = require('../jobs/trendDiscoveryCron')
const { hasAnthropicKey } = require('../services/anthropic')

const supabase = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const PLATFORMS = ['instagram', 'tiktok']
const KINDS = ['hashtag', 'account', 'keyword']

// ─── GET /api/social/trends ──────────────────────────────────────────────────
// Ranked recent trend posts + their teardown, shaped to match ContentRow.
router.get('/', authenticate, requireStudio, async (req, res) => {
  const db = supabase()
  const since = new Date(Date.now() - RECENCY_DAYS * 86400000).toISOString()
  const { data: posts, error } = await db.from('trend_posts')
    .select('*').eq('studio_id', req.studio.id).gte('discovered_at', since)
    .order('virality_score', { ascending: false }).limit(40)
  if (error) return res.status(500).json({ error: error.message })

  const ids = (posts || []).map(p => p.id)
  const { data: tds } = ids.length
    ? await db.from('trend_teardowns').select('*').in('trend_post_id', ids)
    : { data: [] }
  const tdBy = Object.fromEntries((tds || []).map(t => [t.trend_post_id, t]))

  res.json((posts || []).map(p => {
    const t = tdBy[p.id]
    return {
      id: p.id, platform: p.platform, caption: p.caption, thumb_url: p.thumb_url,
      permalink: p.url, posted_at: p.posted_at,
      views: p.views, likes: p.likes, comments: p.comments, saves: p.saves, shares: p.shares,
      author_handle: p.author_handle, author_followers: p.author_followers, virality_score: p.virality_score,
      teardown: (t && t.status === 'ok') ? {
        hook: t.hook, value: t.value, cta: t.cta, why: t.why_it_works,
        format: t.format, trending_sound: t.trending_sound, content_pillar: t.content_pillar,
        steal_this: t.steal_this, effort: t.effort,
      } : null,
    }
  }))
})

// ─── POST /api/social/trends/discover ────────────────────────────────────────
// On-demand: scrape sources, rank, store, and (if the AI key is set) generate
// teardowns. Returns per-source diagnostics.
router.post('/discover', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const result = await discoverTrends(req.studio.id, { withTeardowns: hasAnthropicKey() })
    res.json({ ...result, anthropic: hasAnthropicKey() })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── Sources CRUD ────────────────────────────────────────────────────────────
router.get('/sources', authenticate, requireStudio, async (req, res) => {
  const { data, error } = await supabase().from('trend_sources')
    .select('*').eq('studio_id', req.studio.id).order('platform').order('query')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

router.post('/sources', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { platform, kind, active } = req.body
  if (!PLATFORMS.includes(platform)) return res.status(400).json({ error: 'valid platform required (instagram|tiktok)' })
  if (!KINDS.includes(kind)) return res.status(400).json({ error: 'valid kind required (hashtag|account|keyword)' })
  const query = String(req.body.query || '').trim().replace(/^[#@]/, '')
  if (!query) return res.status(400).json({ error: 'query required' })
  const { data, error } = await supabase().from('trend_sources').upsert({
    studio_id: req.studio.id, platform, kind, query,
    ...(active !== undefined ? { active: !!active } : {}),
  }, { onConflict: 'studio_id,platform,kind,query' }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.delete('/sources/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await supabase().from('trend_sources')
    .delete().eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

module.exports = router
