const express = require('express')
const router  = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate     = require('../middleware/authMiddleware')
const { requireStudio } = require('../middleware/studioMiddleware')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const ALLOWED_EMOJI = ['❤️', '🔥', '👏', '💪', '🎉', '😂']

// Content comes from trusted owner/manager accounts, but strip anything executable.
function sanitizeHtml(html) {
  if (!html) return ''
  return String(html)
    .replace(/<\/?(script|style|iframe|object|embed|form|link|meta)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'>\s]*\2/gi, '')
}

function requireManagerStudio(req, res, next) {
  if (!['owner', 'manager'].includes(req.studio.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' })
  }
  next()
}

// GET /api/announcements — feed for the current studio, all roles
router.get('/', authenticate, requireStudio, async (req, res) => {
  const { data: posts, error } = await db()
    .from('announcements')
    .select('*')
    .eq('studio_id', req.studio.id)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return res.status(500).json({ error: error.message })
  if (!posts.length) return res.json([])

  const postIds   = posts.map(p => p.id)
  const authorIds = [...new Set(posts.map(p => p.author_id))]

  const [{ data: reactions }, { data: profiles }] = await Promise.all([
    db().from('announcement_reactions').select('announcement_id, user_id, user_name, emoji').in('announcement_id', postIds),
    db().from('user_profiles').select('id, full_name, avatar_url').in('id', authorIds),
  ])

  const profileById = Object.fromEntries((profiles || []).map(p => [p.id, p]))

  res.json(posts.map(post => {
    const rows = (reactions || []).filter(r => r.announcement_id === post.id)
    const byEmoji = {}
    for (const r of rows) {
      byEmoji[r.emoji] ??= { emoji: r.emoji, count: 0, mine: false, names: [] }
      byEmoji[r.emoji].count++
      if (r.user_name) byEmoji[r.emoji].names.push(r.user_name)
      if (r.user_id === req.user.id) byEmoji[r.emoji].mine = true
    }
    const profile = profileById[post.author_id]
    return {
      ...post,
      author_name: profile?.full_name || post.author_name || 'Team',
      author_avatar: profile?.avatar_url || null,
      reactions: Object.values(byEmoji),
    }
  }))
})

// POST /api/announcements — owner/manager only
router.post('/', authenticate, requireStudio, requireManagerStudio, async (req, res) => {
  const { content_html, images } = req.body
  const html = sanitizeHtml(content_html)
  const imgs = Array.isArray(images) ? images.filter(i => i?.url) : []
  if (!html.replace(/<[^>]*>/g, '').trim() && !imgs.length) {
    return res.status(400).json({ error: 'Post needs some text or a photo' })
  }

  const { data, error } = await db()
    .from('announcements')
    .insert({
      studio_id: req.studio.id,
      author_id: req.user.id,
      author_name: req.user.user_metadata?.full_name || req.user.email?.split('@')[0] || null,
      content_html: html,
      images: imgs,
    })
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json({ ...data, reactions: [] })
})

// PUT /api/announcements/:id — owner/manager only; edits text/images
router.put('/:id', authenticate, requireStudio, requireManagerStudio, async (req, res) => {
  const { content_html, images } = req.body
  const update = { updated_at: new Date().toISOString() }
  if (content_html !== undefined) update.content_html = sanitizeHtml(content_html)
  if (images !== undefined) update.images = Array.isArray(images) ? images.filter(i => i?.url) : []

  const { data, error } = await db()
    .from('announcements')
    .update(update)
    .eq('id', req.params.id)
    .eq('studio_id', req.studio.id)
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/announcements/:id/pin — owner/manager only; toggles pin
router.post('/:id/pin', authenticate, requireStudio, requireManagerStudio, async (req, res) => {
  const { data: post, error: fetchErr } = await db()
    .from('announcements').select('pinned').eq('id', req.params.id).eq('studio_id', req.studio.id).single()
  if (fetchErr || !post) return res.status(404).json({ error: 'Not found' })

  const { data, error } = await db()
    .from('announcements')
    .update({ pinned: !post.pinned })
    .eq('id', req.params.id)
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /api/announcements/:id — owner/manager only; also removes storage files
router.delete('/:id', authenticate, requireStudio, requireManagerStudio, async (req, res) => {
  const { data: post } = await db()
    .from('announcements').select('images').eq('id', req.params.id).eq('studio_id', req.studio.id).single()
  if (!post) return res.status(404).json({ error: 'Not found' })

  const paths = (post.images || []).map(i => i.path).filter(Boolean)
  if (paths.length) await db().storage.from('marketing-content').remove(paths).catch(() => {})

  const { error } = await db().from('announcements').delete().eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// POST /api/announcements/:id/react — any role; toggles an emoji reaction
router.post('/:id/react', authenticate, requireStudio, async (req, res) => {
  const { emoji } = req.body
  if (!ALLOWED_EMOJI.includes(emoji)) return res.status(400).json({ error: 'Invalid emoji' })

  const { data: post } = await db()
    .from('announcements').select('id').eq('id', req.params.id).eq('studio_id', req.studio.id).single()
  if (!post) return res.status(404).json({ error: 'Not found' })

  const { data: existing } = await db()
    .from('announcement_reactions')
    .select('id')
    .eq('announcement_id', req.params.id)
    .eq('user_id', req.user.id)
    .eq('emoji', emoji)
    .maybeSingle()

  if (existing) {
    const { error } = await db().from('announcement_reactions').delete().eq('id', existing.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ reacted: false, emoji })
  }

  const { error } = await db().from('announcement_reactions').insert({
    announcement_id: req.params.id,
    user_id: req.user.id,
    user_name: req.user.user_metadata?.full_name || req.user.email?.split('@')[0] || null,
    emoji,
  })
  if (error) return res.status(500).json({ error: error.message })
  res.json({ reacted: true, emoji })
})

module.exports = router
