const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Members joining on/after this date are "new members" (journey scope gate, PRD §6.1).
const LAUNCH_DATE = process.env.ONBOARDING_LAUNCH_DATE || '2026-06-01'
// Consecutive missing-from-roster imports before a member is flagged for Lead review (PRD §5.2b).
const ROSTER_ABSENCE_LIMIT = parseInt(process.env.ONBOARDING_ROSTER_ABSENCE_LIMIT) || 3

// ─── Parsing helpers ──────────────────────────────────────────────────────────
// SAIL CSV headers are messy (double-spaces, casing, junk "Action" column), so we
// match columns by a normalized key and tolerate several header spellings.
const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '')

function normalizeRow(row) {
  const out = {}
  for (const k of Object.keys(row || {})) out[norm(k)] = row[k]
  return out
}

function pick(nrow, candidates) {
  for (const c of candidates) {
    const key = norm(c)
    if (nrow[key] != null && String(nrow[key]).trim() !== '') return String(nrow[key]).trim()
  }
  return null
}

const YES = new Set(['yes', 'y', 'true', '1', 'active', 'signed', 'complete', 'completed'])
function parseBool(v) {
  if (v == null) return false
  return YES.has(String(v).trim().toLowerCase())
}

// Return 'YYYY-MM-DD' from the common SAIL formats (MM-DD-YYYY, M/D/YYYY, ISO), else null.
function parseDate(v) {
  if (!v) return null
  const s = String(v).trim()
  if (!s) return null
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)                 // ISO / YYYY-MM-DD
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)           // MM-DD-YYYY or M/D/YYYY
  if (m) {
    const mo = m[1].padStart(2, '0'), da = m[2].padStart(2, '0')
    return `${m[3]}-${mo}-${da}`
  }
  const d = new Date(s)
  if (!isNaN(d)) return d.toISOString().slice(0, 10)
  return null
}

const monthKeyOf = (dateStr) => (dateStr ? dateStr.slice(0, 7) : null)   // 'YYYY-MM'
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out }

