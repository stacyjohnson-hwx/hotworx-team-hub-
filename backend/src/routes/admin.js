// Platform (SaaS) super-admin API — provisions and lists franchisee instances.
// These routes are cross-studio: they run behind authenticate + requirePlatformAdmin
// and deliberately do NOT use requireStudio (the admin acts across all studios and is
// not a member of the studios being created).

const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requirePlatformAdmin } = require('../middleware/roleGuard')
const { seedStudio } = require('../services/seedStudio')

function adminClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// Same shape as the team-member temp password (users.js) — shown once to the admin.
function tempPassword() {
  return `HW${Math.random().toString(36).slice(2, 8).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}!`
}

router.use(authenticate, requirePlatformAdmin)

// GET /api/admin/studios — every studio with its owner(s) and member count.
router.get('/studios', async (req, res) => {
  const sb = adminClient()
  const { data: studios, error } = await sb.from('studios').select('*').order('created_at', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })

  const [{ data: memberships }, { data: { users } }] = await Promise.all([
    sb.from('user_studios').select('studio_id, user_id, role'),
    sb.auth.admin.listUsers({ perPage: 1000 }),
  ])
  const emailOf = {}
  for (const u of users || []) emailOf[u.id] = u.email || u.user_metadata?.full_name || u.id

  const byStudio = {}
  for (const m of memberships || []) {
    const s = byStudio[m.studio_id] || (byStudio[m.studio_id] = { members: 0, owners: [] })
    s.members++
    if (m.role === 'owner') s.owners.push(emailOf[m.user_id] || m.user_id)
  }
  res.json((studios || []).map(s => ({
    ...s,
    member_count: byStudio[s.id]?.members || 0,
    owners: byStudio[s.id]?.owners || [],
  })))
})

// GET /api/admin/studios/:id — studio detail + its members.
router.get('/studios/:id', async (req, res) => {
  const sb = adminClient()
  const { data: studio, error } = await sb.from('studios').select('*').eq('id', req.params.id).maybeSingle()
  if (error) return res.status(500).json({ error: error.message })
  if (!studio) return res.status(404).json({ error: 'Studio not found' })

  const [{ data: memberships }, { data: { users } }] = await Promise.all([
    sb.from('user_studios').select('user_id, role').eq('studio_id', req.params.id),
    sb.auth.admin.listUsers({ perPage: 1000 }),
  ])
  const umap = {}
  for (const u of users || []) umap[u.id] = { email: u.email, name: u.user_metadata?.full_name }
  const members = (memberships || []).map(m => ({ user_id: m.user_id, role: m.role, ...(umap[m.user_id] || {}) }))
  res.json({ ...studio, members })
})

// POST /api/admin/provision — stand up a new franchisee end to end:
// studio row → owner auth user → profile → owner membership → seed starter libraries.
// Ordered + idempotent (unique studios.code, seed skips populated tables) so a retry resumes.
router.post('/provision', async (req, res) => {
  const studio = req.body?.studio || {}
  const owner = req.body?.owner || {}
  const code = String(studio.code || '').trim()
  const name = String(studio.name || '').trim()
  const email = String(owner.email || '').trim().toLowerCase()
  const full_name = String(owner.full_name || '').trim()

  if (!code || !name) return res.status(400).json({ error: 'Studio code and name are required' })
  if (!email || !full_name) return res.status(400).json({ error: 'Owner email and full name are required' })

  const sb = adminClient()

  // Up-front conflict checks for friendly errors (DB unique index on code is the backstop).
  const { data: dupStudio } = await sb.from('studios').select('id').eq('code', code).maybeSingle()
  if (dupStudio) return res.status(409).json({ error: `A studio with code "${code}" already exists.` })
  const { data: { users: existingUsers } } = await sb.auth.admin.listUsers({ perPage: 1000 })
  if ((existingUsers || []).some(u => u.email?.toLowerCase() === email)) {
    return res.status(409).json({ error: `A user with email "${email}" already exists.` })
  }

  // 1) studio
  const { data: newStudio, error: sErr } = await sb.from('studios').insert({
    code, name,
    address: studio.address || null,
    timezone: studio.timezone || 'America/Chicago',
  }).select().single()
  if (sErr) return res.status(500).json({ error: `Create studio: ${sErr.message}` })

  // 2) owner auth user (global role 'owner'; not a platform admin)
  const pwd = tempPassword()
  const { data: created, error: uErr } = await sb.auth.admin.createUser({
    email, password: pwd, email_confirm: true,
    user_metadata: { full_name }, app_metadata: { role: 'owner' },
  })
  if (uErr || !created?.user) {
    await sb.from('studios').delete().eq('id', newStudio.id)   // roll back so a retry with same code works
    return res.status(400).json({ error: `Create owner: ${uErr?.message || 'unknown error'}` })
  }
  const ownerUser = created.user

  // 3) profile + 4) membership
  await sb.from('user_profiles').upsert({ id: ownerUser.id, full_name }, { onConflict: 'id', ignoreDuplicates: true })
  const { error: mErr } = await sb.from('user_studios').insert({ user_id: ownerUser.id, studio_id: newStudio.id, role: 'owner' })
  if (mErr) return res.status(500).json({ error: `Assign owner to studio: ${mErr.message}` })

  // 5) seed starter libraries (non-fatal; re-runnable via a repeat provision on the same code)
  let seed
  try { seed = await seedStudio(sb, newStudio.id) }
  catch (e) { seed = { ok: false, error: e.message } }

  res.status(201).json({
    studio: newStudio,
    owner: { id: ownerUser.id, email: ownerUser.email, full_name, temp_password: pwd },
    seed,
  })
})

module.exports = router
