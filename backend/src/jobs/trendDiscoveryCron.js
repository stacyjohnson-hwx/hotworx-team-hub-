const cron = require('node-cron')
const { createClient } = require('@supabase/supabase-js')
const { discoverPosts } = require('../services/socialConnectors')
const { generateTeardowns } = require('../services/trendTeardown')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Cost-control caps + virality weights — tune here.
const POSTS_PER_SOURCE = 30
const KEEP_PER_SOURCE = 10
const RECENCY_DAYS = 21
const TEARDOWNS_PER_RUN = 15
const VIRALITY_WEIGHTS = { engagementRate: 1000, saves: 3, shares: 4, comments: 1.5, recencyHalfLifeDays: 10 }

// Reward outsized engagement RELATIVE to the author's size (a small creator's
// breakout is a more replicable signal than a mega-account's baseline), plus
// saves/shares and exponential recency decay.
function viralityScore(p) {
  const followers = Math.max(p.author_followers || 0, 1000)
  const eng = (p.likes || 0) + (p.comments || 0) + (p.shares || 0) + (p.saves || 0)
  const base = (eng / followers) * VIRALITY_WEIGHTS.engagementRate
    + (p.saves || 0) * VIRALITY_WEIGHTS.saves
    + (p.shares || 0) * VIRALITY_WEIGHTS.shares
    + (p.comments || 0) * VIRALITY_WEIGHTS.comments
    + Math.log10((p.views || 0) + 1)
  const ageDays = p.posted_at ? Math.max(0, (Date.now() - new Date(p.posted_at).getTime()) / 86400000) : 7
  const recency = Math.pow(0.5, ageDays / VIRALITY_WEIGHTS.recencyHalfLifeDays)
  return Math.round(base * recency)
}

// Discover + rank + store trend posts for a studio (or all), then generate
// teardowns. Never lets one bad source fail the batch. Returns diagnostics.
async function discoverTrends(studioId = null, { withTeardowns = true } = {}) {
  const supabase = db()
  let q = supabase.from('trend_sources').select('*').eq('active', true)
  if (studioId) q = q.eq('studio_id', studioId)
  const { data: sources } = await q

  const perSource = []
  const studios = new Set()
  for (const src of sources || []) {
    try {
      const { items, error, count, rawKeys } = await discoverPosts(src, { limit: POSTS_PER_SOURCE })
      if (error) { perSource.push({ source: `${src.platform}:${src.query}`, status: 'error', error }); continue }
      const ranked = items
        .map(it => ({ ...it, virality_score: viralityScore(it) }))
        .sort((a, b) => b.virality_score - a.virality_score)
        .slice(0, KEEP_PER_SOURCE)
      if (ranked.length) {
        const rows = ranked.map(it => ({
          studio_id: src.studio_id, platform: src.platform, source_id: src.id,
          external_id: it.external_id, url: it.url, thumb_url: it.thumb_url, caption: it.caption,
          author_handle: it.author_handle, author_followers: it.author_followers, posted_at: it.posted_at || null,
          views: it.views, likes: it.likes, comments: it.comments, shares: it.shares, saves: it.saves,
          virality_score: it.virality_score, discovered_at: new Date().toISOString(),
        }))
        await supabase.from('trend_posts').upsert(rows, { onConflict: 'studio_id,platform,external_id' })
      }
      studios.add(src.studio_id)
      perSource.push({ source: `${src.platform}:${src.query}`, status: ranked.length ? 'ok' : 'no_posts', kept: ranked.length, scraped: count, field_names: ranked.length ? undefined : rawKeys })
    } catch (e) {
      perSource.push({ source: `${src.platform}:${src.query}`, status: 'error', error: e.message })
    }
  }

  const teardowns = {}
  if (withTeardowns) {
    for (const sid of studios) teardowns[sid] = await generateTeardowns(supabase, sid, { limit: TEARDOWNS_PER_RUN, recencyDays: RECENCY_DAYS })
  }
  return { sources: perSource, teardowns }
}

function startTrendCron() {
  // Mondays 3am America/Chicago — weekly (hashtag scraping burns more Apify credit
  // than the nightly follower snapshot, so it runs less often).
  cron.schedule('0 3 * * 1', () => { discoverTrends().catch(e => console.error('[Trend Cron]', e.message)) },
    { timezone: 'America/Chicago' })
}

module.exports = { startTrendCron, discoverTrends, viralityScore, RECENCY_DAYS, POSTS_PER_SOURCE, TEARDOWNS_PER_RUN }
