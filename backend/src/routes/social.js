const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')
const authenticate = require('../middleware/authMiddleware')
const { todayInChicago } = require('../utils/dates')
const { scrapeChannel } = require('../services/socialConnectors')

const supabase = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const PLATFORMS = ['instagram', 'facebook', 'tiktok', 'google']

// PRD §7 — "best performing" rank score. Rewards intent-to-act over cheap reach.
// One editable place so weights can be tuned without touching query logic.
const RANK_WEIGHTS = { saves: 3, shares: 2, comments: 1.5, follows_driven: 5, views: 0.01 }
const rankScore = (m = {}) =>
  (m.saves || 0) * RANK_WEIGHTS.saves +
  (m.shares || 0) * RANK_WEIGHTS.shares +
  (m.comments || 0) * RANK_WEIGHTS.comments +
  (m.follows_driven || 0) * RANK_WEIGHTS.follows_driven +
  (m.views || 0) * RANK_WEIGHTS.views

// delta = latest value − value from the snapshot on/just-before (latest_date − N days).
// No history that far back → null (render as "—", never a fabricated 0). PRD §5.
function deltaFor(snaps, field, days) {
  if (!snaps.length) return null
  const latest = snaps[0]
  const target = new Date(latest.snapshot_date + 'T00:00:00')
  target.setDate(target.getDate() - days)
  const targetStr = target.toISOString().split('T')[0]
  const prior = snaps.find(s => s.snapshot_date <= targetStr) // snaps are date-desc
  if (!prior || latest[field] == null || prior[field] == null) return null
  return latest[field] - prior[field]
}

