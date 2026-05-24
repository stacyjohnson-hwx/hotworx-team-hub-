const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { sendEmail } = require('../services/eodEmail')

// All DB access goes through the Supabase JS client (HTTPS / REST API),
// not a direct pg connection — avoids IPv6 issues on Railway.
function adminClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function tempPassword() {
  return `HW${Math.random().toString(36).slice(2, 8).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}!`
}

async function getProfile(supabase, userId) {
  const { data } = await supabase.from('user_profiles').select('*').eq('id', userId).single()
  return data || {}
}

function formatUser(u, p, roleOverride) {
  return {
    id:                      u.id,
    email:                   u.email,
    name:                    p.full_name || u.user_metadata?.full_name || u.email?.split('@')[0] || 'Team Member',
    role:                    roleOverride || u.app_metadata?.role || 'tsa',
    phone:                   p.phone || null,
    birthday:                p.birthday || null,
    avatar_url:              p.avatar_url || u.user_metadata?.avatar_url || null,
    is_active:               p.is_active !== false,
    onboarding_completed_at: p.onboarding_completed_at || null,
    quiz_answers:            p.quiz_answers || {},
    created_at:              u.created_at,
  }
}

// ─── Own profile endpoints ────────────────────────────────────────────────────

// GET /api/users/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const supabase = adminClient()
    const p = await getProfile(supabase, req.user.id)
    res.json(formatUser(req.user, p, req.role))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/users/me
router.put('/me', authenticate, async (req, res) => {
  const { full_name, phone, birthday, avatar_url } = req.body
  try {
    const supabase = adminClient()
    const existing = await getProfile(supabase, req.user.id)

    const { error: upsertErr } = await supabase.from('user_profiles').upsert({
      id:         req.user.id,
      full_name:  full_name  || existing.full_name  || null,
      phone:      phone      || existing.phone      || null,
      birthday:   birthday   || existing.birthday   || null,
      avatar_url: avatar_url || existing.avatar_url || null,
    }, { onConflict: 'id' })
    if (upsertErr) throw new Error(upsertErr.message)

    if (full_name) {
      await supabase.auth.admin.updateUserById(req.user.id, {
        user_metadata: { ...req.user.user_metadata, full_name },
      })
    }

    const p = await getProfile(supabase, req.user.id)
    res.json(formatUser(req.user, p, req.role))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/users/me/quiz — save quiz answers + optionally complete onboarding
router.put('/me/quiz', authenticate, async (req, res) => {
  const { quiz_answers = {}, complete_onboarding = true } = req.body
  const birthday = quiz_answers.birthday || null
  try {
    const supabase = adminClient()
    const existing = await getProfile(supabase, req.user.id)

    const { error } = await supabase.from('user_profiles').upsert({
      id:                      req.user.id,
      quiz_answers,
      birthday:                birthday || existing.birthday || null,
      onboarding_completed_at: complete_onboarding
        ? new Date().toISOString()
        : existing.onboarding_completed_at || null,
    }, { onConflict: 'id' })
    if (error) throw new Error(error.message)

    const p = await getProfile(supabase, req.user.id)
    res.json(p)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Admin / user-management endpoints ───────────────────────────────────────

// GET /api/users — list all studio users merged with profiles
router.get('/', authenticate, async (req, res) => {
  try {
    const supabase = adminClient()
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 200 })
    if (error) return res.status(500).json({ error: error.message })

    const { data: profiles } = await supabase.from('user_profiles').select('*')
    const pm = Object.fromEntries((profiles || []).map(p => [p.id, p]))

    res.json(users.map(u => formatUser(u, pm[u.id] || {})))
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
  if (req.role === 'manager' && role !== 'tsa') {
    return res.status(403).json({ error: 'Managers can only create TSA accounts' })
  }
  if (!['owner', 'manager', 'tsa'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' })
  }

  const pwd = tempPassword()
  try {
    const supabase = adminClient()
    const { data: { user }, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password:      pwd,
      email_confirm: true,
      user_metadata: { full_name },
      app_metadata:  { role },
    })
    if (createErr) return res.status(400).json({ error: createErr.message })

    await supabase.from('user_profiles').upsert(
      { id: user.id, full_name, phone: phone || null, birthday: birthday || null },
      { onConflict: 'id', ignoreDuplicates: true }
    )

    res.json({
      id: user.id, email: user.email, name: full_name, role,
      phone: phone || null, birthday: birthday || null,
      is_active: true, temp_password: pwd, onboarding_completed_at: null,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/users/:id — update any user (owner/manager only)
router.put('/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { id } = req.params
  const { full_name, role, phone, birthday } = req.body

  if (req.role === 'manager' && role && role !== 'tsa') {
    return res.status(403).json({ error: 'Managers can only assign TSA role' })
  }

  try {
    const supabase = adminClient()
    const authUpdates = {}
    if (full_name) authUpdates.user_metadata = { full_name }
    if (role)      authUpdates.app_metadata  = { role }
    if (Object.keys(authUpdates).length) {
      const { error } = await supabase.auth.admin.updateUserById(id, authUpdates)
      if (error) return res.status(400).json({ error: error.message })
    }

    const existing = await getProfile(supabase, id)
    await supabase.from('user_profiles').upsert({
      id,
      full_name: full_name || existing.full_name || null,
      phone:     phone     || existing.phone     || null,
      birthday:  birthday  || existing.birthday  || null,
    }, { onConflict: 'id' })

    const p = await getProfile(supabase, id)
    res.json({ id, name: p.full_name, role: role || existing.role, phone: p.phone, birthday: p.birthday, is_active: p.is_active })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/users/:id/deactivate
router.patch('/:id/deactivate', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { id } = req.params
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot deactivate your own account' })
  try {
    const supabase = adminClient()
    const { error } = await supabase.auth.admin.updateUserById(id, { ban_duration: '876000h' })
    if (error) return res.status(400).json({ error: error.message })
    await supabase.from('user_profiles').update({ is_active: false }).eq('id', id)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/users/:id/reactivate
router.patch('/:id/reactivate', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { id } = req.params
  try {
    const supabase = adminClient()
    const { error } = await supabase.auth.admin.updateUserById(id, { ban_duration: 'none' })
    if (error) return res.status(400).json({ error: error.message })
    await supabase.from('user_profiles').update({ is_active: true }).eq('id', id)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/users/:id/reset-password
router.post('/:id/reset-password', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const { id } = req.params
  try {
    const supabase = adminClient()
    const { data: { user }, error: userErr } = await supabase.auth.admin.getUserById(id)
    if (userErr || !user) return res.status(404).json({ error: 'User not found' })

    const redirectTo = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: user.email,
      options: { redirectTo },
    })
    if (error) return res.status(400).json({ error: error.message })

    const resetLink = data?.properties?.action_link
    if (resetLink) {
      await sendEmail({
        to: user.email,
        subject: `${process.env.STUDIO_NAME || 'HOTWORX Pewaukee'} — Password Reset`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
            <h2 style="color:#C8102E;margin-bottom:8px;">Password Reset</h2>
            <p style="color:#374151;">Hi ${user.user_metadata?.full_name || user.email},</p>
            <p style="color:#374151;">Click the button below to reset your HOTWORX Team Hub password. This link expires in 1 hour.</p>
            <a href="${resetLink}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#C8102E;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">Reset My Password</a>
            <p style="color:#6b7280;font-size:13px;">If you didn't request this, ignore this email.</p>
          </div>
        `,
      })
    }

    res.json({ sent: !!resetLink, email: user.email })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
