const { generateJson, hasAnthropicKey, TEARDOWN_MODEL } = require('./anthropic')

// Rank the studio's own posts the same way the dashboard does (PRD §7 weights),
// so the coach reasons about the SAME "best performing" set the team sees.
const rankScore = (m = {}) =>
  (m.saves || 0) * 3 + (m.shares || 0) * 2 + (m.comments || 0) * 1.5 +
  (m.follows_driven || 0) * 5 + (m.views || 0) * 0.01

// delta = latest value − value from the snapshot on/just-before (latest − N days).
// snaps must be date-desc. null when there isn't history that far back.
function deltaFor(snaps, field, days) {
  if (!snaps.length) return null
  const latest = snaps[0]
  const target = new Date(latest.snapshot_date + 'T00:00:00')
  target.setDate(target.getDate() - days)
  const targetStr = target.toISOString().split('T')[0]
  const prior = snaps.find(s => s.snapshot_date <= targetStr)
  if (!prior || latest[field] == null || prior[field] == null) return null
  return latest[field] - prior[field]
}

// ── Read-only aggregation of everything the coach reasons over. Pulls only from
//    tables the social feature already populates — the coach scrapes nothing. ──
async function gatherContext(supabase, studioId, studio = {}) {
  const { data: channels } = await supabase.from('social_channels')
    .select('*').eq('studio_id', studioId).eq('active', true)
  const chIds = (channels || []).map(c => c.id)

  const [{ data: snaps }, { data: posts }] = await Promise.all([
    chIds.length ? supabase.from('channel_snapshots').select('*').in('channel_id', chIds).order('snapshot_date', { ascending: false }) : { data: [] },
    chIds.length ? supabase.from('content_posts').select('*').in('channel_id', chIds) : { data: [] },
  ])

  const snapsByCh = {}
  for (const s of snaps || []) (snapsByCh[s.channel_id] = snapsByCh[s.channel_id] || []).push(s)
  const channelStats = (channels || []).map(c => {
    const cs = snapsByCh[c.id] || []
    const latest = cs[0] || {}
    const isGoogle = c.platform === 'google'
    const field = isGoogle ? 'review_count' : 'followers'
    return {
      platform: c.platform, handle: c.handle,
      followers: isGoogle ? null : (latest.followers ?? null),
      rating: isGoogle ? (latest.rating ?? null) : null,
      reviews: isGoogle ? (latest.review_count ?? null) : null,
      delta7: deltaFor(cs, field, 7), delta30: deltaFor(cs, field, 30),
    }
  })

  // Top own posts by rank score, with their teardown notes (what's already working).
  let ownPosts = []
  const postIds = (posts || []).map(p => p.id)
  if (postIds.length) {
    const [{ data: metrics }, { data: teardowns }] = await Promise.all([
      supabase.from('post_metrics').select('*').in('post_id', postIds),
      supabase.from('post_teardowns').select('*').in('post_id', postIds),
    ])
    const mBy = Object.fromEntries((metrics || []).map(m => [m.post_id, m]))
    const tBy = Object.fromEntries((teardowns || []).map(t => [t.post_id, t]))
    ownPosts = (posts || [])
      .map(p => {
        const m = mBy[p.id] || {}, t = tBy[p.id] || {}
        return {
          platform: p.platform, caption: (p.caption || '').slice(0, 240),
          views: m.views ?? null, likes: m.likes ?? null, comments: m.comments ?? null,
          saves: m.saves ?? null, shares: m.shares ?? null,
          rank_score: Math.round(rankScore(m)),
          why_it_worked: t.why || null, hook: t.hook || null,
        }
      })
      .sort((a, b) => b.rank_score - a.rank_score)
      .slice(0, 8)
  }

  // Top external viral posts in the niche (what's working elsewhere) + teardown.
  const { data: trends } = await supabase.from('trend_posts')
    .select('*').eq('studio_id', studioId)
    .order('virality_score', { ascending: false }).limit(8)
  const trendIds = (trends || []).map(t => t.id)
  const { data: trendTds } = trendIds.length
    ? await supabase.from('trend_teardowns').select('*').in('trend_post_id', trendIds)
    : { data: [] }
  const tdBy = Object.fromEntries((trendTds || []).map(t => [t.trend_post_id, t]))
  const trendPosts = (trends || []).map(t => {
    const td = tdBy[t.id] || {}
    return {
      platform: t.platform, author: t.author_handle, author_followers: t.author_followers,
      caption: (t.caption || '').slice(0, 200), views: t.views, likes: t.likes,
      format: td.format || null, content_pillar: td.content_pillar || null,
      why_it_works: td.why_it_works || null, trending_sound: td.trending_sound || null,
    }
  })

  return {
    studio_name: studio.name || 'HOTWORX studio',
    location: studio.address || studio.city || null,
    channels: channelStats, own_posts: ownPosts, trend_posts: trendPosts,
    data_as_of: (snaps || [])[0]?.captured_at || null,
  }
}

