/**
 * Orders Route Tests — covers TSA permission fix:
 *  - TSA can ONLY transition ordered → received
 *  - TSA gets 403 for any other status change
 *  - Owner/manager can make any update
 */

const request = require('supertest')
const { OWNER, MANAGER, TSA } = require('./helpers/testUsers')

// Inline user objects in factory (jest hoists mock above imports)
const mockOwner   = { id: '00000000-0000-0000-0000-000000000001', email: 'stacy@test.com',   app_metadata: { role: 'owner'   } }
const mockManager = { id: '00000000-0000-0000-0000-000000000002', email: 'manager@test.com', app_metadata: { role: 'manager' } }
const mockTSA     = { id: '00000000-0000-0000-0000-000000000003', email: 'tsa@test.com',     app_metadata: { role: 'tsa'     } }

jest.mock('../middleware/authMiddleware', () =>
  jest.fn((req, _res, next) => {
    req.user = global.__testUser ?? { id: '1', app_metadata: { role: 'owner' } }
    req.role = req.user.app_metadata?.role ?? 'owner'
    next()
  })
)

jest.mock('@supabase/supabase-js', () => {
  return {
    createClient: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: global.mockCurrentOrder, error: null }),
          }),
        }),
        update: (data) => ({
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({
                data: { ...global.mockCurrentOrder, ...data },
                error: null,
              }),
            }),
          }),
        }),
      }),
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

beforeEach(() => {
  global.__testUser = OWNER
  global.mockCurrentOrder = {
    id: 'order-1',
    item_name: 'Paper Towels',
    status: 'ordered',
    requested_by: TSA.id,
    quantity: 2,
    category: 'supplies',
    notes: null,
    vendor: null,
    est_cost: null,
  }
})
afterAll(() => { delete global.__testUser })

describe('PUT /api/orders/:id — TSA role restrictions', () => {
  test('TSA can mark an ordered item as received', async () => {
    global.__testUser = mockTSA
    const res = await request(app)
      .put('/api/orders/order-1')
      .set('Authorization', 'Bearer fake-token')
      .send({ status: 'received' })
    expect(res.status).toBe(200)
  })

  test('TSA gets 403 when trying to approve a pending order', async () => {
    global.__testUser = mockTSA
    global.mockCurrentOrder.status = 'pending'
    const res = await request(app)
      .put('/api/orders/order-1')
      .set('Authorization', 'Bearer fake-token')
      .send({ status: 'approved' })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/TSA can only/)
  })

  test('TSA gets 403 when trying to mark received on a non-ordered item', async () => {
    global.__testUser = mockTSA
    global.mockCurrentOrder.status = 'pending' // wrong starting state
    const res = await request(app)
      .put('/api/orders/order-1')
      .set('Authorization', 'Bearer fake-token')
      .send({ status: 'received' })
    expect(res.status).toBe(403)
  })

  test('TSA gets 403 when trying to cancel an order', async () => {
    global.__testUser = mockTSA
    const res = await request(app)
      .put('/api/orders/order-1')
      .set('Authorization', 'Bearer fake-token')
      .send({ status: 'cancelled' })
    expect(res.status).toBe(403)
  })

  test('owner can transition to any status', async () => {
    global.__testUser = mockOwner
    global.mockCurrentOrder.status = 'pending'
    const res = await request(app)
      .put('/api/orders/order-1')
      .set('Authorization', 'Bearer fake-token')
      .send({ status: 'approved', item_name: 'Paper Towels', quantity: 2, category: 'supplies' })
    expect(res.status).toBe(200)
  })

  test('manager can transition to any status', async () => {
    global.__testUser = mockManager
    const res = await request(app)
      .put('/api/orders/order-1')
      .set('Authorization', 'Bearer fake-token')
      .send({ status: 'received', item_name: 'Paper Towels', quantity: 2, category: 'supplies' })
    expect(res.status).toBe(200)
  })
})
