const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')
const authenticate = require('../middleware/authMiddleware')
const { todayInChicago } = require('../utils/dates')
const { scrapeChannel } = require('../services/socialConnectors')
const { pushSocialToTrends } = require('../services/socialToTrends')
const { syncOwnPosts } = require('../services/ownPosts')
const { syncGoogleReviews } = require('../services/googleReviews')
const { generateCoachReport } = require('../services/coachReport')

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
      const cutoff = Date.now() - 30 * 86400000
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

  const results = await Promise.all((channels || []).map(async (ch) => {
    const r = await scrapeChannel(ch)
    let wrote = false
    if (r.data) {
      const snap = { channel_id: ch.id, snapshot_date: today, captured_at: new Date().toISOString(), ...r.data }
      const { error } = await db.from('channel_snapshots').upsert(snap, { onConflict: 'channel_id,snapshot_date' })
      wrote = !error
    }
    return {
      platform: ch.platform,
      status: r.error ? 'error' : r.data ? 'ok' : 'no_number',
      value: r.data || null,
      scraped_items: r.count ?? 0,
      field_names: r.data ? undefined : r.rawKeys,   // only surface keys when we couldn't read a number
      error: r.error || null,
      wrote,
    }
  }))

  // Push the scraped counts onto this month's Studio Trends row too.
  const TREND_FIELD = { instagram: 'instagram_followers', facebook: 'facebook_followers', tiktok: 'tiktok_followers' }
  const trendVals = {}
  for (const r of results) {
    if (r.status !== 'ok') continue
    if (TREND_FIELD[r.platform] && r.value?.followers != null) trendVals[TREND_FIELD[r.platform]] = r.value.followers
    else if (r.platform === 'google' && r.value?.review_count != null) trendVals.five_star_reviews = r.value.review_count
  }
  const studio_trends = await pushSocialToTrends(db, req.studio.id, trendVals)

  // Also refresh the studio's own top posts (best-performing feed) + teardowns.
  let posts = null
  try { posts = await syncOwnPosts(db, req.studio.id) } catch (e) { posts = { error: e.message } }

  // And pull the actual Google reviews + refresh the AI theme summary (if a
  // google channel exists). Best-effort — never fails the whole sync.
  let reviews = null
  if ((channels || []).some(c => c.platform === 'google')) {
    try { reviews = await syncGoogleReviews(db, req.studio.id) } catch (e) { reviews = { status: 'error', error: e.message } }
  }

  res.json({ ran_at: new Date().toISOString(), results, studio_trends, posts, reviews })
})

