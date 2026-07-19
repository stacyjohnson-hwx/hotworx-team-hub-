// Google reviews pipeline for the per-channel dashboard: scrape the actual public
// reviews (Apify) into `google_reviews`, then have Claude summarize what customers
// love / recurring issues into `google_review_insights`. Reads only from our DB at
// view time (route just SELECTs the stored rows).
const { scrapeGoogleReviews } = require('./socialConnectors')
const { generateJson, hasAnthropicKey, TEARDOWN_MODEL } = require('./anthropic')

const REVIEW_SYS = `You analyze Google reviews for a boutique infrared fitness studio (HOTWORX — infrared sauna HIIT/yoga/pilates). Summarize, for the owner, what customers consistently love and any recurring issues worth fixing. Be specific and concrete; base every point on the actual reviews. Respond ONLY with a valid JSON object, no prose or code fences.`

// Claude → { summary, loves[], issues[], sentiment }. Soft-fails (never throws).
async function generateReviewInsights(supabase, studioId, { limit = 40 } = {}) {
  if (!hasAnthropicKey()) return { skipped: 'no_anthropic_key' }
  const { data: reviews } = await supabase
    .from('google_reviews').select('rating, text, review_date')
    .eq('studio_id', studioId).not('text', 'is', null)
    .order('review_date', { ascending: false }).limit(limit)
  if (!reviews || !reviews.length) return { skipped: 'no_reviews' }

  const sample = reviews.map(r => `[${r.rating ?? '?'}★] ${r.text}`).join('\n').slice(0, 6000)
  const prompt = `Recent Google reviews (rating + text):\n${sample}\n\nReturn EXACTLY this JSON shape:\n{"summary":"2-3 sentence overview of the studio's reputation","loves":["short theme customers praise", "... up to 5"],"issues":["short recurring complaint/theme", "... up to 5, [] if none"],"sentiment":"positive|mixed|negative"}`
  try {
    const t = await generateJson(REVIEW_SYS, prompt, { model: TEARDOWN_MODEL, maxTokens: 900 })
    await supabase.from('google_review_insights').upsert({
      studio_id: studioId,
      summary: t.summary || null,
      loves: Array.isArray(t.loves) ? t.loves : [],
      issues: Array.isArray(t.issues) ? t.issues : [],
      sentiment: t.sentiment || null,
      reviews_analyzed: reviews.length,
      model: TEARDOWN_MODEL,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'studio_id' })
    return { analyzed: reviews.length }
  } catch (e) { return { error: e.message } }
}

// Scrape the studio's Google reviews → upsert → refresh AI insights.
async function syncGoogleReviews(supabase, studioId) {
  const { data: channels } = await supabase.from('social_channels')
    .select('*').eq('studio_id', studioId).eq('platform', 'google').eq('active', true)
  const ch = channels?.[0]
  if (!ch) return { status: 'no_channel' }

  const { reviews, error, count } = await scrapeGoogleReviews(ch)
  if (error) return { status: 'error', error }

  if (reviews.length) {
    const rows = reviews.map(r => ({ studio_id: studioId, ...r, scraped_at: new Date().toISOString() }))
    const { error: upErr } = await supabase.from('google_reviews').upsert(rows, { onConflict: 'studio_id,external_id' })
    if (upErr) return { status: 'error', error: upErr.message }
  }
  const insights = await generateReviewInsights(supabase, studioId)
  return { status: 'ok', scraped: reviews.length, place_items: count ?? 0, insights }
}

module.exports = { syncGoogleReviews, generateReviewInsights }
