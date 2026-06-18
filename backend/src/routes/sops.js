const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const { requireRole } = require('../middleware/roleGuard')
const authenticate = require('../middleware/authMiddleware')

const supabase = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function buildUserMap(db) {
  const { data: { users } } = await db.auth.admin.listUsers({ perPage: 200 })
  const map = {}
  for (const u of users || []) {
    map[u.id] = u.user_metadata?.full_name || u.email?.split('@')[0] || 'Team Member'
  }
  return map
}

// ─── GET /api/sops ────────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  const { category, q } = req.query
  const db = supabase()

  let query = db
    .from('sops')
    .select('id, title, category, version, created_by, updated_by, created_at, updated_at, pdf_path, video_url, content, status, visibility')
    .order('category')
    .order('title')

  if (category) query = query.eq('category', category)
  if (q) query = query.ilike('title', `%${q}%`)

  const [{ data, error }, userMap] = await Promise.all([query, buildUserMap(db)])
  if (error) return res.status(500).json({ error: error.message })

  const enriched = (data || []).map(s => ({
    ...s,
    updated_by_name: userMap[s.updated_by] || userMap[s.created_by] || 'Team Member',
  }))
  res.json(enriched)
})

// ─── GET /api/sops/:id ────────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  const db = supabase()
  const [{ data, error }, userMap] = await Promise.all([
    db.from('sops').select('*').eq('id', req.params.id).single(),
    buildUserMap(db),
  ])
  if (error) return res.status(404).json({ error: 'SOP not found' })
  res.json({
    ...data,
    updated_by_name: userMap[data.updated_by] || userMap[data.created_by] || 'Team Member',
  })
})

// ─── GET /api/sops/:id/versions ───────────────────────────────────────────────
router.get('/:id/versions', authenticate, async (req, res) => {
  const db = supabase()
  const [{ data, error }, userMap] = await Promise.all([
    db.from('sop_versions')
      .select('*')
      .eq('sop_id', req.params.id)
      .order('version', { ascending: false }),
    buildUserMap(db),
  ])
  if (error) return res.status(500).json({ error: error.message })
  const enriched = (data || []).map(v => ({
    ...v,
    updated_by_name: userMap[v.updated_by] || 'Team Member',
  }))
  res.json(enriched)
})

// ─── POST /api/sops ───────────────────────────────────────────────────────────
router.post('/', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { title, category, content, pdf_path, video_url, status, visibility } = req.body
  if (!title) return res.status(400).json({ error: 'title is required' })

  const { data, error } = await supabase()
    .from('sops')
    .insert({
      title,
      category: category || 'general',
      content: content || null,
      pdf_path: pdf_path || null,
      video_url: video_url || null,
      status: status || 'draft',
      visibility: visibility || 'all',
      version: 1,
      created_by: req.user.id,
      updated_by: req.user.id,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── PUT /api/sops/:id ────────────────────────────────────────────────────────
router.put('/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { title, category, content, pdf_path, video_url, status, visibility } = req.body
  const db = supabase()

  // Fetch current SOP to save a version snapshot
  const { data: current, error: fetchErr } = await db
    .from('sops')
    .select('*')
    .eq('id', req.params.id)
    .single()

  if (fetchErr) return res.status(404).json({ error: 'SOP not found' })

  // Save version snapshot of the content being replaced
  if (current.content !== undefined) {
    await db.from('sop_versions').insert({
      sop_id: req.params.id,
      version: current.version,
      content: current.content,
      updated_by: current.updated_by,
      updated_at: current.updated_at,
    })
  }

  const newVersion = current.version + 1
  const { data, error } = await db
    .from('sops')
    .update({
      title: title ?? current.title,
      category: category ?? current.category,
      content: content !== undefined ? content : current.content,
      pdf_path: pdf_path !== undefined ? pdf_path : current.pdf_path,
      video_url: video_url !== undefined ? video_url : current.video_url,
      status: status ?? current.status,
      visibility: visibility ?? current.visibility,
      version: newVersion,
      updated_by: req.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── DELETE /api/sops/:id ─────────────────────────────────────────────────────
router.delete('/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await supabase()
    .from('sops')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

module.exports = router
