const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')

// GET /api/users — list all studio users (id, name, email, role)
router.get('/', authenticate, async (req, res) => {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await db.auth.admin.listUsers()
  if (error) return res.status(500).json({ error: error.message })

  const users = data.users.map(u => ({
    id: u.id,
    email: u.email,
    name: u.user_metadata?.full_name || u.email?.split('@')[0] || 'Team Member',
    role: u.app_metadata?.role || 'tsa',
  }))

  res.json(users)
})

module.exports = router