// ─── GET /api/social/channel/:platform ───────────────────────────────────────
// Per-channel deep-dive: followers/rating time-series (for charts) + computed
// best-practice stats + that channel's top posts. For google: the actual reviews,
// star distribution, response rate, review velocity, and the AI theme summary.
// Reads ONLY from our DB (never scrapes at view time).
router.get('/channel/:platform', authenticate, requireStudio, async (req, res) => {
  try {
    const db = supabase()
    const sid = req.studio.id
    const platform = req.params.platform
    if (!PLATFORMS.includes(platform)) return res.status(400).json({ error: 'invalid platform' })

    const { data: channels } = await db.from('social_channels')
      .select('*').eq('studio_id', sid).eq('platform', platform)
    const ch = channels?.[0]
    if (!ch) return res.json({ platform, exists: false })

    // Snapshots ascending for charting; a reversed (desc) copy for deltaFor.
    const { data: snapsAsc } = await db.from('channel_snapshots')
      .select('snapshot_date, followers, rating, review_count')
      .eq('channel_id', ch.id).order('snapshot_date', { ascending: true })
    const snaps = snapsAsc || []
    const snapsDesc = [...snaps].reverse()
    const latest = snaps.length ? snaps[snaps.length - 1] : {}

    if (platform === 'google') {
      const [{ data: reviews }, { data: insights }] = await Promise.all([
        db.from('google_reviews').select('*').eq('studio_id', sid)
          .order('review_date', { ascending: false, nullsFirst: false }).limit(60),
        db.from('google_review_insights').select('*').eq('studio_id', sid).maybeSingle(),
      ])
      const rv = reviews || []
      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      let responded = 0
      for (const r of rv) { if (r.rating >= 1 && r.rating <= 5) distribution[r.rating]++; if (r.owner_response) responded++ }
      const since30 = Date.now() - 30 * 86400000
      const velocity30 = rv.filter(r => r.review_date && new Date(r.review_date).getTime() >= since30).length
      return res.json({
        platform, exists: true, handle: ch.handle,
        snapshots: snaps,
        rating: latest.rating ?? null,
        review_count: latest.review_count ?? null,
        delta30: deltaFor(snapsDesc, 'review_count', 30),
        reviews: rv.map(r => ({
          id: r.id, author_name: r.author_name, rating: r.rating, text: r.text,
          review_date: r.review_date, owner_response: r.owner_response,
        })),
        distribution,
        response_rate: rv.length ? Math.round((responded / rv.length) * 100) : null,
        velocity_30d: velocity30,
        insights: insights || null,
      })
    }

    // Social platform: stats from this channel's posts + follower snapshots.
    const { data: posts } = await db.from('content_posts').select('*').eq('channel_id', ch.id)
    const postIds = (posts || []).map(p => p.id)
    const [{ data: metrics }, { data: teardowns }] = await Promise.all([
      postIds.length ? db.from('post_metrics').select('*').in('post_id', postIds) : Promise.resolve({ data: [] }),
      postIds.length ? db.from('post_teardowns').select('*').in('post_id', postIds) : Promise.resolve({ data: [] }),
    ])
    const mBy = Object.fromEntries((metrics || []).map(m => [m.post_id, m]))
    const tBy = Object.fromEntries((teardowns || []).map(t => [t.post_id, t]))
    const followers = latest.followers ?? null

    const cutoff = Date.now() - 30 * 86400000
    const withM = (posts || [])
      .filter(p => !p.posted_at || new Date(p.posted_at).getTime() >= cutoff)
      .map(p => ({ p, m: mBy[p.id] || {} }))
    const n = withM.length
    const sum = (f) => withM.reduce((s, x) => s + (x.m[f] || 0), 0)
    const avgViews = n ? Math.round(sum('views') / n) : null
    const avgLikes = n ? Math.round(sum('likes') / n) : null
    const engPerPost = n ? (sum('likes') + sum('comments') + sum('shares') + sum('saves')) / n : null
    const engagementRate = (engPerPost != null && followers) ? +((engPerPost / followers) * 100).toFixed(1) : null
    const cadence = n ? +(n / (30 / 7)).toFixed(1) : null   // posts per week over the window

    const topPosts = withM
      .map(({ p, m }) => {
        const t = tBy[p.id] || null
        return {
          id: p.id, platform: p.platform, caption: p.caption, thumb_url: p.thumb_url,
          permalink: p.permalink, posted_at: p.posted_at,
          views: m.views ?? 0, likes: m.likes ?? 0, comments: m.comments ?? 0,
          saves: m.saves ?? 0, shares: m.shares ?? 0,
          rank_score: Math.round(rankScore(m)),
          teardown: t ? { hook: t.hook, value: t.value, cta: t.cta, why: t.why } : null,
        }
      })
      .sort((a, b) => b.rank_score - a.rank_score)
      .slice(0, 10)

    res.json({
      platform, exists: true, handle: ch.handle,
      snapshots: snaps,
      followers,
      delta7: deltaFor(snapsDesc, 'followers', 7),
      delta30: deltaFor(snapsDesc, 'followers', 30),
      stats: {
        engagement_rate: engagementRate, avg_views: avgViews, avg_likes: avgLikes,
        posting_cadence: cadence, total_posts: (posts || []).length, posts_30d: n,
      },
      top_posts: topPosts,
    })
  } catch (err) {
    console.error('GET /social/channel', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── Social Media Coach ───────────────────────────────────────────────────────
// A holistic, on-demand AI report over the studio's whole presence. Reads only
// from tables the social feature already populates (never scrapes at view time).

// GET the latest report. View-only — all roles can read.
router.get('/coach', authenticate, requireStudio, async (req, res) => {
  try {
    const { data, error } = await supabase().from('social_coach_reports')
      .select('*').eq('studio_id', req.studio.id)
      .order('generated_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw new Error(error.message)
    res.json(data || { report: null })
  } catch (err) {
    console.error('GET /social/coach', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Generate a fresh report. Gated to owner/manager (spends an API call, like /sync-now).
router.post('/coach/refresh', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const report = await generateCoachReport(supabase(), req.studio.id, {
      studio: req.studio, userId: req.user?.id || null,
    })
    res.json(report)
  } catch (err) {
    console.error('POST /social/coach/refresh', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
