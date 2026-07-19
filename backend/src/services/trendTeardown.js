const { generateJson, hasAnthropicKey, TEARDOWN_MODEL } = require('./anthropic')

const SYSTEM = `You are a viral short-form content strategist for a boutique infrared fitness studio (HOTWORX — infrared sauna HIIT, yoga, and pilates). You study Instagram Reels and TikToks to reverse-engineer why they perform, then produce a concrete, ready-to-shoot plan to recreate them for THIS studio. Follow the Ava Yurgens / Personal Brand Launch framework: hook -> story -> value -> CTA, clear content pillars, face-to-camera personal brand over faceless b-roll, niche clarity, and authenticity over polish. Favor recreations that put the owner or a coach ON camera. Respond ONLY with a valid JSON object — no markdown fences, no preamble. Start with { and end with }.`

function buildPrompt(post) {
  const metrics = `views ${post.views ?? '?'}, likes ${post.likes ?? '?'}, comments ${post.comments ?? '?'}, shares ${post.shares ?? '?'}, saves ${post.saves ?? '?'}`
  return `Analyze this ${post.platform} post and produce a teardown.

Author: @${post.author_handle || 'unknown'}${post.author_followers ? ` (${post.author_followers} followers)` : ''}
Metrics: ${metrics}
${post.trending_sound ? `Audio: ${post.trending_sound}\n` : ''}Caption: ${post.caption || '(none)'}
${post.transcript ? `Transcript: ${post.transcript}\n` : ''}
Return EXACTLY this JSON shape (no extra keys):
{
  "hook": "the scroll-stopper in the first 1-2 seconds (visual + on-screen text)",
  "value": "why viewers keep watching / the retention payoff",
  "cta": "the ask, and whether it appeared to work",
  "why_it_works": "the psychological driver (relatability | aspiration | curiosity-gap | social-proof | education | transformation | humor)",
  "format": "POV | listicle | transformation-before-after | day-in-the-life | tutorial | trend-duet | talking-head | green-screen-react",
  "trending_sound": "name of the audio if it's riding a trend, else null",
  "content_pillar": "Education | Transformation-Results | Community-Culture | Behind-the-scenes | Entertainment-Trend | Offer-Promo",
  "steal_this": {
    "concept": "one-line HOTWORX-specific recreation concept",
    "shot_list": ["3-5 concrete steps / mini-script beats, with the owner or a coach on camera"],
    "onscreen_hook": "suggested on-screen text hook",
    "caption": "suggested caption for the studio's post"
  },
  "effort": "low | medium | high"
}`
}

// Generate teardowns for the top not-yet-torn-down trend posts. Caches (skips
// posts that already have one), caps at `limit` Claude calls, and never throws
// out — a failed generation is recorded as status='unavailable'.
async function generateTeardowns(supabase, studioId, { limit = 15, recencyDays = 21 } = {}) {
  if (!hasAnthropicKey()) return { generated: 0, skipped: 'no_anthropic_key' }
  const since = new Date(Date.now() - recencyDays * 86400000).toISOString()

  const { data: posts } = await supabase.from('trend_posts')
    .select('*').eq('studio_id', studioId).gte('discovered_at', since)
    .order('virality_score', { ascending: false }).limit(limit * 3)
  const ids = (posts || []).map(p => p.id)
  const { data: existing } = ids.length
    ? await supabase.from('trend_teardowns').select('trend_post_id').in('trend_post_id', ids)
    : { data: [] }
  const done = new Set((existing || []).map(t => t.trend_post_id))
  const todo = (posts || []).filter(p => !done.has(p.id)).slice(0, limit)

  let generated = 0
  for (const post of todo) {
    let row
    try {
      const t = await generateJson(SYSTEM, buildPrompt(post), { maxTokens: 1500 })
      row = {
        trend_post_id: post.id,
        hook: t.hook || null, value: t.value || null, cta: t.cta || null,
        why_it_works: t.why_it_works || null, format: t.format || null,
        trending_sound: t.trending_sound || post.trending_sound || null,
        content_pillar: t.content_pillar || null,
        steal_this: t.steal_this || null, effort: t.effort || null,
        model: TEARDOWN_MODEL, status: 'ok', generated_at: new Date().toISOString(),
      }
    } catch (e) {
      console.error('[Trend Teardown] failed for', post.id, e.message)
      row = { trend_post_id: post.id, status: 'unavailable', model: TEARDOWN_MODEL, generated_at: new Date().toISOString() }
    }
    const { error } = await supabase.from('trend_teardowns').upsert(row, { onConflict: 'trend_post_id' })
    if (!error && row.status === 'ok') generated++
  }
  return { generated, considered: todo.length }
}

module.exports = { generateTeardowns }
