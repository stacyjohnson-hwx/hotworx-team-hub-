/**
 * B2B Route Tests — covers:
 *  1. All 8 interaction types accepted (collab/drop/dm were broken before the DB fix)
 *  2. POST without type returns 400
 *  3. GET contacts and interactions return 200
 */

const request = require('supertest')
const { OWNER, TSA } = require('./helpers/testUsers')

jest.mock('../middleware/authMiddleware', () =>
  jest.fn((req, _res, next) => {
    req.user = global.__testUser ?? { id: '1', app_metadata: { role: 'owner' } }
    req.role = req.user.app_metadata?.role ?? 'owner'
    next()
  })
)

const mockContact = {
  id: 'contact-uuid-1234',
  business_name: 'Test Biz',
  status: 'follow_up',
  is_partner: true,
}
const mockInteraction = {
  id: 'int-1',
  contact_id: 'contact-uuid-1234',
  type: 'collab',
  notes: 'Test',
  logged_by: '00000000-0000-0000-0000-000000000001',
  logged_at: '2026-05-29T17:00:00Z',
}

jest.mock('@supabase/supabase-js', () => {
  const makeChain = (rows, singleRow) => {
    const c = {
      select:  () => c,
      insert:  () => c,
      update:  () => c,
      eq:      () => c,
      neq:     () => c,
      in:      () => c,
      order:   () => c,
      limit:   () => c,
      single:  () => Promise.resolve({ data: singleRow ?? rows[0] ?? null, error: null }),
      then:    (fn) => Promise.resolve({ data: rows, error: null }).then(fn),
    }
    return c
  }
  return {
    createClient: () => ({
      from: (table) => {
        if (table === 'b2b_contacts')     return makeChain([mockContact], mockContact)
        if (table === 'b2b_interactions') return makeChain([mockInteraction], mockInteraction)
        return makeChain([])
      },
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: '1', app_metadata: { role: 'owner' } } }, error: null }),
        admin: {
          getUserById: () => Promise.resolve({ data: { user: { user_metadata: {}, email: 'test@example.com' } } }),
          listUsers: () => Promise.resolve({ data: { users: [] }, error: null }),
        },
      },
    }),
  }
})

const app = require('../app')
const CONTACT_ID = 'contact-uuid-1234'

beforeEach(() => { global.__testUser = OWNER })
afterAll(() => { delete global.__testUser })

describe('B2B interaction types', () => {
  const ALL_TYPES = ['call', 'email', 'visit', 'meeting', 'collab', 'drop', 'dm', 'other']

  test.each(ALL_TYPES)('type "%s" is accepted without error', async (type) => {
    const res = await request(app)
      .post(`/api/b2b/contacts/${CONTACT_ID}/interactions`)
      .set('Authorization', 'Bearer fake-token')
      .send({ type, notes: 'Test', logged_at: '2026-05-29T12:00:00Z' })
    expect(res.status).toBeLessThan(400)
  })

  test('missing type returns 400', async () => {
    const res = await request(app)
      .post(`/api/b2b/contacts/${CONTACT_ID}/interactions`)
      .set('Authorization', 'Bearer fake-token')
      .send({ notes: 'No type provided' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/type/)
  })
})

describe('B2B contact endpoints', () => {
  test('GET /api/b2b/contacts returns 200', async () => {
    const res = await request(app)
      .get('/api/b2b/contacts')
      .set('Authorization', 'Bearer fake-token')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  test('GET /api/b2b/contacts/:id/interactions returns 200', async () => {
    const res = await request(app)
      .get(`/api/b2b/contacts/${CONTACT_ID}/interactions`)
      .set('Authorization', 'Bearer fake-token')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})
