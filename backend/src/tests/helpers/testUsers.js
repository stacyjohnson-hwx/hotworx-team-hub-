// Fake user objects for each role — mirrors what authMiddleware sets on req.user
const OWNER = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'stacy.johnson@hotworx.net',
  app_metadata: { role: 'owner' },
}

const MANAGER = {
  id: '00000000-0000-0000-0000-000000000002',
  email: 'manager.wi0009@hotworx.net',
  app_metadata: { role: 'manager' },
}

const TSA = {
  id: '00000000-0000-0000-0000-000000000003',
  email: 'cmblawat@gmail.com',
  app_metadata: { role: 'tsa' },
}

// Inject a fake user directly onto req, bypassing JWT verification.
// Call mockAuth(user) before requiring the app in a test, OR patch it
// by overriding the middleware module in jest.mock().
function makeMockAuthMiddleware(user) {
  return (req, _res, next) => {
    req.user = user
    req.role = user.app_metadata?.role ?? null
    next()
  }
}

module.exports = { OWNER, MANAGER, TSA, makeMockAuthMiddleware }
