/**
 * EOD Route Tests — covers the bugs we actually found and fixed:
 *  1. Tasks must key by date only (not user+date) — shared studio checklist
 *  2. Tasks completed by any TSA appear on every EOD for that day
 *  3. Validation: missing shift_type → 400; opening shift → 400
 */

const request = require('supertest')
const { OWNER, MANAGER, TSA } = require('./helpers/testUsers')

// ─── Mock auth (factory can't reference imported vars — inline them) ──────────
jest.mock('../middleware/authMiddleware', () =>
  jest.fn((req, _res, next) => {
    req.user = global.__testUser ?? {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'stacy.johnson@hotworx.net',
      app_metadata: { role: 'owner' },
    }
    req.role = req.user.app_metadata?.role ?? 'owner'
    next()
  })
)

// ─── Mock Supabase — tests set these globals to control responses ─────────────
global.mockEodRows     = []
global.mockCompletions = []
global.mockTasks       = []

jest.mock('@supabase/supabase-js', () => {
  const makeChain = (getRows) => {
    const c = {
      select:  () => c,
      insert:  () => c,
      update:  () => c,
      upsert:  () => c,
      delete:  () => c,
      eq:      () => c,
      neq:     () => c,
      gte:     () => c,
      lte:     () => c,
      in:      () => c,
      order:   () => c,
      limit:   () => c,
      single:  () => Promise.resolve({ data: (getRows())[0] ?? null, error: null }),
      then:    (fn) => Promise.resolve({ data: getRows(), error: null }).then(fn),
    }
    return c
  }

  return {
    createClient: () => ({
      from: (table) => {
        if (table === 'eod_submissions')      return makeChain(() => global.mockEodRows)
        if (table === 'cleaning_completions') return makeChain(() => global.mockCompletions)
        if (table === 'cleaning_tasks')       return makeChain(() => global.mockTasks)
        return makeChain(() => [])
      },
      auth: {
        admin: {
          getUserById: () => Promise.resolve({
            data: { user: { user_metadata: { full_name: 'Test User' }, email: 'test@example.com' } },
          }),
        },
        getUser: () => Promise.resolve({
          data: { user: { id: '1', app_metadata: { role: 'owner' } } }, error: null,
        }),
      },
    }),
  }
})

const app = require('../app')

const SHIFT_DATE = '2026-05-26'

beforeEach(() => {
  global.__testUser    = OWNER
  global.mockEodRows     = []
  global.mockCompletions = []
  global.mockTasks       = []
})
afterAll(() => { delete global.__testUser })

// ─── Tests ───────────────────────────────────────────────────────────────────
describe('GET /api/eod — task matching', () => {
  test('returns empty array when no submissions exist', async () => {
    const res = await request(app)
      .get(`/api/eod?date=${SHIFT_DATE}`)
      .set('Authorization', 'Bearer fake-token')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  test('tasks completed by ANY user on shift_date appear on the EOD (shared checklist)', async () => {
    const submittingUser = TSA.id
    const otherUser      = '00000000-0000-0000-0000-000000000099'

    global.mockEodRows = [{
      id: 'eod-1', submitted_by: submittingUser, shift_date: SHIFT_DATE,
      shift_type: 'closing', drawer_start: 100, cash_collected: 50,
      credit_collected: 0, drawer_end: 150, mission_titles: [],
    }]
    // Task completed by a DIFFERENT user than who submitted EOD
    global.mockCompletions = [
      { task_id: 'task-op',  completed_by: otherUser,      completion_date: SHIFT_DATE },
      { task_id: 'task-cl',  completed_by: submittingUser, completion_date: SHIFT_DATE },
    ]
    global.mockTasks = [
      { id: 'task-op', title: 'Studio Walk Through', task_type: 'Operations' },
      { id: 'task-cl', title: 'Sanitize Pods',        task_type: 'Cleaning'   },
    ]

    const res = await request(app)
      .get(`/api/eod?date=${SHIFT_DATE}`)
      .set('Authorization', 'Bearer fake-token')

    expect(res.status).toBe(200)
    const sub = res.body[0]
    // Both tasks should appear even though one was completed by a different user
    expect(sub.completed_operations).toContain('Studio Walk Through')
    expect(sub.completed_cleaning).toContain('Sanitize Pods')
  })

  test('correctly splits Operations vs Cleaning task_type', async () => {
    global.mockEodRows = [{
      id: 'eod-1', submitted_by: TSA.id, shift_date: SHIFT_DATE,
      shift_type: 'mid', drawer_start: 0, cash_collected: 0,
      credit_collected: 0, drawer_end: 0, mission_titles: [],
    }]
    global.mockCompletions = [
      { task_id: 'op-1', completed_by: TSA.id, completion_date: SHIFT_DATE },
      { task_id: 'cl-1', completed_by: TSA.id, completion_date: SHIFT_DATE },
    ]
    global.mockTasks = [
      { id: 'op-1', title: 'Clock In',       task_type: 'Operations' },
      { id: 'cl-1', title: 'Clean Restroom', task_type: 'Cleaning'   },
    ]

    const res = await request(app)
      .get(`/api/eod?date=${SHIFT_DATE}`)
      .set('Authorization', 'Bearer fake-token')

    const sub = res.body[0]
    expect(sub.completed_operations).toEqual(['Clock In'])
    expect(sub.completed_cleaning).toEqual(['Clean Restroom'])
  })

  test('tasks whose task_id no longer exists in library are silently skipped', async () => {
    global.mockEodRows = [{
      id: 'eod-1', submitted_by: TSA.id, shift_date: SHIFT_DATE,
      shift_type: 'mid', drawer_start: 0, cash_collected: 0,
      credit_collected: 0, drawer_end: 0, mission_titles: [],
    }]
    global.mockCompletions = [
      { task_id: 'ghost-task', completed_by: TSA.id, completion_date: SHIFT_DATE },
    ]
    global.mockTasks = [] // task deleted from library

    const res = await request(app)
      .get(`/api/eod?date=${SHIFT_DATE}`)
      .set('Authorization', 'Bearer fake-token')

    const sub = res.body[0]
    expect(sub.completed_cleaning).toEqual([])
    expect(sub.completed_operations).toEqual([])
  })
})

describe('POST /api/eod — input validation', () => {
  test('returns 400 when shift_type is missing', async () => {
    const res = await request(app)
      .post('/api/eod')
      .set('Authorization', 'Bearer fake-token')
      .send({ drawer_start: 100 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/shift_type/)
  })

  test('returns 400 when shift_type is "opening" (not supported)', async () => {
    const res = await request(app)
      .post('/api/eod')
      .set('Authorization', 'Bearer fake-token')
      .send({ shift_type: 'opening' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Opening/)
  })
})
