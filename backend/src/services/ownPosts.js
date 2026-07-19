const { scrapeOwnPosts } = require('./socialConnectors')
const { generateJson, hasAnthropicKey, TEARDOWN_MODEL } = require('./anthropic')

// Score for picking which posts to tear down (mirrors the dashboard rank_score).
const score = (m = {}) => (m.saves || 0) * 3 + (m.shares || 0) * 2 + (m.comments || 0) * 1.5 + (m.views || 0) * 0.01

const OWN_SYSTEM = `You are a social media coach for a boutique infrared fitness studio (HOTWORX). Analyze one of the studio's OWN posts that performed well and explain why, so they can repeat what works. Be specific and encouraging. Respond ONLY with a valid JSON object — no markdown fences, no preamble. Start with { and end with }.`
const buildOwnPrompt = (post, m) =>
  `The studio's own ${post.platform} post. Metrics: views ${m.views ?? '?'}, likes ${m.likes ?? '?'}, comments ${m.comments ?? '?'}, saves ${m.saves ?? '?'}, shares ${m.shares ?? '?'}.
Caption: ${post.caption || '(none)'}
Return EXACTLY: {"hook":"what grabbed attention in the first 1-2s","value":"why people watched / engaged","cta":"the ask, and whether it appeared to work","why":"one concrete thing to do MORE of, based on why this post worked"}`

// Teardowns for the studio's own top posts → post_teardowns (cached; only new).
async function generateOwnTeardowns(supabase, studioId, { limit = 8, recencyDays = 30 } = {}) {
  if (!hasAnthropicKey()) return { generated: 0, skipped: 'no_anthropic_key' }
  const { data: channels } = await supabase.from('social_channels').select('id').eq('studio_id', studioId)
  const chIds = (channels || []).map(c => c.id)
  if (!chIds.length) return { generated: 0 }
  const since = new Date(Date.now() - recencyDays * 86400000).toISOString()
  const { data: posts } = await supabase.from('content_posts').select('*').in('channel_id', chIds).gte('posted_at', since)
  const ids = (posts || []).map(p => p.id)
  if (!ids.length) return { generated: 0 }
  const [{ data: metrics }, { data: existing }] = await Promise.all([
    supabase.from('post_metrics').select('*').in('post_id', ids),
    supabase.from('post_teardowns').select('post_id').in('post_id', ids),
  ])
  const mBy = Object.fromEntries((metrics || []).map(m => [m.post_id, m]))
  const done = new Set((existing || []).map(t => t.post_id))
  const todo = (posts || []).filter(p => !done.has(p.id))
    .sort((a, b) => score(mBy[b.id]) - score(mBy[a.id])).slice(0, limit)

  let generated = 0
  for (const post of todo) {
    try {
      const t = await generateJson(OWN_SYSTEM, buildOwnPrompt(post, mBy[post.id] || {}), { maxTokens: 900 })
      const { error } = await supabase.from('post_teardowns').upsert({
        post_id: post.id, hook: t.hook || null, value: t.value || null, cta: t.cta || null, why: t.why || null,
        model: TEARDOWN_MODEL, generated_at: new Date().toISOString(),
      }, { onConflict: 'post_id' })
      if (!error) generated++
    } catch (e) { console.error('[Own Teardown]', post.id, e.message) }
  }
  return { generated, considered: todo.length }
}

// Scrape the studio's own IG + TikTok posts into content_posts + post_metrics,
// then tear down the top ones. Feeds the dashboard "Best-performing content".
async function syncOwnPosts(supabase, studioId, { limit = 20, withTeardowns = true } = {}) {
  const { data: channels } = await supabase.from('social_channels')
    .select('*').eq('studio_id', studioId).eq('active', true).in('platform', ['instagram', 'tiktok'])

  const results = []
  for (const ch of channels || []) {
    try {
      const { items, error, count, rawKeys } = await scrapeOwnPosts(ch, { limit })
      if (error) { results.push({ platform: ch.platform, status: 'error', error }); continue }
      if (!items.length) { results.push({ platform: ch.platform, status: 'no_posts', scraped: count, field_names: rawKeys }); continue }

      const postRows = items.map(it => ({
        channel_id: ch.id, platform: ch.platform, external_id: it.external_id,
        caption: it.caption, media_type: 'video', posted_at: it.posted_at || null,
        permalink: it.url, thumb_url: it.thumb_url,
      }))
      const { data: upserted } = await supabase.from('content_posts')
        .upsert(postRows, { onConflict: 'channel_id,external_id' }).select('id, external_id')
      const idBy = Object.fromEntries((upserted || []).map(p => [p.external_id, p.id]))
      const metricRows = items.filter(it => idBy[it.external_id]).map(it => ({
        post_id: idBy[it.external_id],
        views: it.views, likes: it.likes, comments: it.comments, shares: it.shares, saves: it.saves,
        is_estimate: true, updated_at: new Date().toISOString(),
      }))
      if (metricRows.length) await supabase.from('post_metrics').upsert(metricRows, { onConflict: 'post_id' })
      results.push({ platform: ch.platform, status: 'ok', kept: postRows.length, scraped: count })
    } catch (e) {
      results.push({ platform: ch.platform, status: 'error', error: e.message })
    }
  }

  const teardowns = withTeardowns ? await generateOwnTeardowns(supabase, studioId) : { generated: 0 }
  return { results, teardowns }
}

module.exports = { syncOwnPosts, generateOwnTeardowns }