// ─── GET /api/social/dashboard ───────────────────────────────────────────────
// Reads ONLY from our DB — never hits a platform API at view time (PRD §3).
router.get('/dashboard', authenticate, requireStudio, async (req, res) => {
  try {
    const db = supabase()
    const sid = req.studio.id

    const { data: channels, error: chErr } = await db
      .from('social_channels').select('*').eq('studio_id', sid).eq('active', true)
    if (chErr) throw new Error(chErr.message)

    const chIds = (channels || []).map(c => c.id)
    const [{ data: snaps }, { data: posts }] = await Promise.all([
      chIds.length ? db.from('channel_snapshots').select('*').in('channel_id', chIds).order('snapshot_date', { ascending: false }) : { data: [] },
      chIds.length ? db.from('content_posts').select('*').in('channel_id', chIds) : { data: [] },
    ])

    const snapsByCh = {}
    for (const s of snaps || []) (snapsByCh[s.channel_id] = snapsByCh[s.channel_id] || []).push(s)

    const channelCards = (channels || []).map(c => {
      const cs = snapsByCh[c.id] || []           // already date-desc
      const latest = cs[0] || {}
      const isGoogle = c.platform === 'google'
      const field = isGoogle ? 'review_count' : 'followers'
      return {
        key: c.platform, platform: c.platform, handle: c.handle,
        followers: isGoogle ? null : (latest.followers ?? null),
        rating: isGoogle ? (latest.rating ?? null) : null,
        reviews: isGoogle ? (latest.review_count ?? null) : null,
        delta7: deltaFor(cs, field, 7),
        delta30: deltaFor(cs, field, 30),
        has_data: cs.length > 0,
      }
    })

    // Best-performing feed: posts from the last 14 days, ranked by rank_score.
    let topContent = []
    const postIds = (posts || []).map(p => p.id)
    if (postIds.length) {
      const [{ data: metrics }, { data: teardowns }] = await Promise.all([
        db.from('post_metrics').select('*').in('post_id', postIds),
        db.from('post_teardowns').select('*').in('post_id', postIds),
      ])
      const mBy = Object.fromEntries((metrics || []).map(m => [m.post_id, m]))
      const tBy = Object.fromEntries((teardowns || []).map(t => [t.post_id, t]))
      const cutoff = Date.now() - 14 * 86400000
      topContent = (posts || [])
        .filter(p => !p.posted_at || new Date(p.posted_at).getTime() >= cutoff)
        .map(p => {
          const m = mBy[p.id] || {}
          const t = tBy[p.id] || null
          return {
            id: p.id, platform: p.platform, caption: p.caption, media_type: p.media_type,
            permalink: p.permalink, thumb_url: p.thumb_url, posted_at: p.posted_at,
            views: m.views ?? 0, likes: m.likes ?? 0, comments: m.comments ?? 0,
            saves: m.saves ?? 0, shares: m.shares ?? 0,
            follows_driven: m.follows_driven ?? null, is_estimate: m.is_estimate !== false,
            rank_score: Math.round(rankScore(m)),
            teardown: t ? { hook: t.hook, value: t.value, cta: t.cta, why: t.why } : null,
          }
        })
        .sort((a, b) => b.rank_score - a.rank_score)
        .slice(0, 12)
    }

    const updatedAt = (snaps || []).reduce((max, s) => s.captured_at > max ? s.captured_at : max, '')
    res.json({
      studio: req.studio.name || null,
      updated_at: updatedAt || null,
      channels: channelCards,
      top_content: topContent,
      rank_weights: RANK_WEIGHTS,
    })
  } catch (err) {
    console.error('GET /social/dashboard', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── Channel registration (so a studio can add its handles before/after the
//     connectors are provisioned) ──────────────────────────────────────────────
router.get('/channels', authenticate, requireStudio, async (req, res) => {
  const { data, error } = await supabase().from('social_channels')
    .select('*').eq('studio_id', req.studio.id).order('platform')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

router.post('/channels', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { platform, handle, external_id, active } = req.body
  if (!PLATFORMS.includes(platform)) return res.status(400).json({ error: 'valid platform is required' })
  const { data, error } = await supabase().from('social_channels').upsert({
    studio_id: req.studio.id, platform, handle: handle || null,
    external_id: external_id || null, ...(active !== undefined ? { active: !!active } : {}),
  }, { onConflict: 'studio_id,platform' }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.delete('/channels/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await supabase().from('social_channels')
    .delete().eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── POST /api/social/manual-entry ───────────────────────────────────────────
// No-API path: register a channel + record today's numbers by hand. Lets the
// dashboard work (and start building trend history) with zero platform setup.
// Upserts the channel and today's snapshot; deltas compute automatically as more
// days are entered.
router.post('/manual-entry', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const db = supabase()
  const { platform, handle, followers, rating, review_count } = req.body
  if (!PLATFORMS.includes(platform)) return res.status(400).json({ error: 'valid platform is required' })

  const { data: ch, error: chErr } = await db.from('social_channels').upsert({
    studio_id: req.studio.id, platform, handle: handle || null,
  }, { onConflict: 'studio_id,platform' }).select().single()
  if (chErr) return res.status(500).json({ error: chErr.message })

  const num = (v) => (v === undefined || v === null || v === '') ? null : Number(v)
  const snap = { channel_id: ch.id, snapshot_date: todayInChicago(), captured_at: new Date().toISOString() }
  if (platform === 'google') { snap.rating = num(rating); snap.review_count = num(review_count) }
  else { snap.followers = num(followers) }

  // Only write a snapshot if an actual number was provided (don't stamp an empty day).
  const hasValue = snap.followers != null || snap.rating != null || snap.review_count != null
  if (hasValue) {
    const { error: snapErr } = await db.from('channel_snapshots')
      .upsert(snap, { onConflict: 'channel_id,snapshot_date' })
    if (snapErr) return res.status(500).json({ error: snapErr.message })
  }
  res.json({ channel: ch, snapshot_written: hasValue })
})

// ─── POST /api/social/sync-now ───────────────────────────────────────────────
// Scrape every active channel via Apify right now, write today's snapshots, and
// report per-channel results (incl. field names when a number can't be read) so
// we can verify the connection without waiting for the nightly job.
router.post('/sync-now', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const db = supabase()
  const today = todayInChicago()
  const { data: channels } = await db.from('social_channels')
    .select('*').eq('studio_id', req.studio.id).eq('active', true)

  const results = []
  for (const ch of channels || []) {
    const r = await scrapeChannel(ch)
    let wrote = false
    if (r.data) {
      const snap = { channel_id: ch.id, snapshot_date: today, captured_at: new Date().toISOString(), ...r.data }
      const { error } = await db.from('channel_snapshots').upsert(snap, { onConflict: 'channel_id,snapshot_date' })
      wrote = !error
    }
    results.push({
      platform: ch.platform,
      status: r.error ? 'error' : r.data ? 'ok' : 'no_number',
      value: r.data || null,
      scraped_items: r.count ?? 0,
      field_names: r.data ? undefined : r.rawKeys,   // only surface keys when we couldn't read a number
      error: r.error || null,
      wrote,
    })
  }
  res.json({ ran_at: new Date().toISOString(), results })
})

module.exports = router