// ─── POST /api/onboarding/import ──────────────────────────────────────────────
// One idempotent run. Accepts { bookings?, members?, cancelled? } as arrays of raw
// parsed CSV rows (objects keyed by header). Safe to re-run end to end.
router.post('/import', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const supabase = db()
  const studioId = req.studio.id
  const bookings  = Array.isArray(req.body.bookings)  ? req.body.bookings  : []
  const members   = Array.isArray(req.body.members)   ? req.body.members   : []
  const cancelled = Array.isArray(req.body.cancelled) ? req.body.cancelled : []

  const summary = { bookings: { received: bookings.length, upserted: 0, skipped: 0 },
                    members: { received: members.length, upserted: 0, skipped: 0 },
                    cancelled: { received: cancelled.length, ledgered: 0, skipped: 0 },
                    unreconciled: 0, months_recomputed: [] }

  try {
    // 1) Bookings → upsert on (studio_id, booking_id). No double counting on re-import.
    if (bookings.length) {
      const rows = []
      for (const raw of bookings) {
        const r = normalizeRow(raw)
        const idRaw = pick(r, ['Id', 'Booking Id', 'BookingId'])
        const booking_id = idRaw != null ? parseInt(String(idRaw).replace(/[^0-9]/g, ''), 10) : null
        if (!booking_id) { summary.bookings.skipped++; continue }
        rows.push({
          booking_id,
          studio_id: studioId,
          member_email: (pick(r, ['Email', 'Member Email']) || '').toLowerCase() || null,
          booking_date: parseDate(pick(r, ['Booking Date', 'Date', 'BookingDate'])),
          time_slot:    pick(r, ['Time Slot', 'Time', 'TimeSlot']),
          session_type: pick(r, ['Session Type', 'SessionType', 'Workout', 'Class']),
          home_studio:  pick(r, ['Home Studio', 'Studio', 'HomeStudio']),
          imported_at:  new Date().toISOString(),
        })
      }
      // De-dupe within the payload (last wins) so upsert never sees two rows w/ same PK.
      const byId = new Map()
      for (const row of rows) byId.set(row.booking_id, row)
      const deduped = [...byId.values()]
      for (const c of chunk(deduped, 500)) {
        const { error } = await supabase.from('onboarding_bookings').upsert(c, { onConflict: 'studio_id,booking_id' })
        if (error) throw new Error(`bookings upsert: ${error.message}`)
        summary.bookings.upserted += c.length
      }
    }

    // Load existing members once (for rejoin + roster-absence bookkeeping).
    const { data: existingMembers, error: emErr } = await supabase
      .from('onboarding_members').select('id, customer_id, is_cancelled, cancelled_date, roster_absent_days').eq('studio_id', studioId)
    if (emErr) throw new Error(`load members: ${emErr.message}`)
    const existingByCid = new Map((existingMembers || []).map(m => [m.customer_id, m]))

    // 2) Members → upsert on (studio_id, customer_id). Rejoin-aware.
    const rosterCids = new Set()
    if (members.length) {
      const rows = []
      for (const raw of members) {
        const r = normalizeRow(raw)
        const customer_id = pick(r, ['Customer Id', 'CustomerId', 'Customer ID'])
        if (!customer_id) { summary.members.skipped++; continue }
        rosterCids.add(customer_id)
        const join_date = parseDate(pick(r, ['SubscriptionDate', 'Subscription Date', 'Join Date', 'Start Date']))
        const status = pick(r, ['Status', 'Member Status'])
        const existing = existingByCid.get(customer_id)

        // Rejoin: a returning member reappears Active with a newer date → clear cancel flag.
        let is_cancelled = existing ? !!existing.is_cancelled : false
        let cancelled_date = existing ? existing.cancelled_date : null
        const activeish = status && /active/i.test(status)
        if (is_cancelled && activeish && join_date && cancelled_date && join_date > cancelled_date) {
          is_cancelled = false; cancelled_date = null
        }

        rows.push({
          studio_id: studioId,
          customer_id,
          subscription_id: pick(r, ['Subscription Id', 'SubscriptionId', 'Subscription ID']),
          full_name:       pick(r, ['Full Name', 'Name', 'Member Name', 'FullName']),
          primary_member:  pick(r, ['Primary Member', 'PrimaryMember', 'Primary']),
          email: (pick(r, ['Email']) || '').toLowerCase() || null,
          phone: pick(r, ['Phone No', 'Phone', 'PhoneNo', 'Mobile']),
          join_date,
          package_name: pick(r, ['Package Name', 'Package', 'Membership']),
          status,
          order_source: pick(r, ['Order Source', 'OrderSource', 'Source']),
          employee: pick(r, ['Employee', 'Enroller', 'Sold By']),
          member_onboarded: parseBool(pick(r, ['Member Onboarded', 'MemberOnboarded', 'Onboarded'])),
          agreement_signed: parseBool(pick(r, ['MembershipAgreementSigned', 'Agreement Signed', 'AgreementSigned'])),
          brivo_active: parseBool(pick(r, ['Brivo', 'Brivo Active', 'BrivoActive'])),
          is_new_member: !!(join_date && join_date >= LAUNCH_DATE),
          is_cancelled,
          cancelled_date,
          seen_in_last_import: true,
          roster_absent_days: 0,
          updated_at: new Date().toISOString(),
        })
      }
      const byCid = new Map()
      for (const row of rows) byCid.set(row.customer_id, row)
      const deduped = [...byCid.values()]
      for (const c of chunk(deduped, 500)) {
        const { error } = await supabase.from('onboarding_members').upsert(c, { onConflict: 'studio_id,customer_id' })
        if (error) throw new Error(`members upsert: ${error.message}`)
        summary.members.upserted += c.length
      }

      // Roster-absence backup flag: members present before but missing from this roster
      // get their absence counter bumped (never auto-cancel — a Lead reviews, PRD §5.2b).
      for (const m of (existingMembers || [])) {
        if (rosterCids.has(m.customer_id)) continue
        await supabase.from('onboarding_members')
          .update({ seen_in_last_import: false, roster_absent_days: (m.roster_absent_days || 0) + 1 })
          .eq('id', m.id)
      }
    }

    // 3) Cancelled → ledger (dedupe on customer_id+cancelled_date) + set member flags.
    const touchedMonths = new Set()
    if (cancelled.length) {
      const ledgerRows = []
      const cancelSet = []
      for (const raw of cancelled) {
        const r = normalizeRow(raw)
        const customer_id = pick(r, ['Customer Id', 'CustomerId', 'Customer ID'])
        const cancelled_date = parseDate(pick(r, ['Cancellation Date', 'Cancelled Date', 'CancellationDate', 'Cancel Date']))
        if (!customer_id || !cancelled_date) { summary.cancelled.skipped++; continue }
        const month_key = monthKeyOf(cancelled_date)
        touchedMonths.add(month_key)
        ledgerRows.push({
          studio_id: studioId, customer_id,
          member_name: pick(r, ['Name', 'Member Name', 'Full Name']),
          cancelled_date, month_key, source: 'export',
        })
        cancelSet.push({ customer_id, cancelled_date })
      }
      const byKey = new Map()
      for (const row of ledgerRows) byKey.set(`${row.customer_id}|${row.cancelled_date}`, row)
      const deduped = [...byKey.values()]
      for (const c of chunk(deduped, 500)) {
        const { error } = await supabase.from('onboarding_cancellation_ledger')
          .upsert(c, { onConflict: 'studio_id,customer_id,cancelled_date', ignoreDuplicates: true })
        if (error) throw new Error(`ledger upsert: ${error.message}`)
      }
      summary.cancelled.ledgered = deduped.length
      // Flag the members themselves (authoritative cancel signal).
      for (const c of chunk(cancelSet, 200)) {
        for (const { customer_id, cancelled_date } of c) {
          await supabase.from('onboarding_members')
            .update({ is_cancelled: true, cancelled_date })
            .eq('studio_id', studioId).eq('customer_id', customer_id)
        }
      }
    }

    // 5) Resolve unmatched bookings → members by email (then phone if present on the row).
    const { data: memForLink } = await supabase
      .from('onboarding_members').select('id, email, phone').eq('studio_id', studioId)
    const emailToId = new Map(), phoneToId = new Map()
    for (const m of memForLink || []) {
      if (m.email) emailToId.set(m.email.toLowerCase(), m.id)
      if (m.phone) phoneToId.set(String(m.phone).replace(/[^0-9]/g, ''), m.id)
    }
    const { data: unlinked } = await supabase
      .from('onboarding_bookings').select('booking_id, member_email').eq('studio_id', studioId).is('member_id', null)
    for (const c of chunk(unlinked || [], 200)) {
      for (const b of c) {
        const id = b.member_email ? emailToId.get(String(b.member_email).toLowerCase()) : null
        if (id) await supabase.from('onboarding_bookings').update({ member_id: id })
          .eq('studio_id', studioId).eq('booking_id', b.booking_id)
      }
    }
    const { count: stillNull } = await supabase
      .from('onboarding_bookings').select('booking_id', { count: 'exact', head: true })
      .eq('studio_id', studioId).is('member_id', null)
    summary.unreconciled = stillNull || 0

    // 6) Recompute Studio Trends (cancellations per touched month + current active count).
    const now = new Date()
    const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    touchedMonths.add(curKey)
    for (const mk of touchedMonths) {
      const [y, m] = mk.split('-').map(Number)
      await recomputeStudioTrends(supabase, studioId, m, y, mk === curKey)
      summary.months_recomputed.push(mk)
    }

    // Log the run.
    await supabase.from('onboarding_import_runs').insert({
      studio_id: studioId, run_by: req.user.email || req.user.id,
      bookings_count: summary.bookings.upserted,
      members_count: summary.members.upserted,
      cancelled_count: summary.cancelled.ledgered,
      unreconciled_count: summary.unreconciled,
      summary,
    })

    res.json(summary)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Recompute + resolve (override wins) the two Studio Trends numbers for one month.
// Writes the RESOLVED value into studio_trends so Goals (which reads it directly) stays correct.
async function recomputeStudioTrends(supabase, studioId, month, year, isCurrentMonth) {
  const mk = `${year}-${String(month).padStart(2, '0')}`

  const { count: computedCancels } = await supabase
    .from('onboarding_cancellation_ledger').select('id', { count: 'exact', head: true })
    .eq('studio_id', studioId).eq('month_key', mk).eq('excluded', false)

  const { data: overrides } = await supabase
    .from('onboarding_metric_overrides').select('metric, override_value')
    .eq('studio_id', studioId).eq('month_key', mk)
  const ovMap = new Map((overrides || []).map(o => [o.metric, o.override_value]))

  const fields = { month, year, studio_id: studioId, updated_at: new Date().toISOString() }
  fields.cancellations = ovMap.has('cancellations') ? ovMap.get('cancellations') : (computedCancels || 0)

  if (isCurrentMonth) {
    const { count: activeCount } = await supabase
      .from('onboarding_members').select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId).eq('is_cancelled', false).ilike('status', '%active%')
    fields.total_member_count = ovMap.has('active_members') ? ovMap.get('active_members') : (activeCount || 0)
  }

  await supabase.from('studio_trends').upsert(fields, { onConflict: 'studio_id, month, year' })
}

// ─── GET /api/onboarding/members ──────────────────────────────────────────────
router.get('/members', authenticate, requireStudio, async (req, res) => {
  const supabase = db()
  const [{ data: members, error }, { data: activity }] = await Promise.all([
    supabase.from('onboarding_members').select('*').eq('studio_id', req.studio.id).order('join_date', { ascending: false }),
    supabase.from('onboarding_member_activity').select('*').eq('studio_id', req.studio.id),
  ])
  if (error) return res.status(500).json({ error: error.message })
  const actMap = new Map((activity || []).map(a => [a.member_id, a]))
  res.json((members || []).map(m => {
    const a = actMap.get(m.id) || {}
    return { ...m,
      visit_days: a.visit_days || 0,
      total_sessions: a.total_sessions || 0,
      workouts_tried: a.workouts_tried || 0,
      last_booking_date: a.last_booking_date || null,
    }
  }))
})

// ─── GET /api/onboarding/unreconciled ─────────────────────────────────────────
router.get('/unreconciled', authenticate, requireStudio, async (req, res) => {
  const { data, error } = await db()
    .from('onboarding_bookings')
    .select('booking_id, member_email, booking_date, session_type')
    .eq('studio_id', req.studio.id).is('member_id', null)
    .order('booking_date', { ascending: false }).limit(500)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

// ─── Cancellation ledger ──────────────────────────────────────────────────────
router.get('/ledger', authenticate, requireStudio, async (req, res) => {
  let q = db().from('onboarding_cancellation_ledger').select('*')
    .eq('studio_id', req.studio.id).order('cancelled_date', { ascending: false })
  if (req.query.month_key) q = q.eq('month_key', req.query.month_key)
  const { data, error } = await q
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

router.post('/ledger', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { customer_id, cancelled_date, member_name } = req.body
  if (!customer_id || !cancelled_date) return res.status(400).json({ error: 'customer_id and cancelled_date required' })
  const { data, error } = await db().from('onboarding_cancellation_ledger').upsert({
    studio_id: req.studio.id, customer_id, member_name: member_name || null,
    cancelled_date, month_key: monthKeyOf(cancelled_date), source: 'manual_add',
  }, { onConflict: 'studio_id,customer_id,cancelled_date' }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  const [y, m] = monthKeyOf(cancelled_date).split('-').map(Number)
  await recomputeStudioTrends(db(), req.studio.id, m, y, false)
  res.status(201).json(data)
})

router.patch('/ledger/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { excluded, excluded_reason } = req.body
  if (excluded && !excluded_reason) return res.status(400).json({ error: 'excluded_reason required when excluding' })
  const supabase = db()
  const { data, error } = await supabase.from('onboarding_cancellation_ledger')
    .update({ excluded: !!excluded, excluded_reason: excluded ? excluded_reason : null,
              excluded_by: excluded ? (req.user.email || req.user.id) : null })
    .eq('id', req.params.id).eq('studio_id', req.studio.id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  if (data?.month_key) {
    const [y, m] = data.month_key.split('-').map(Number)
    const curKey = new Date().toISOString().slice(0, 7)
    await recomputeStudioTrends(supabase, req.studio.id, m, y, data.month_key === curKey)
  }
  res.json(data)
})

// ─── GET /api/member-activation/metrics?month_key=YYYY-MM ─────────────────────
// Returns computed vs. override (and the resolved value) for both Studio Trends
// metrics, so the UI can show the number, badge overrides, and explain them.
router.get('/metrics', authenticate, requireStudio, async (req, res) => {
  const supabase = db()
  const mk = req.query.month_key || new Date().toISOString().slice(0, 7)
  const [y, m] = mk.split('-').map(Number)
  const curKey = new Date().toISOString().slice(0, 7)

  const { count: computedCancels } = await supabase
    .from('onboarding_cancellation_ledger').select('id', { count: 'exact', head: true })
    .eq('studio_id', req.studio.id).eq('month_key', mk).eq('excluded', false)

  // Active-member count is a point-in-time snapshot — only meaningful for the current month.
  let computedActive = null
  if (mk === curKey) {
    const { count } = await supabase
      .from('onboarding_members').select('id', { count: 'exact', head: true })
      .eq('studio_id', req.studio.id).eq('is_cancelled', false).ilike('status', '%active%')
    computedActive = count || 0
  }

  const { data: overrides } = await supabase
    .from('onboarding_metric_overrides').select('*')
    .eq('studio_id', req.studio.id).eq('month_key', mk)
  const ov = (metric) => (overrides || []).find(o => o.metric === metric) || null

  const build = (metric, computed) => {
    const o = ov(metric)
    return { computed, override: o ? o.override_value : null,
             resolved: o ? o.override_value : computed,
             reason: o?.reason || null, set_by: o?.set_by || null, set_at: o?.set_at || null }
  }
  res.json({ month_key: mk, is_current_month: mk === curKey,
             cancellations: build('cancellations', computedCancels || 0),
             active_members: build('active_members', computedActive) })
})

// ─── Metric overrides ─────────────────────────────────────────────────────────
router.get('/metric-overrides', authenticate, requireStudio, async (req, res) => {
  let q = db().from('onboarding_metric_overrides').select('*').eq('studio_id', req.studio.id)
  if (req.query.month_key) q = q.eq('month_key', req.query.month_key)
  const { data, error } = await q
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

router.put('/metric-overrides', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { metric, month_key, override_value, reason } = req.body
  if (!['cancellations', 'active_members'].includes(metric)) return res.status(400).json({ error: 'invalid metric' })
  if (!month_key || override_value == null || !reason) return res.status(400).json({ error: 'month_key, override_value, reason required' })
  const supabase = db()
  const { data, error } = await supabase.from('onboarding_metric_overrides').upsert({
    studio_id: req.studio.id, metric, month_key, override_value: parseInt(override_value),
    reason, set_by: req.user.email || req.user.id, set_at: new Date().toISOString(),
  }, { onConflict: 'studio_id,metric,month_key' }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  const [y, m] = month_key.split('-').map(Number)
  const curKey = new Date().toISOString().slice(0, 7)
  await recomputeStudioTrends(supabase, req.studio.id, m, y, month_key === curKey)
  res.json(data)
})

router.delete('/metric-overrides', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { metric, month_key } = req.body
  const supabase = db()
  const { error } = await supabase.from('onboarding_metric_overrides').delete()
    .eq('studio_id', req.studio.id).eq('metric', metric).eq('month_key', month_key)
  if (error) return res.status(500).json({ error: error.message })
  const [y, m] = month_key.split('-').map(Number)
  const curKey = new Date().toISOString().slice(0, 7)
  await recomputeStudioTrends(supabase, req.studio.id, m, y, month_key === curKey)
  res.status(204).end()
})

// ─── GET /api/onboarding/import/history ───────────────────────────────────────
router.get('/import/history', authenticate, requireStudio, async (req, res) => {
  const { data, error } = await db().from('onboarding_import_runs').select('*')
    .eq('studio_id', req.studio.id).order('run_at', { ascending: false }).limit(20)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

module.exports = router
