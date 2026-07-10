function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.role || !roles.includes(req.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    next()
  }
}

// Platform super-admin gate — for cross-studio SaaS provisioning (not studio-scoped).
function requirePlatformAdmin(req, res, next) {
  if (!req.isPlatformAdmin) {
    return res.status(403).json({ error: 'Platform admin only' })
  }
  next()
}

module.exports = { requireRole, requirePlatformAdmin }
