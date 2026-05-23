const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const db = require('../db/db')

function adminClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function tempPassword() {
  return `HW${Math.random().toString(36).slice(2, 8).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}!`
}

// ─── Own profile endpoints ────────────────────────────────────────────────────

// GET /api/users/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM user_profiles WHERE id = $1', [req.user.id])
    const p = rows[0] || {}
    res.json({
      id:                      req.user.id,
      email:                   req.user.email,
      name:                    p.full_name || req.user.user_metadata?.full_name || req.user.email?.split('@')[0] || 'Team Member',
      role:                    req.role,
      phone:                   p.phone || null,
      birthday:                p.birthday || null,
      avatar_url:              p.avatar_url || req.user.user_metadata?.avatar_url || null,
      is_active:               p.is_active !== false,
      onboarding_completed_at: p.onboarding_completed_at || null,
      quiz_answers:            p.quiz_answers || {},
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/users/me
router.put('/me', authenticate, async (req, res) => {
  const { full_name, phone, birthday, avatar_url } = req.body
  try {
    await db.query(`
      INSERT INTO user_profiles (id, full_name, phone, birthday, avatar_url)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        full_name  = COALESCE(EXCLUDED.full_name,  user_profiles.full_name),
        phone      = COALESCE(EXCLUDED.phone,      user_profiles.phone),
        birthday   = COALESCE(EXCLUDED.birthday,   user_profiles.birthday),
        avatar_url = COALESCE(EXCLUDED.avatar_url, user_profiles.avatar_url),
        updated_at = now()
    `, [req.user.id, full_name || null, phone || null, birthday || null, avatar_url || null])

    if (full_name) {
      const admin = adminClient()
      await admin.auth.admin.updateUserById(req.user.id, {
        user_metadata: { ...req.user.user_metadata, full_name },
      })
    }

    const { rows } = await db.query('SELECT * FROM user_profiles WHERE id = $1', [req.user.id])
    const p = rows[0]
    res.json({
      id:                      req.user.id,
      email:                   req.user.email,
      name:                    p.full_name,
      role:                    req.role,
      phone:                   p.phone,
      birthday:                p.birthday,
      avatar_url:              p.avatar_url,
      is_active:               p.is_active,
      onboarding_completed_at: p.onboarding_completed_at,
      quiz_answers:            p.quiz_answers,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/users/me/quiz  — save quiz + optionally complete onboarding
router.put('/me/quiz', authenticate, async (req, res) => {
  const { quiz_answers = {}, complete_onboarding = true } = req.body
  // Sync birthday from quiz_answers to the profile column
  const birthday = quiz_answers.birthday || null
  try {
    await db.query(`
      INSERT INTO user_profiles (id, quiz_answers, birthday, onboarding_completed_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
        quiz_answers            = EXCLUDED.quiz_answers,
        birthday                = COALESCE(EXCLUDED.birthday, user_profiles.birthday),
        onboarding_completed_at = CASE
          WHEN $4 IS NOT NULL AND user_profiles.onboarding_completed_at IS NULL
            THEN $4
          WHEN $4 IS NOT NULL THEN $4
          ELSE user_profiles.onboarding_completed_at
        END,
        updated_at = now()
    `, [req.user.id, JSON.stringify(quiz_answers), birthday, complete_onboarding ? new Date().toISOString() : null])

    const { rows } = await db.query('SELECT * FROM user_profiles WHERE id = $1', [req.user.id])
    res.json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Admin / user-management endpoints ───────────────────────────────────────

// GET /api/users — list all studio users merged with profiles
router.get('/', authenticate, async (req, res) => {
  try {
    const admin = adminClient()
    const { data: { users }, error } = await admin.auth.admin.listUsers({ perPage: 200 })
    if (error) return res.status(500).json({ error: error.message })

    const { rows: profiles } = await db.query('SELECT * FROM user_profiles')
    const pm = Object.fromEntries(profiles.map(p => [p.id, p]))

    const result = users.map(u => {
      const p = pm[u.id] || {}
      return {
        id:                      u.id,
        email:                   u.email,
        name:                    p.full_name || u.user_metadata?.full_name || u.email?.split('@')[0] || 'Team Member',
        role:                    u.app_metadata?.role || 'tsa',
        phone:                   p.phone || null,
        birthday:                p.birthday || null,
        avatar_url:              p.avatar_url || u.user_metadata?.avatar_url || null,
        is_active:               p.is_active !== false,
        onboarding_completed_at: p.onboarding_completed_at || null,
        created_at:              u.created_at,
      }
    })

    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/users — create new team member
router.post('/', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { email, full_name, role = 'tsa', phone, birthday } = req.body
  if (!email?.trim() || !full_name?.trim()) {
    return res.status(400).json({ error: 'email and full_name are required' })
  }
  // Managers can only create TSAs
  if (req.role === 'manager' && role !== 'tsa') {
    return res.status(403).json({ error: 'Managers can only create TSA accounts' })
  }
  if (!['owner', 'manager', 'tsa'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' })
  }

  const pwd = tempPassword()
  try {
    const admin = adminClient()
    const { data: { user }, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: pwd,
      email_confirm: true,
      user_metadata: { full_name },
      app_metadata:  { role },
    })
    if (createErr) return res.status(400).json({ error: createErr.message })

    await db.query(`
      INSERT INTO user_profiles (id, full_name, phone, birthday)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO NOTHING
    `, [user.id, full_name, phone || null, birthday || null])

    res.json({
      id:           user.id,
      email:        user.email,
      name:         full_name,
      role,
      phone:        phone || null,
      birthday:     birthday || null,
      is_active:    true,
      temp_password: pwd,   // shown once in UI so owner can share
      onboarding_completed_at: null,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/users/:id — update any user (owner/manager)
router.put('/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { id } = req.params
  const { full_name, role, phone, birthday } = req.body

  // Managers can't change roles to non-TSA
  if (req.role === 'manager' && role && role !== 'tsa') {
    return res.status(403).json({ error: 'Managers can only assign TSA role' })
  }

  try {
    const admin = adminClient()
    const updates = {}
    if (full_name) updates.user_metadata = { full_name }
    if (role)      updates.app_metadata  = { role }
    if (Object.keys(updates).length) {
      const { error } = await admin.auth.admin.updateUserById(id, updates)
      if (error) return res.status(400).json({ error: error.message })
    }

    await db.query(`
      INSERT INTO user_profiles (id, full_name, phone, birthday)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
        full_name  = COALESCE(EXCLUDED.full_name,  user_profiles.full_name),
        phone      = COALESCE(EXCLUDED.phone,      user_profiles.phone),
        birthday   = COALESCE(EXCLUDED.birthday,   user_profiles.birthday),
        updated_at = now()
    `, [id, full_name || null, phone || null, birthday || null])

    const { rows } = await db.query('SELECT * FROM user_profiles WHERE id = $1', [id])
    const p = rows[0] || {}
    res.json({ id, name: p.full_name, role: role || p.role, phone: p.phone, birthday: p.birthday, is_active: p.is_active })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/users/:id/deactivate
router.patch('/:id/deactivate', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { id } = req.params
  // Don't let anyone deactivate themselves
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot deactivate your own account' })
  try {
    const admin = adminClient()
    const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: '876000h' })
    if (error) return res.status(400).json({ error: error.message })
    await db.query('UPDATE user_profiles SET is_active = FALSE, updated_at = now() WHERE id = $1', [id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/users/:id/reactivate
router.patch('/:id/reactivate', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { id } = req.params
  try {
    const admin = adminClient()
    const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: 'none' })
    if (error) return res.status(400).json({ error: error.message })
    await db.query('UPDATE user_profiles SET is_active = TRUE, updated_at = now() WHERE id = $1', [id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/users/:id/reset-password — send password reset email
router.post('/:id/reset-password', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { id } = req.params
  try {
    const admin = adminClient()
    const { data: { user }, error: userErr } = await admin.auth.admin.getUserById(id)
    if (userErr || !user) return res.status(404).json({ error: 'User not found' })

    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: user.email,
    })
    if (error) return res.status(400).json({ error: error.message })
    res.json({ reset_link: data?.properties?.action_link || null })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
