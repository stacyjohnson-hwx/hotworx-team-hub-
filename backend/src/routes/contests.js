const express = require('express')
const router  = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate      = require('../middleware/authMiddleware')
const { requireStudio } = require('../middleware/studioMiddleware')
const { computeLeaderboard } = require('../services/leaderboard')
const { todayInChicago } = require('../utils/dates')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

router.use(authenticate, requireStudio)

const ALLOWED_EMOJI   = ['❤️', '🔥', '👏', '💪', '🎉', '🏆']
const ALLOWED_METRICS = ['memberships', 'retail', 'eft', 'outreach', 'leadgen_points', 'commission']
// Which computeLeaderboard field each auto metric ranks on (leadgen_points is sourced separately).
const METRIC_FIELD = {
  memberships: 'total_memberships',
  retail:      'retail_actual',
  eft:         'eft_actual',
  outreach:    'outreach',
  commission:  'commission_total',
}

function requireManagerStudio(req, res, next) {
  if (!['owner', 'manager'].includes(req.studio.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' })
  }
  next()
}

function sanitizeHtml(html) {
  if (!html) return ''
  return String(html)
    .replace(/<\/?(script|style|iframe|object|embed|form|link|meta)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'>\s]*\2/gi, '')
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

function actorName(req) {
  return req.user.user_metadata?.full_name || req.user.email?.split('@')[0] || null
}

// upcoming (not started) / active / ended
function effectiveStatus(contest, today) {
  if (contest.status === 'ended') return 'ended'
  if (contest.starts_on && contest.starts_on > today) return 'upcoming'
  return 'active'
}

// Drop a post into the announcements feed so contests surface there too.
async function postToFeed(req, html) {
  await db().from('announcements').insert({
    studio_id:   req.studio.id,
    author_id:   req.user.id,
    author_name: actorName(req),
    content_html: html,
    images: [],
  }).then(() => {}, () => {})  // best-effort; never block the contest action
}

// Active studio competitors (tsa + manager, excluding the owner), with names/avatars.
async function getStudioRoster(studioId) {
  const [{ data: usersData }, { data: memberRows }, { data: profiles }] = await Promise.all([
    db().auth.admin.listUsers(),
    db().from('user_studios').select('user_id, role').eq('studio_id', studioId),
    db().from('user_profiles').select('id, full_name, avatar_url, is_active'),
  ])
  const roleByUser = {}
  for (const m of (memberRows || [])) roleByUser[m.user_id] = m.role
  const profById = {}
  for (const p of (profiles || [])) profById[p.id] = p

  return (usersData?.users || [])
    .filter(u => roleByUser[u.id] && roleByUser[u.id] !== 'owner' && profById[u.id]?.is_active !== false)
    .map(u => ({
      user_id:    u.id,
      name:       profById[u.id]?.full_name || u.user_metadata?.full_name || u.email?.split('@')[0] || 'Team Member',
      avatar_url: profById[u.id]?.avatar_url || u.user_metadata?.avatar_url || null,
      role:       roleByUser[u.id],
    }))
}

// Frozen/manual scores hydrated with names + avatars, ranked desc.
async function scoresLeaderboard(contestId) {
  const { data: scores } = await db().from('contest_scores').select('user_id, user_name, score').eq('contest_id', contestId)
  const rows = scores || []
  if (!rows.length) return []
  const { data: profiles } = await db().from('user_profiles').select('id, full_name, avatar_url').in('id', rows.map(r => r.user_id))
  const profById = Object.fromEntries((profiles || []).map(p => [p.id, p]))
  return rows
    .map(r => ({
      user_id:    r.user_id,
      name:       profById[r.user_id]?.full_name || r.user_name || 'Team Member',
      avatar_url: profById[r.user_id]?.avatar_url || null,
      score:      Number(r.score) || 0,
    }))
    .sort((a, b) => b.score - a.score)
}

// Lead-gen points summed over the contest date range, ranked desc.
async function leadgenLeaderboard(contest) {
  const { data } = await db()
    .from('leadgen_completions')
    .select('staff_id, points_awarded')
    .eq('studio_id', contest.studio_id)
    .gte('completion_date', contest.starts_on)
    .lte('completion_date', contest.ends_on)
  const totals = {}
  for (const c of (data || [])) totals[c.staff_id] = (totals[c.staff_id] || 0) + (Number(c.points_awarded) || 0)
  const ids = Object.keys(totals)
  if (!ids.length) return []
  const { data: profiles } = await db().from('user_profiles').select('id, full_name, avatar_url').in('id', ids)
  const profById = Object.fromEntries((profiles || []).map(p => [p.id, p]))
  return ids
    .map(id => ({
      user_id:    id,
      name:       profById[id]?.full_name || 'Team Member',
      avatar_url: profById[id]?.avatar_url || null,
      score:      totals[id],
    }))
    .sort((a, b) => b.score - a.score)
}

// The live leaderboard for a contest: [{ user_id, name, avatar_url, score }] desc.
async function buildLeaderboard(contest) {
  // Ended contests read their frozen snapshot; manual contests read entered scores.
  if (contest.status === 'ended' || contest.scoring_mode === 'manual') {
    return scoresLeaderboard(contest.id)
  }
  if (contest.metric === 'leadgen_points') return leadgenLeaderboard(contest)
  const field = METRIC_FIELD[contest.metric]
  if (!field) return []
  const rows = await computeLeaderboard(contest.studio_id, contest.period_month, contest.period_year)
  return rows
    .map(r => ({ user_id: r.tsa_id, name: r.tsa_name, avatar_url: r.avatar_url, score: Number(r[field]) || 0 }))
    .sort((a, b) => b.score - a.score)
}

function myStanding(board, userId) {
  const idx = board.findIndex(r => r.user_id === userId)
  return idx === -1 ? { my_rank: null, my_score: null } : { my_rank: idx + 1, my_score: board[idx].score }
}

// GET /api/contests — all contests for the studio (all roles), each with a top-3 preview.
router.get('/', async (req, res) => {
  const today = todayInChicago()
  const { data: contests, error } = await db()
    .from('contests').select('*').eq('studio_id', req.studio.id)
    .order('status', { ascending: true })       // active before ended
    .order('ends_on', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })

  const out = []
  for (const c of (contests || [])) {
    const board = await buildLeaderboard(c)
    out.push({
      ...c,
      effective_status: effectiveStatus(c, today),
      top3:             board.slice(0, 3),
      entrant_count:    board.length,
      ...myStanding(board, req.user.id),
    })
  }
  res.json(out)
})

// GET /api/contests/:id — full detail: leaderboard, reactions, roster (all roles).
router.get('/:id', async (req, res) => {
  const { data: contest, error } = await db()
    .from('contests').select('*').eq('id', req.params.id).eq('studio_id', req.studio.id).single()
  if (error || !contest) return res.status(404).json({ error: 'Not found' })

  const today = todayInChicago()
  const [board, { data: reactionRows }, roster] = await Promise.all([
    buildLeaderboard(contest),
    db().from('contest_reactions').select('user_id, user_name, emoji').eq('contest_id', contest.id),
    ['owner', 'manager'].includes(req.studio.role) ? getStudioRoster(req.studio.id) : Promise.resolve([]),
  ])

  const byEmoji = {}
  for (const r of (reactionRows || [])) {
    byEmoji[r.emoji] ??= { emoji: r.emoji, count: 0, mine: false, names: [] }
    byEmoji[r.emoji].count++
    if (r.user_name) byEmoji[r.emoji].names.push(r.user_name)
    if (r.user_id === req.user.id) byEmoji[r.emoji].mine = true
  }

  res.json({
    ...contest,
    effective_status: effectiveStatus(contest, today),
    leaderboard:      board,
    reactions:        Object.values(byEmoji),
    roster,
    ...myStanding(board, req.user.id),
  })
})

// POST /api/contests — create (owner/manager). Auto-posts a launch note to the feed.
router.post('/', requireManagerStudio, async (req, res) => {
  const { title, description_html, prize, cover_image, scoring_mode,
          metric, score_label, period_month, period_year, starts_on, ends_on } = req.body

  if (!title?.trim())        return res.status(400).json({ error: 'Title is required' })
  if (!starts_on || !ends_on) return res.status(400).json({ error: 'Start and end dates are required' })
  const mode = scoring_mode === 'auto' ? 'auto' : 'manual'
  if (mode === 'auto') {
    if (!ALLOWED_METRICS.includes(metric)) return res.status(400).json({ error: 'Pick a valid metric' })
    if (!period_month || !period_year)     return res.status(400).json({ error: 'Auto contests need a month' })
  }

  const { data, error } = await db().from('contests').insert({
    studio_id:        req.studio.id,
    title:            title.trim(),
    description_html: sanitizeHtml(description_html),
    prize:            prize?.trim() || null,
    cover_image:      cover_image?.url ? { url: cover_image.url, path: cover_image.path || null } : null,
    scoring_mode:     mode,
    metric:           mode === 'auto' ? metric : null,
    score_label:      mode === 'manual' ? (score_label?.trim() || null) : null,
    period_month:     mode === 'auto' ? Number(period_month) : null,
    period_year:      mode === 'auto' ? Number(period_year) : null,
    starts_on,
    ends_on,
    created_by:       req.user.id,
  }).select().single()
  if (error) return res.status(500).json({ error: error.message })

  const prizeBit = data.prize ? ` 🎁 Prize: <b>${escapeHtml(data.prize)}</b>.` : ''
  await postToFeed(req, `🏆 New contest just dropped: <b>${escapeHtml(data.title)}</b>!${prizeBit} Head to the Contests page to see the leaderboard. 💪`)

  res.status(201).json(data)
})

// PUT /api/contests/:id — edit (owner/manager).
router.put('/:id', requireManagerStudio, async (req, res) => {
  const { title, description_html, prize, cover_image, score_label, starts_on, ends_on } = req.body
  const update = { updated_at: new Date().toISOString() }
  if (title !== undefined)            update.title = title.trim()
  if (description_html !== undefined) update.description_html = sanitizeHtml(description_html)
  if (prize !== undefined)            update.prize = prize?.trim() || null
  if (score_label !== undefined)      update.score_label = score_label?.trim() || null
  if (starts_on !== undefined)        update.starts_on = starts_on
  if (ends_on !== undefined)          update.ends_on = ends_on
  if (cover_image !== undefined)      update.cover_image = cover_image?.url ? { url: cover_image.url, path: cover_image.path || null } : null

  const { data, error } = await db().from('contests')
    .update(update).eq('id', req.params.id).eq('studio_id', req.studio.id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /api/contests/:id — delete + remove cover image (owner/manager).
router.delete('/:id', requireManagerStudio, async (req, res) => {
  const { data: contest } = await db()
    .from('contests').select('cover_image').eq('id', req.params.id).eq('studio_id', req.studio.id).single()
  if (!contest) return res.status(404).json({ error: 'Not found' })
  if (contest.cover_image?.path) {
    await db().storage.from('marketing-content').remove([contest.cover_image.path]).catch(() => {})
  }
  const { error } = await db().from('contests').delete().eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// PUT /api/contests/:id/scores — set manual scores (owner/manager).
router.put('/:id/scores', requireManagerStudio, async (req, res) => {
  const { data: contest } = await db()
    .from('contests').select('id, scoring_mode, status').eq('id', req.params.id).eq('studio_id', req.studio.id).single()
  if (!contest) return res.status(404).json({ error: 'Not found' })
  if (contest.scoring_mode !== 'manual') return res.status(400).json({ error: 'Only manual contests take entered scores' })

  const scores = Array.isArray(req.body.scores) ? req.body.scores : []
  const rows = scores
    .filter(s => s.user_id)
    .map(s => ({
      contest_id: contest.id,
      user_id:    s.user_id,
      user_name:  s.user_name || null,
      score:      Number(s.score) || 0,
      updated_at: new Date().toISOString(),
    }))
  if (rows.length) {
    const { error } = await db().from('contest_scores').upsert(rows, { onConflict: 'contest_id,user_id' })
    if (error) return res.status(500).json({ error: error.message })
  }
  res.json(await scoresLeaderboard(contest.id))
})

// POST /api/contests/:id/end — freeze scores, crown the winner (owner/manager).
router.post('/:id/end', requireManagerStudio, async (req, res) => {
  const { data: contest } = await db()
    .from('contests').select('*').eq('id', req.params.id).eq('studio_id', req.studio.id).single()
  if (!contest) return res.status(404).json({ error: 'Not found' })

  const board = await buildLeaderboard(contest)

  // Freeze the current standings so the archive stays stable.
  if (board.length) {
    const snapshot = board.map(r => ({
      contest_id: contest.id, user_id: r.user_id, user_name: r.name,
      score: r.score, updated_at: new Date().toISOString(),
    }))
    await db().from('contest_scores').upsert(snapshot, { onConflict: 'contest_id,user_id' })
  }

  const winner = board[0] || null
  const { data, error } = await db().from('contests').update({
    status:       'ended',
    ended_at:     new Date().toISOString(),
    winner_id:    winner?.user_id || null,
    winner_name:  winner?.name    || null,
    winner_score: winner ? winner.score : null,
    updated_at:   new Date().toISOString(),
  }).eq('id', contest.id).select().single()
  if (error) return res.status(500).json({ error: error.message })

  if (winner) {
    await postToFeed(req, `🎉 Congratulations <b>${escapeHtml(winner.name)}</b> — winner of <b>${escapeHtml(contest.title)}</b>! 🏆${contest.prize ? ` Enjoy your ${escapeHtml(contest.prize)}. 🎁` : ''}`)
  }
  res.json(data)
})

// POST /api/contests/:id/react — toggle a cheer (all roles).
router.post('/:id/react', async (req, res) => {
  const { emoji } = req.body
  if (!ALLOWED_EMOJI.includes(emoji)) return res.status(400).json({ error: 'Invalid emoji' })

  const { data: contest } = await db()
    .from('contests').select('id').eq('id', req.params.id).eq('studio_id', req.studio.id).single()
  if (!contest) return res.status(404).json({ error: 'Not found' })

  const { data: existing } = await db().from('contest_reactions')
    .select('id').eq('contest_id', req.params.id).eq('user_id', req.user.id).eq('emoji', emoji).maybeSingle()

  if (existing) {
    const { error } = await db().from('contest_reactions').delete().eq('id', existing.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ reacted: false, emoji })
  }
  const { error } = await db().from('contest_reactions').insert({
    contest_id: req.params.id, user_id: req.user.id, user_name: actorName(req), emoji,
  })
  if (error) return res.status(500).json({ error: error.message })
  res.json({ reacted: true, emoji })
})

module.exports = router
