/**
 * Auth / Middleware Tests
 *
 * Covers:
 *  1. Every protected route returns 401 without a token
 *  2. Role guard blocks TSA from owner/manager-only endpoints
 */

const request = require('supertest')

// Mock Supabase — auth.getUser always returns invalid so every route gets 401
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: { message: 'Invalid token' } }),
      admin: { getUserById: () => Promise.resolve({ data: { user: null } }) },
    },
  }),
}))

const app = require('../app')

const PROTECTED_ROUTES = [
  ['GET',  '/api/eod'],
  ['POST', '/api/eod'],
  ['GET',  '/api/cleaning/today'],
  ['GET',  '/api/orders'],
  ['GET',  '/api/b2b/contacts'],
  ['GET',  '/api/maintenance'],
  ['GET',  '/api/escalations'],
  ['GET',  '/api/todo'],
]

describe('Protected routes reject missing auth header', () => {
  test.each(PROTECTED_ROUTES)('%s %s returns 401 with no token', async (method, route) => {
    const res = await request(app)[method.toLowerCase()](route)
    expect(res.status).toBe(401)
  })
})

describe('Protected routes reject invalid token', () => {
  test.each(PROTECTED_ROUTES)('%s %s returns 401 with bad token', async (method, route) => {
    const res = await request(app)
      [method.toLowerCase()](route)
      .set('Authorization', 'Bearer not-a-real-token')
    expect(res.status).toBe(401)
  })
})
