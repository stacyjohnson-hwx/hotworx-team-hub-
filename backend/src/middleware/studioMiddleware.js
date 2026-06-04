const { createClient } = require('@supabase/supabase-js')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

/**
 * Middleware to extract and validate studio context from request headers.
 * Expects X-Studio-ID header and verifies user has access to that studio.
 */
async function requireStudio(req, res, next) {
  const studioId = req.headers['x-studio-id']

  if (!studioId) {
    return res.status(400).json({ error: 'Studio ID required (X-Studio-ID header)' })
  }

  try {
    // Verify user has access to this studio
    const { data, error } = await db()
      .from('user_studios')
      .select('role, studios(code, name)')
      .eq('user_id', req.user.id)
      .eq('studio_id', studioId)
      .single()

    if (error || !data) {
      return res.status(403).json({ error: 'No access to this studio' })
    }

    // Attach studio context to request
    req.studio = {
      id: studioId,
      role: data.role,
      code: data.studios.code,
      name: data.studios.name,
    }

    next()
  } catch (err) {
    return res.status(500).json({ error: 'Failed to validate studio access' })
  }
}

module.exports = { requireStudio }