const COACH_SYSTEM = `You are an elite social media strategist and coach for a boutique infrared fitness studio (HOTWORX — infrared sauna HIIT, yoga, and pilates). You are fluent in the most current (2025-2026) short-form best practices across Instagram Reels and TikTok: hook-in-first-second retention, native trends, face-to-camera personal brand over faceless b-roll, DM-driven lead flow, and local community engagement. You coach a small studio team (an owner, a manager, and TSA front-desk staff) who shoot content on their phones between clients — so every recommendation must be realistic for them, specific, and encouraging.

You channel the philosophies of top creators and marketers and attribute the advice to them by name (e.g. Alex Hormozi on give-value-first offers, Gary Vaynerchuk on document-don't-create and jab-jab-jab-right-hook, Ava Yurgens / Personal Brand Launch on niche clarity and face-to-camera, Vanessa Lau / Katie Steckly on repurposing and batching, Colin and Samir on retention editing). Attribute advice as "inspired by" — never claim to BE them.

Respond ONLY with a valid JSON object — no markdown fences, no preamble. Start with { and end with }.`

function buildCoachPrompt(ctx) {
  return `Coach the social media presence of ${ctx.studio_name}${ctx.location ? ` (${ctx.location})` : ''}.

CURRENT CHANNELS (with follower/review deltas; "—" means no history yet):
${JSON.stringify(ctx.channels, null, 2)}

THE STUDIO'S OWN TOP POSTS (ranked by our engagement score; captions + why-they-worked notes):
${ctx.own_posts.length ? JSON.stringify(ctx.own_posts, null, 2) : '(no own-post data captured yet — coach from best practices and give them a starting content plan)'}

WHAT'S GOING VIRAL IN THE NICHE (external posts we track, most-viral first):
${ctx.trend_posts.length ? JSON.stringify(ctx.trend_posts, null, 2) : '(no trend data yet)'}

Ground your advice in THIS studio's real numbers and posts above whenever possible. Be concrete — reference an actual post, format, or metric rather than generic tips. Where data is thin, say so and coach from best practices.

Return EXACTLY this JSON shape (no extra keys):
{
  "grade": "a letter grade A-F (with +/-) for the studio's social right now",
  "headline": "one punchy sentence summing up where their social stands",
  "summary": "2-3 sentence honest, encouraging assessment",
  "whats_working": ["3-5 specific strengths, each tied to a real post/metric when possible"],
  "fixes": [{"title": "the fix", "why": "why it matters for engagement or leads", "how": "one concrete step they can do this week"}],
  "content_plan": [{"pillar": "content pillar", "format": "reel | carousel | story | talking-head | trend", "idea": "specific post idea for HOTWORX", "visual": "exactly what to shoot/show on screen"}],
  "engagement_playbook": {
    "own_followers": ["3-5 daily/weekly tactics to engage the studio's own audience (replies, DMs, stories, polls)"],
    "target_accounts": ["3-5 specific TYPES of local accounts, hashtags, or communities to engage with and HOW (e.g. comment on local businesses, engage #<city>fitness)"],
    "lead_flow": ["3-5 tactics to turn engagement into booked intro sessions / DMs / link clicks"]
  },
  "creator_voices": [{"creator": "named top creator/marketer", "advice": "one piece of advice in their style, attributed, applied to this studio"}],
  "team_this_week": [{"task": "one assignable action", "owner": "Owner | Manager | TSA"}]
}

Aim for 3-5 items in each list. Make fixes, content_plan, and creator_voices the richest sections.`
}

// Generate ONE holistic coaching report for the studio and persist it. Reuses the
// shared Anthropic JSON wrapper. Degrades gracefully (status 'unavailable') when
// there's no API key — never throws out to the route.
async function generateCoachReport(supabase, studioId, { studio = {}, userId = null } = {}) {
  if (!hasAnthropicKey()) {
    const row = {
      studio_id: studioId, report: { message: 'AI coaching is unavailable — ANTHROPIC_API_KEY is not configured.' },
      status: 'unavailable', model: null, generated_by: userId, generated_at: new Date().toISOString(),
    }
    await supabase.from('social_coach_reports').insert(row)
    return row
  }

  const ctx = await gatherContext(supabase, studioId, studio)
  let row
  try {
    const report = await generateJson(COACH_SYSTEM, buildCoachPrompt(ctx), { model: TEARDOWN_MODEL, maxTokens: 3000 })
    row = {
      studio_id: studioId, report, inputs: ctx,
      status: 'ok', model: TEARDOWN_MODEL, generated_by: userId, generated_at: new Date().toISOString(),
    }
  } catch (e) {
    console.error('[Coach Report] failed for studio', studioId, e.message)
    row = {
      studio_id: studioId, report: { message: 'The AI coach could not generate a report this time. Please try again.' },
      inputs: ctx, status: 'unavailable', model: TEARDOWN_MODEL, generated_by: userId, generated_at: new Date().toISOString(),
    }
  }
  const { data: saved } = await supabase.from('social_coach_reports').insert(row).select('*').single()
  return saved || row
}

module.exports = { generateCoachReport, gatherContext }
