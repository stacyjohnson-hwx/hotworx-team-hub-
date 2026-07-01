const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')
const { runJourneyEngine, seedTemplates, renderTemplate, firstName } = require('../services/journeyEngine')

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
    // Group bookings by resolved member, then one bulk update per member (not per row)
    // so a full booking accumulator doesn't fire thousands of sequential updates.
    const bookingsByMember = new Map()
    for (const b of (unlinked || [])) {
      const id = b.member_email ? emailToId.get(String(b.member_email).toLowerCase()) : null
      if (!id) continue
      if (!bookingsByMember.has(id)) bookingsByMember.set(id, [])
      bookingsByMember.get(id).push(b.booking_id)
    }
    for (const [id, ids] of bookingsByMember) {
      for (const c of chunk(ids, 500)) {
        await supabase.from('onboarding_bookings').update({ member_id: id }).eq('studio_id', studioId).in('booking_id', c)
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

    // 7) Journey engine: new-member detection, day-based task seeding, graduation.
    try { await runJourneyEngine(supabase, studioId) } catch (e) { summary.engine_error = e.message }

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

// ─── GET /api/member-activation/daily-list ────────────────────────────────────
// One unified, prioritized list of members to reach today, each with WHY + script.
router.get('/daily-list', authenticate, requireStudio, async (req, res) => {
  const supabase = db()
  const studioId = req.studio.id
  const today = new Date().toISOString().slice(0, 10)

  await seedTemplates(supabase, studioId)

  const [{ data: tasks, error }, { data: templates }] = await Promise.all([
    supabase.from('onboarding_journey_tasks')
      .select('*, journey:onboarding_journeys!inner(id, status, current_track, member:onboarding_members!inner(id, full_name, phone, is_cancelled, status))')
      .eq('studio_id', studioId).eq('status', 'pending').lte('due_date', today),
    supabase.from('onboarding_touchpoint_templates').select('*').eq('studio_id', studioId),
  ])
  if (error) return res.status(500).json({ error: error.message })
  const tplMap = new Map((templates || []).map(t => [t.template_key, t]))

  // Filter out cancelled/paused/graduated-day-based, then enrich context for rendering.
  const live = (tasks || []).filter(t => {
    const j = t.journey, m = j?.member
    if (!m || m.is_cancelled) return false
    if (j.status === 'paused') return false
    if (t.trigger_kind === 'day_based' && j.status !== 'active') return false
    return true
  })
  const memberIds = [...new Set(live.map(t => t.journey.member.id))]
  const [{ data: activity }, { data: transforms }] = await Promise.all([
    memberIds.length ? supabase.from('onboarding_member_activity').select('*').in('member_id', memberIds) : Promise.resolve({ data: [] }),
    memberIds.length ? supabase.from('onboarding_transformation_records').select('member_id, goal_text').in('member_id', memberIds) : Promise.resolve({ data: [] }),
  ])
  const actMap = new Map((activity || []).map(a => [a.member_id, a]))
  const goalMap = new Map((transforms || []).map(t => [t.member_id, t.goal_text]))

  const daysBetween = (d) => d ? Math.floor((new Date(today) - new Date(d)) / 86400000) : null

  const items = live.map(t => {
    const m = t.journey.member
    const a = actMap.get(m.id) || {}
    const tpl = tplMap.get(t.template_key) || {}
    const ctx = {
      first_name: t.context?.first_name || firstName(m.full_name),
      visit_days: a.visit_days || 0,
      total_sessions: a.total_sessions || 0,
      workouts_tried: a.workouts_tried || 0,
      days_lapsed: daysBetween(a.last_booking_date),
      goal_text: goalMap.get(m.id) || 'their goal',
      ...t.context,
    }
    return {
      id: t.id,
      kind: 'task',
      journey_id: t.journey.id,
      member_id: m.id,
      member_name: m.full_name || ctx.first_name,
      phone: m.phone || null,
      channel: tpl.channel || t.type,
      label: tpl.label || t.trigger_ref,
      trigger_kind: t.trigger_kind,
      trigger_ref: t.trigger_ref,
      priority: t.priority || 6,
      reward_key: t.context?.reward_key || null,
      script: renderTemplate(tpl.body || '', ctx),
      due_date: t.due_date,
    }
  })

  // Re-engagement (roster-wide, live-computed): any active member lapsed 14+ days,
  // excluding first-90 save-fork members and anyone contacted within the cooldown.
  const cutoff = new Date(Date.now() - 10 * 86400000).toISOString()  // 10-day cooldown
  const [{ data: allMembers }, { data: actAll }, { data: allJourneys }, { data: recent }, { data: upcoming }] = await Promise.all([
    supabase.from('onboarding_members').select('id, full_name, phone, status, is_cancelled, join_date').eq('studio_id', studioId),
    supabase.from('onboarding_member_activity').select('member_id, last_booking_date').eq('studio_id', studioId),
    supabase.from('onboarding_journeys').select('member_id, status, start_date').eq('studio_id', studioId),
    supabase.from('onboarding_reengage_log').select('member_id').eq('studio_id', studioId).gte('contacted_at', cutoff),
    supabase.from('events').select('title, start_date').eq('studio_id', studioId).gte('start_date', today).order('start_date').limit(1),
  ])
  const lastBookMap = new Map((actAll || []).map(a => [a.member_id, a.last_booking_date]))
  const jMap = new Map((allJourneys || []).map(j => [j.member_id, j]))
  const cooling = new Set((recent || []).map(r => r.member_id))
  const eventName = upcoming && upcoming[0] ? `${upcoming[0].title} is coming up — ` : ''
  const addDaysStr = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }

  for (const mm of (allMembers || [])) {
    if (mm.is_cancelled || !/active/i.test(mm.status || '') || cooling.has(mm.id)) continue
    const j = jMap.get(mm.id)
    const inFirst90 = j && j.status === 'active' && j.start_date && addDaysStr(j.start_date, 90) >= today
    if (inFirst90) continue  // save fork owns first-90 lapses
    const ref = lastBookMap.get(mm.id) || mm.join_date
    if (!ref) continue
    const lapse = Math.floor((new Date(today) - new Date(ref)) / 86400000)
    if (lapse < 14) continue
    const key = lapse >= 60 ? 'reengage_60' : lapse >= 30 ? 'reengage_30' : 'reengage_14'
    const tpl = tplMap.get(key) || {}
    const ctx = { first_name: firstName(mm.full_name), days_lapsed: lapse, event_name: eventName }
    items.push({
      id: `reengage:${mm.id}`, kind: 'reengage', member_id: mm.id,
      member_name: mm.full_name || ctx.first_name, phone: mm.phone || null,
      channel: tpl.channel || (lapse >= 60 ? 'call' : 'text'),
      label: tpl.label || key, trigger_kind: 'reengage', trigger_ref: key,
      priority: lapse >= 60 ? 2 : 4, reward_key: null,
      script: renderTemplate(tpl.body || '', ctx), due_date: today,
    })
  }

  items.sort((x, y) => x.priority - y.priority || String(x.due_date).localeCompare(String(y.due_date)))
  res.json(items)
})

// Log a re-engagement contact (starts the cooldown; member drops off until it expires or they book).
router.post('/reengage/:memberId/complete', authenticate, requireStudio, async (req, res) => {
  const { error } = await db().from('onboarding_reengage_log').insert({
    studio_id: req.studio.id, member_id: req.params.memberId, contacted_by: req.user.email || req.user.id,
  })
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json({ ok: true })
})

// Complete / skip a task (any team member — shared queue).
router.post('/daily-list/:id/complete', authenticate, requireStudio, async (req, res) => {
  const supabase = db()
  const { data: task } = await supabase.from('onboarding_journey_tasks')
    .select('*, journey:onboarding_journeys(member_id)').eq('id', req.params.id).eq('studio_id', req.studio.id).maybeSingle()
  if (!task) return res.status(404).json({ error: 'Task not found' })
  const memberId = task.journey?.member_id

  // Day-2 hard gate: goal + before photo + consent must be captured first (§7).
  if (task.trigger_ref === 'day_2') {
    const { data: tr } = await supabase.from('onboarding_transformation_records')
      .select('goal_text, before_photo_url, consent').eq('studio_id', req.studio.id).eq('member_id', memberId).maybeSingle()
    if (!tr || !tr.goal_text || !tr.before_photo_url || !tr.consent) {
      return res.status(422).json({ error: 'day2_gate', message: 'Capture goal, before photo, and consent before completing Day 2.' })
    }
  }

  const { data, error } = await supabase.from('onboarding_journey_tasks')
    .update({ status: 'completed', completed_by: req.user.email || req.user.id, completed_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('studio_id', req.studio.id).select().single()
  if (error) return res.status(500).json({ error: error.message })

  // Milestone: optionally mark the reward physically handed over.
  if (req.body.fulfilled && task.context?.reward_key && memberId) {
    await supabase.from('onboarding_rewards_awarded').update({ fulfilled: true })
      .eq('studio_id', req.studio.id).eq('member_id', memberId).eq('reward_key', task.context.reward_key)
  }
  res.json(data)
})

// ─── Transformation record (Day-2 capture) ────────────────────────────────────
router.get('/transformation/:memberId', authenticate, requireStudio, async (req, res) => {
  const { data, error } = await db().from('onboarding_transformation_records')
    .select('*').eq('studio_id', req.studio.id).eq('member_id', req.params.memberId).maybeSingle()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || null)
})

router.post('/transformation', authenticate, requireStudio, async (req, res) => {
  const supabase = db()
  const { member_id, goal_text, before_photo_url, progress_photo_url, after_photo_url, consent, next3_booked } = req.body
  if (!member_id) return res.status(400).json({ error: 'member_id required' })
  const fields = { studio_id: req.studio.id, member_id, captured_by: req.user.email || req.user.id, updated_at: new Date().toISOString() }
  if (goal_text !== undefined) fields.goal_text = goal_text
  if (before_photo_url !== undefined) fields.before_photo_url = before_photo_url
  if (progress_photo_url !== undefined) fields.progress_photo_url = progress_photo_url
  if (after_photo_url !== undefined) fields.after_photo_url = after_photo_url
  if (consent !== undefined) fields.consent = !!consent
  const { data, error } = await supabase.from('onboarding_transformation_records')
    .upsert(fields, { onConflict: 'studio_id,member_id' }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  if (next3_booked !== undefined) {
    await supabase.from('onboarding_journeys').update({ next3_booked: !!next3_booked })
      .eq('studio_id', req.studio.id).eq('member_id', member_id)
  }
  res.json(data)
})

// ─── Journey edits (first-session flag, manual track move, orientation) ───────
router.patch('/journeys/:id', authenticate, requireStudio, async (req, res) => {
  const allowed = ['first_session_flag', 'current_track', 'next3_booked', 'orientation_completed']
  const updates = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k]
  const { data, error } = await db().from('onboarding_journeys')
    .update(updates).eq('id', req.params.id).eq('studio_id', req.studio.id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.post('/daily-list/:id/skip', authenticate, requireStudio, async (req, res) => {
  const { data, error } = await db().from('onboarding_journey_tasks')
    .update({ status: 'skipped', completed_by: req.user.email || req.user.id, completed_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('studio_id', req.studio.id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── Script Admin (touchpoint templates) ──────────────────────────────────────
router.get('/templates', authenticate, requireStudio, async (req, res) => {
  const supabase = db()
  await seedTemplates(supabase, req.studio.id)
  const { data, error } = await supabase.from('onboarding_touchpoint_templates')
    .select('*').eq('studio_id', req.studio.id).order('template_key')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

router.put('/templates/:key', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { body, label, channel } = req.body
  const updates = { updated_by: req.user.email || req.user.id, updated_at: new Date().toISOString() }
  if (body !== undefined) updates.body = body
  if (label !== undefined) updates.label = label
  if (channel !== undefined) updates.channel = channel
  const { data, error } = await db().from('onboarding_touchpoint_templates')
    .update(updates).eq('studio_id', req.studio.id).eq('template_key', req.params.key).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── Mailchimp opt-out sync-back (Make.com → app) ─────────────────────────────
// Secured by a shared token so Make.com can post unsubscribe status back without a user JWT.
router.post('/mailchimp/sync-back', async (req, res) => {
  const token = req.headers['x-sync-token']
  if (!process.env.MAKE_SYNC_TOKEN || token !== process.env.MAKE_SYNC_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  const { email, status } = req.body
  if (!email || !status) return res.status(400).json({ error: 'email and status required' })
  const { error } = await db().from('onboarding_members')
    .update({ mailchimp_status: status }).eq('email', String(email).toLowerCase())
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// Owner/manager visibility into the Mailchimp sync queue.
router.get('/mailchimp/queue', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { data, error } = await db().from('onboarding_mailchimp_queue')
    .select('*').eq('studio_id', req.studio.id).order('created_at', { ascending: false }).limit(50)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

// ─── GET /api/member-activation/import/history ────────────────────────────────
router.get('/import/history', authenticate, requireStudio, async (req, res) => {
  const { data, error } = await db().from('onboarding_import_runs').select('*')
    .eq('studio_id', req.studio.id).order('run_at', { ascending: false }).limit(20)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

module.exports = router
