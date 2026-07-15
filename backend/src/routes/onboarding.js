const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')
const { runJourneyEngine, seedTemplates, renderTemplate, firstName } = require('../services/journeyEngine')
const { todayInChicago, monthKeyInChicago } = require('../utils/dates')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Supabase caps a single select at 1000 rows. Studios can exceed that (Pewaukee has
// >1000 members), so page through with .range() to read every row — otherwise
// studio-wide joins silently drop members past the first 1000 (e.g. workout activity
// not showing on a member's row).
async function fetchAllStudio(sb, table, columns, studioId, order) {
  const PAGE = 1000
  let out = [], from = 0
  for (;;) {
    let q = sb.from(table).select(columns).eq('studio_id', studioId).range(from, from + PAGE - 1)
    if (order) q = q.order(order.col, { ascending: order.asc })
    const { data, error } = await q
    if (error || !data || !data.length) break  // degrade gracefully rather than hang a handler
    out = out.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

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

// Map SAIL's free-text cancellation reason to the Cancellations tab's reason enum.
function mapCancelReason(raw) {
  const s = String(raw || '').toLowerCase()
  if (!s) return 'other'
  // SAIL auto-cancels for non-payment ("Subscription automatically canceled due
  // to non-payment for 3+ months") — its most common cancellation reason.
  if (/non.?payment|non pay|past due|failed payment|nsf|automatically cancel|auto.?cancel|delinquen|declined (card|payment)/.test(s)) return 'non_payment'
  if (/cost|financ|money|afford|expensive|price/.test(s)) return 'cost'
  if (/not us|no time|busy|not going|schedule|too far|distance|relocat|mov/.test(s) && /mov|relocat/.test(s)) return 'moving'
  if (/mov|relocat/.test(s)) return 'moving'
  if (/medical|injur|health|pregnan|surgery/.test(s)) return 'medical'
  if (/result|not work/.test(s)) return 'no_results'
  if (/competitor|another gym|other gym|switch/.test(s)) return 'competitor'
  if (/unhappy|dissatisf|complaint|rude|dirty/.test(s)) return 'unhappy'
  if (/not us|no time|busy|not going|schedule/.test(s)) return 'not_using'
  return 'other'
}

// Extract {m, d} from a birthday in various formats (YYYY-MM-DD, MM/DD, MM/DD/YYYY, text).
function birthdayMonthDay(v) {
  if (!v) return null
  const s = String(v).trim()
  let mm = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (mm) { const m = +mm[2], d = +mm[3]; return (m >= 1 && m <= 12 && d >= 1 && d <= 31) ? { m, d } : null }
  mm = s.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-]\d{2,4})?$/)
  if (mm) { const m = +mm[1], d = +mm[2]; return (m >= 1 && m <= 12 && d >= 1 && d <= 31) ? { m, d } : null }
  const dt = new Date(s)
  if (!isNaN(dt)) return { m: dt.getMonth() + 1, d: dt.getDate() }
  return null
}
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
      .from('onboarding_members').select('id, customer_id, is_cancelled, cancelled_date, roster_absent_days, member_type').eq('studio_id', studioId)
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

        // Name may be one column or split into First/Last — try both.
        const fullName = pick(r, ['Full Name', 'Name', 'Member Name', 'FullName', 'Customer Name', 'Client Name', 'Member Name '])
          || [pick(r, ['First Name', 'FirstName', 'First', 'Given Name']), pick(r, ['Last Name', 'LastName', 'Last', 'Surname', 'Family Name'])].filter(Boolean).join(' ').trim()
          || null

        rows.push({
          studio_id: studioId,
          customer_id,
          subscription_id: pick(r, ['Subscription Id', 'SubscriptionId', 'Subscription ID']),
          full_name:       fullName,
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
        if (m.member_type && m.member_type !== 'member') continue  // manual adds aren't in the SAIL roster
        await supabase.from('onboarding_members')
          .update({ seen_in_last_import: false, roster_absent_days: (m.roster_absent_days || 0) + 1 })
          .eq('id', m.id)
      }
    }

    // 3) Cancelled → ledger (dedupe on customer_id+cancelled_date) + set member flags.
    const touchedMonths = new Set()
    if (cancelled.length) {
      const ledgerRows = []
      const logRows = []
      const cancelSet = []
      // Record the actual headers so a mismatch is diagnosable from the run log.
      summary.cancelled.detected_columns = Object.keys(cancelled[0] || {})
      for (const raw of cancelled) {
        const r = normalizeRow(raw)
        const customer_id = pick(r, ['Customer Id', 'CustomerId', 'Customer ID', 'Member Id', 'MemberId', 'Client Id', 'ClientId', 'Customer #', 'Member #', 'Id'])
        const cancelled_date = parseDate(pick(r, ['Cancellation Request Date', 'Cancellation Date', 'Cancelled Date', 'CancellationDate', 'Cancel Date', 'Date Cancelled', 'Cancelled On', 'Termination Date', 'End Date', 'Request Date', 'Date']))
        if (!customer_id || !cancelled_date) { summary.cancelled.skipped++; continue }
        const name = pick(r, ['Customer Name', 'Name', 'Member Name', 'Full Name'])
          || [pick(r, ['First Name', 'FirstName']), pick(r, ['Last Name', 'LastName'])].filter(Boolean).join(' ').trim()
          || `Customer ${customer_id}`
        const sailReason = pick(r, ['Reason', 'Cancellation Reason', 'Cancel Reason'])
        // SAIL's own cancellation-export fields — mirror them onto the record.
        const cancellation_type = pick(r, ['Cancellation Type', 'CancellationType', 'Cancel Type']) || null
        const package_name = pick(r, ['Package Name', 'Package', 'PackageName', 'Membership']) || null
        const mpRaw = pick(r, ['Monthly Payment', 'MonthlyPayment', 'Monthly', 'Payment', 'Monthly Amount'])
        const monthly_payment = mpRaw ? (Number(String(mpRaw).replace(/[^0-9.]/g, '')) || null) : null
        const subscription_date = parseDate(pick(r, ['Subscription Date', 'SubscriptionDate', 'Join Date', 'Start Date']))
        const month_key = monthKeyOf(cancelled_date)
        touchedMonths.add(month_key)
        ledgerRows.push({
          studio_id: studioId, customer_id, member_name: name,
          cancelled_date, month_key, source: 'export',
        })
        // Auto-populate the Cancellations tab (team then fills in save/win-back details).
        logRows.push({
          studio_id: studioId, member_name: name, member_id: customer_id, date_requested: cancelled_date,
          cancel_reason: mapCancelReason(sailReason),
          reason_notes: sailReason ? `SAIL reason: ${sailReason}` : 'Imported from SAIL cancelled export',
          package_name, monthly_payment, cancellation_type, subscription_date,
          outcome: 'cancelled', win_back_step: 'call_scheduled',
          offers_presented: [], offer_accepted: 'none', goal_recaptured: false,
          source: 'sail_import', import_key: `${customer_id}|${cancelled_date}`,
          created_by: req.user.id,
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

      // Mirror into the Cancellations tab, deduped on import_key (re-imports don't duplicate).
      const logByKey = new Map()
      for (const row of logRows) logByKey.set(row.import_key, row)
      for (const c of chunk([...logByKey.values()], 500)) {
        await supabase.from('cancellation_log').upsert(c, { onConflict: 'studio_id,import_key', ignoreDuplicates: true })
      }
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
    // Page through ALL members (Supabase caps at 1000) — otherwise members past row
    // 1000 aren't in the map and their bookings never link (they'd show "unreconciled"
    // even though they're active members with an email on file).
    const memForLink = await fetchAllStudio(supabase, 'onboarding_members', 'id, email, phone', studioId)
    const emailToId = new Map(), phoneToId = new Map()
    for (const m of memForLink || []) {
      if (m.email) emailToId.set(String(m.email).trim().toLowerCase(), m.id)
      if (m.phone) phoneToId.set(String(m.phone).replace(/[^0-9]/g, ''), m.id)
    }
    // Fetch ALL unmatched bookings (Supabase caps a query at 1000 rows, so page
    // through with .range) — otherwise only the first 1000 ever get reconciled.
    const unlinked = []
    for (let from = 0; ; from += 1000) {
      const { data: page } = await supabase
        .from('onboarding_bookings').select('booking_id, member_email')
        .eq('studio_id', studioId).is('member_id', null).order('booking_id').range(from, from + 999)
      if (!page || page.length === 0) break
      unlinked.push(...page)
      if (page.length < 1000) break
    }
    // Group bookings by resolved member, then one bulk update per member (not per row).
    const bookingsByMember = new Map()
    for (const b of unlinked) {
      const id = b.member_email ? emailToId.get(String(b.member_email).trim().toLowerCase()) : null
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

    // 5b) Re-activate anyone who booked AFTER their cancel date. A cancelled member who
    // keeps coming in (rejoined, or the cancel was rescinded) is active — bookings are the
    // ground truth. Without this they'd stay flagged CANCELLED and be wrongly excluded from
    // re-engagement + the active count (e.g. Gabriela Castellanos, cancelled 7/10 but booked 7/13).
    {
      const cxlMembers = await fetchAllStudio(supabase, 'onboarding_members', 'id, cancelled_date, is_cancelled', studioId)
      const actRows = await fetchAllStudio(supabase, 'onboarding_member_activity', 'member_id, last_booking_date', studioId)
      const lastBkMap = new Map((actRows || []).map(a => [a.member_id, a.last_booking_date]))
      const reactivateIds = (cxlMembers || []).filter(m =>
        m.is_cancelled && m.cancelled_date && lastBkMap.get(m.id) && lastBkMap.get(m.id) > m.cancelled_date
      ).map(m => m.id)
      for (const c of chunk(reactivateIds, 200)) {
        await supabase.from('onboarding_members')
          .update({ is_cancelled: false, cancelled_date: null, status: 'Active' })
          .eq('studio_id', studioId).in('id', c)
      }
      summary.reactivated = reactivateIds.length
    }

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

  // NOTE: total_member_count is intentionally NOT written here. The computed
  // active-member count from the roster was never reliable, so Total Member
  // Count stays a manual field in Studio Trends (entered by owner/manager).
  const fields = { month, year, studio_id: studioId, updated_at: new Date().toISOString() }
  fields.cancellations = ovMap.has('cancellations') ? ovMap.get('cancellations') : (computedCancels || 0)

  await supabase.from('studio_trends').upsert(fields, { onConflict: 'studio_id, month, year' })
}

// ─── GET /api/onboarding/members ──────────────────────────────────────────────
router.get('/members', authenticate, requireStudio, async (req, res) => {
  const supabase = db()
  let members, activity
  try {
    [members, activity] = await Promise.all([
      fetchAllStudio(supabase, 'onboarding_members', '*', req.studio.id, { col: 'join_date', asc: false }),
      fetchAllStudio(supabase, 'onboarding_member_activity', '*', req.studio.id),
    ])
  } catch (e) { return res.status(500).json({ error: e.message }) }
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

// Lightweight member autocomplete for photo tagging (id + name only).
router.get('/members/lookup', authenticate, requireStudio, async (req, res) => {
  const q = (req.query.q || '').trim()
  let query = db().from('onboarding_members').select('id, full_name, email')
    .eq('studio_id', req.studio.id).order('full_name').limit(20)
  if (q) query = query.ilike('full_name', `%${q}%`)
  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

// ─── POST /api/member-activation/members ──────────────────────────────────────
// Manually add a non-roster person (employee, comp, PIF, reciprocal, guest) so
// their bookings reconcile — without counting toward the active-member number or
// triggering onboarding/re-engagement (is_new_member=false, non-'member' type).
const MEMBER_TYPES = ['member', 'employee', 'comp', 'pif', 'reciprocal', 'guest']
router.post('/members', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { email, full_name, member_type, phone, origin_studio, expiration_date, is_cancelled, cancelled_date } = req.body
  if (!email) return res.status(400).json({ error: 'email required' })
  const type = MEMBER_TYPES.includes(member_type) ? member_type : 'guest'
  const supabase = db()
  const sid = req.studio.id
  const lower = String(email).trim().toLowerCase()
  const cancelled = !!is_cancelled
  const nameTrim = String(full_name || '').trim()

  // ── De-dupe by name so reconciling someone never spawns a parallel record ──
  // The usual cause of split identities: SAIL imports the person under a numeric
  // customer_id (often an empty shell with no email), then someone "adds" them
  // here to attach their workouts — creating a second MANUAL_ row. Before making
  // a new record, look for an existing same-name member to reuse and enrich.
  let existing = null
  if (nameTrim) {
    const { data: sameName } = await supabase.from('onboarding_members')
      .select('*').eq('studio_id', sid).ilike('full_name', nameTrim)
    const cand = (sameName || []).filter(x =>
      String(x.customer_id || '').toLowerCase() !== `manual_${lower}`)
    // Prefer a SAIL record (numeric customer_id) with no email, or this same email.
    const sail = cand.filter(x => !String(x.customer_id || '').startsWith('MANUAL_')
      && (!x.email || x.email.toLowerCase() === lower))
    if (sail.length === 1) existing = sail[0]
    else {
      const byEmail = cand.filter(x => (x.email || '').toLowerCase() === lower)
      if (byEmail.length === 1) existing = byEmail[0]
    }
  }

  let member, error
  if (existing) {
    // Reuse the existing roster identity — only enrich, never clobber its type.
    const patch = {
      email: existing.email || lower,
      phone: phone || existing.phone || null,
      origin_studio: origin_studio || existing.origin_studio || null,
      expiration_date: expiration_date || existing.expiration_date || null,
      seen_in_last_import: true,
      updated_at: new Date().toISOString(),
    }
    if (cancelled) { patch.status = 'Cancelled'; patch.is_cancelled = true; patch.cancelled_date = cancelled_date || existing.cancelled_date || null }
    const r = await supabase.from('onboarding_members').update(patch).eq('id', existing.id).select().single()
    member = r.data; error = r.error
  } else {
    const r = await supabase.from('onboarding_members').upsert({
      studio_id: sid,
      customer_id: `MANUAL_${lower}`,
      email: lower,
      full_name: full_name || null,
      phone: phone || null,
      member_type: type,
      origin_studio: origin_studio || null,
      expiration_date: expiration_date || null,
      // A cancelled person still gets their workouts attributed, but is excluded
      // from the active count and never seeded a journey / onboarding texts.
      status: cancelled ? 'Cancelled' : 'Active',
      is_cancelled: cancelled,
      cancelled_date: cancelled ? (cancelled_date || null) : null,
      is_new_member: false,
      seen_in_last_import: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'studio_id,customer_id' }).select().single()
    member = r.data; error = r.error
  }
  if (error) return res.status(500).json({ error: error.message })

  // Link any of their unreconciled bookings by email.
  const { data: linked } = await supabase.from('onboarding_bookings')
    .update({ member_id: member.id })
    .eq('studio_id', req.studio.id).is('member_id', null).eq('member_email', lower)
    .select('booking_id')
  res.status(201).json({ ...member, linked_bookings: (linked || []).length })
})

// Full detail for one member: profile fields + activity + interaction history.
router.get('/members/:id/detail', authenticate, requireStudio, async (req, res) => {
  const supabase = db()
  const sid = req.studio.id, mid = req.params.id
  const [{ data: member }, { data: act }, { data: journeys }, { data: recog }, { data: reeng }, { data: templates }, { data: sessions }] = await Promise.all([
    supabase.from('onboarding_members').select('*').eq('studio_id', sid).eq('id', mid).maybeSingle(),
    supabase.from('onboarding_member_activity').select('*').eq('member_id', mid).maybeSingle(),
    supabase.from('onboarding_journeys').select('id, current_track, status, start_date').eq('studio_id', sid).eq('member_id', mid),
    supabase.from('onboarding_recognition_tasks').select('type, status, completed_by, completed_at').eq('studio_id', sid).eq('member_id', mid),
    supabase.from('onboarding_reengage_log').select('contacted_at, contacted_by').eq('studio_id', sid).eq('member_id', mid),
    supabase.from('onboarding_touchpoint_templates').select('template_key, label').eq('studio_id', sid),
    supabase.from('onboarding_bookings').select('booking_date, time_slot, session_type, home_studio').eq('studio_id', sid).eq('member_id', mid).order('booking_date', { ascending: false }).limit(400),
  ])
  if (!member) return res.status(404).json({ error: 'not found' })
  const tplMap = new Map((templates || []).map(t => [t.template_key, t.label]))

  const journeyIds = (journeys || []).map(j => j.id)
  let taskInter = []
  if (journeyIds.length) {
    const { data: tasks } = await supabase.from('onboarding_journey_tasks')
      .select('template_key, trigger_ref, type, status, completed_by, completed_at')
      .in('journey_id', journeyIds).in('status', ['completed', 'skipped'])
    taskInter = (tasks || []).map(t => ({ when: t.completed_at, kind: t.type, label: tplMap.get(t.template_key) || t.trigger_ref, by: t.completed_by, status: t.status }))
  }
  const recInter = (recog || []).filter(r => r.status === 'completed')
    .map(r => ({ when: r.completed_at, kind: r.type, label: r.type === 'birthday' ? 'Birthday text' : 'Thank-you card', by: r.completed_by, status: 'completed' }))
  const reInter = (reeng || []).map(r => ({ when: r.contacted_at, kind: 'reengage', label: 'Re-engagement contact', by: r.contacted_by, status: 'completed' }))
  const interactions = [...taskInter, ...recInter, ...reInter].filter(i => i.when)
    .sort((a, b) => String(b.when).localeCompare(String(a.when)))

  res.json({
    member: { ...member,
      visit_days: act?.visit_days || 0, total_sessions: act?.total_sessions || 0,
      workouts_tried: act?.workouts_tried || 0, last_booking_date: act?.last_booking_date || null,
      journey: (journeys || [])[0] || null },
    interactions,
    sessions: sessions || [],
  })
})

// ─── Missed-guest detail: a lead view, NOT the new-member journey ─────────────
// Contact + the sessions they tried + notes + next follow-up + interaction history.
router.get('/missed-guest/:memberId', authenticate, requireStudio, async (req, res) => {
  const supabase = db(); const sid = req.studio.id, mid = req.params.memberId
  const [{ data: member }, { data: sessions }, { data: log }, { data: reeng }] = await Promise.all([
    supabase.from('onboarding_members').select('id, full_name, email, phone, join_date, lead_status, sub_status').eq('studio_id', sid).eq('id', mid).maybeSingle(),
    supabase.from('onboarding_bookings').select('booking_date, time_slot, session_type, home_studio').eq('studio_id', sid).eq('member_id', mid).order('booking_date', { ascending: false }).limit(200),
    supabase.from('onboarding_touchpoint_log').select('notes, follow_up_date, done, completed_by, completed_at, updated_at').eq('studio_id', sid).eq('member_id', mid).eq('touchpoint_key', 'missed_guest').maybeSingle(),
    supabase.from('onboarding_reengage_log').select('contacted_at, contacted_by').eq('studio_id', sid).eq('member_id', mid).order('contacted_at', { ascending: false }),
  ])
  if (!member) return res.status(404).json({ error: 'not found' })
  // Interaction history from the contact log (real outreach / snoozed / dismissed).
  const interactions = (reeng || []).map(r => {
    const cb = String(r.contacted_by || '')
    const kind = cb.startsWith('snoozed:') ? 'snoozed' : cb.startsWith('dismissed:') ? 'dismissed' : 'contacted'
    return { when: r.contacted_at, kind, by: cb.replace(/^(snoozed:|dismissed:)/, '') }
  })
  res.json({
    member,
    sessions: sessions || [],
    notes: log?.notes || null,
    follow_up_date: log?.follow_up_date || null,
    note_updated_at: log?.updated_at || null,
    interactions,
  })
})

// ─── Rich member journey: timeline, touchpoints, photos, bookings, milestones ──
router.get('/members/:id/journey', authenticate, requireStudio, async (req, res) => {
  const supabase = db(); const sid = req.studio.id, mid = req.params.id
  const today = todayInChicago()

  const { data: member } = await supabase.from('onboarding_members').select('*').eq('studio_id', sid).eq('id', mid).maybeSingle()
  if (!member) return res.status(404).json({ error: 'not found' })

  const [{ data: act }, { data: journeys }, { data: recog }, { data: rewards }, { data: xform }, { data: log }, { data: bookings }, { data: tags }, { data: reeng }, { data: templates }] = await Promise.all([
    supabase.from('onboarding_member_activity').select('*').eq('member_id', mid).maybeSingle(),
    supabase.from('onboarding_journeys').select('id, start_date, current_track, status').eq('studio_id', sid).eq('member_id', mid),
    supabase.from('onboarding_recognition_tasks').select('type, status, ref_date, completed_at, completed_by').eq('studio_id', sid).eq('member_id', mid),
    supabase.from('onboarding_rewards_awarded').select('reward_key, awarded_at').eq('studio_id', sid).eq('member_id', mid),
    supabase.from('onboarding_transformation_records').select('goal_text, before_photo_url, progress_photo_url, after_photo_url').eq('studio_id', sid).eq('member_id', mid).maybeSingle(),
    supabase.from('onboarding_touchpoint_log').select('touchpoint_key, done, notes, completed_by, completed_at, updated_at').eq('studio_id', sid).eq('member_id', mid),
    supabase.from('onboarding_bookings').select('booking_date, time_slot, session_type').eq('studio_id', sid).eq('member_id', mid).order('booking_date', { ascending: false }).limit(60),
    supabase.from('marketing_content_member_tags').select('content_id').eq('studio_id', sid).eq('member_id', mid),
    supabase.from('onboarding_reengage_log').select('contacted_at, contacted_by').eq('studio_id', sid).eq('member_id', mid),
    supabase.from('onboarding_touchpoint_templates').select('template_key, label, sort_order, active').eq('studio_id', sid),
  ])
  const jIds = (journeys || []).map(j => j.id)
  const { data: jtasks } = jIds.length
    ? await supabase.from('onboarding_journey_tasks').select('trigger_ref, template_key, status, due_date, completed_at, completed_by').in('journey_id', jIds)
    : { data: [] }
  // Tagged marketing photos.
  const contentIds = (tags || []).map(t => t.content_id)
  const { data: assets } = contentIds.length
    ? await supabase.from('marketing_content_assets').select('file_url, file_type, caption, uploaded_at').in('id', contentIds)
    : { data: [] }

  const logBy = {}; for (const l of log || []) logBy[l.touchpoint_key] = l
  const taskBy = {}; for (const t of jtasks || []) taskBy[t.trigger_ref] = t
  const tplLabel = new Map((templates || []).map(t => [t.template_key, t.label]))
  const cardTask = (recog || []).find(r => r.type === 'thank_you_card')
  const bdayTask = (recog || []).find(r => r.type === 'birthday')
  const rewardKeys = new Set((rewards || []).map(r => r.reward_key))
  const visitDays = act?.visit_days || 0, workouts = act?.workouts_tried || 0

  const dayStatus = (task, key) => {
    const l = logBy[key]
    if (l?.done) return { status: 'done', notes: l.notes || null, when: l.completed_at }
    let s = 'na'
    if (task) {
      if (task.status === 'completed') s = 'done'
      else if (task.status === 'skipped') s = 'skipped'
      else s = (task.due_date && task.due_date <= today) ? 'due' : 'upcoming'
    }
    return { status: s, notes: l?.notes || null, due_date: task?.due_date || null, when: task?.completed_at || null }
  }
  const tp = (key, label, base) => ({ key, label, ...base, notes: logBy[key]?.notes ?? base.notes ?? null, ...(logBy[key]?.done ? { status: 'done' } : {}) })

  // The journey path is driven by the Script Admin templates: a deactivated script
  // drops off, a renamed/added custom script shows up, and the order follows sort_order.
  const TP_TEMPLATE = { day_0_orientation: 'day0_orientation', day_2: 'day2_goal_call', day_5: 'day5_checkin', day_21: 'day21_bring_friend', day_30: 'day30_review', day_60: 'day60_review', day_90: 'day90_close', thank_you_card: 'thank_you_card', passport: 'passport_sticker' }
  const tplActive = new Map((templates || []).map(t => [t.template_key, t.active !== false]))
  const isActiveKey = (key) => key === 'photo'
    ? tplActive.get('day2_goal_call') !== false
    : (TP_TEMPLATE[key] ? tplActive.get(TP_TEMPLATE[key]) !== false : true)
  const shortJourney = (lbl = '') => {
    const mo = lbl.match(/day\s*(\d+)/i)
    const base = mo ? `Day ${mo[1]}` : (lbl || '').split(/[—\-:•]/)[0].trim()
    return base.length > 20 ? base.slice(0, 19) + '…' : base
  }

  const touchpoints = [
    tp('day_0_orientation', 'Orientation', dayStatus(taskBy['day_0_orientation'], 'day_0_orientation')),
    tp('photo', '1st-day photo', { status: xform?.before_photo_url ? 'done' : (taskBy['day_2']?.due_date && taskBy['day_2'].due_date <= today ? 'due' : 'upcoming') }),
    tp('day_2', 'Day 2 goal', dayStatus(taskBy['day_2'], 'day_2')),
    tp('day_5', 'Day 5 check-in', dayStatus(taskBy['day_5'], 'day_5')),
    tp('day_21', 'Day 21 friend', dayStatus(taskBy['day_21'], 'day_21')),
    tp('day_30', 'Day 30 review', dayStatus(taskBy['day_30'], 'day_30')),
    tp('day_60', 'Day 60 review', dayStatus(taskBy['day_60'], 'day_60')),
    tp('day_90', 'Day 90 close', dayStatus(taskBy['day_90'], 'day_90')),
    tp('thank_you_card', 'Thank-you card', { status: (logBy['thank_you_card']?.done || cardTask?.status === 'completed') ? 'done' : cardTask ? 'due' : 'na' }),
    tp('passport', 'Passport', { status: (rewardKeys.has('sticker') || logBy['passport']?.done) ? 'done' : (workouts >= 12 ? 'due' : 'upcoming') }),
  ].filter(t => isActiveKey(t.key))

  // Custom journey steps added in Script Admin appear automatically.
  for (const t of (templates || [])) {
    if (t.active === false || !t.template_key.startsWith('custom_')) continue
    touchpoints.push(tp(t.template_key, shortJourney(t.label), dayStatus(taskBy[t.template_key], t.template_key)))
  }

  // Order the journey path to match the Script Admin order (by template sort_order).
  const orderMap = new Map((templates || []).map(t => [t.template_key, t.sort_order ?? 900]))
  const tpOrder = (key) => key === 'photo' ? (orderMap.get('day2_goal_call') ?? 20) + 1 : (orderMap.get(TP_TEMPLATE[key] || key) ?? 900)
  touchpoints.sort((a, b) => tpOrder(a.key) - tpOrder(b.key))

  const MILES = [[10, '10 visit-days'], [25, '25 · keychain'], [50, '50 visit-days'], [100, '100 · T-shirt'], [500, '500 · premium'], [1000, '1,000 · legacy']]
  const milestones = [
    { key: 'passport', label: 'Passport · all 12', earned: rewardKeys.has('sticker') || workouts >= 12 },
    ...MILES.map(([n, label]) => ({ key: `m${n}`, label, earned: visitDays >= n })),
  ]

  const photos = [
    ...(xform?.before_photo_url ? [{ url: xform.before_photo_url, type: 'photo', caption: 'Before' }] : []),
    ...(xform?.progress_photo_url ? [{ url: xform.progress_photo_url, type: 'photo', caption: 'Progress' }] : []),
    ...(xform?.after_photo_url ? [{ url: xform.after_photo_url, type: 'photo', caption: 'After' }] : []),
    ...(assets || []).map(a => ({ url: a.file_url, type: a.file_type === 'video' ? 'video' : 'photo', caption: a.caption || null })),
  ]

  // Interaction timeline: completed tasks + notes + recognition + re-engagement.
  const timeline = []
  for (const t of jtasks || []) if (['completed', 'skipped'].includes(t.status) && t.completed_at)
    timeline.push({ when: t.completed_at, label: tplLabel.get(t.template_key) || t.trigger_ref, by: t.completed_by, kind: 'task', note: null, done: t.status === 'completed' })
  for (const l of log || []) if (l.notes)
    timeline.push({ when: l.completed_at || l.updated_at, label: (touchpoints.find(x => x.key === l.touchpoint_key)?.label) || l.touchpoint_key, by: l.completed_by, kind: 'note', note: l.notes, done: l.done })
  for (const r of recog || []) if (r.status === 'completed' && r.completed_at)
    timeline.push({ when: r.completed_at, label: r.type === 'birthday' ? 'Birthday text' : 'Thank-you card', by: r.completed_by, kind: 'recognition', note: null, done: true })
  for (const r of reeng || [])
    timeline.push({ when: r.contacted_at, label: 'Re-engagement contact', by: r.contacted_by, kind: 'reengage', note: null, done: true })
  timeline.sort((a, b) => String(b.when).localeCompare(String(a.when)))

  const daysIn = member.join_date ? Math.floor((new Date(today) - new Date(member.join_date)) / 86400000) : null
  const doneCount = touchpoints.filter(t => t.status === 'done').length
  res.json({
    member: { id: member.id, full_name: member.full_name, join_date: member.join_date, days_in: daysIn,
      phone: member.phone, email: member.email, origin_studio: member.origin_studio, member_type: member.member_type,
      goal_text: xform?.goal_text || null, birthday: bdayTask?.ref_date || null },
    activity: { visit_days: visitDays, total_sessions: act?.total_sessions || 0, workouts_tried: workouts, last_booking_date: act?.last_booking_date || null },
    progress: { done: doneCount, total: touchpoints.length },
    touchpoints, milestones, photos, bookings: bookings || [], timeline,
  })
})

// Parse a SAIL time slot (e.g. "6:00 AM", "18:00", "6 PM") to an hour 0–23.
function parseHour(slot) {
  const s = String(slot || '').trim()
  const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const mer = (m[3] || '').toLowerCase()
  if (mer === 'pm' && h < 12) h += 12
  if (mer === 'am' && h === 12) h = 0
  return h >= 0 && h <= 23 ? h : null
}

// Time-of-day distribution for reciprocal members (when they train here).
router.get('/reciprocals/timeofday', authenticate, requireStudio, async (req, res) => {
  const supabase = db(); const sid = req.studio.id
  const { data: recips } = await supabase.from('onboarding_members')
    .select('id').eq('studio_id', sid).eq('member_type', 'reciprocal')
  const ids = (recips || []).map(m => m.id)
  const buckets = Array.from({ length: 24 }, () => 0)
  let total = 0
  for (const chunkIds of chunk(ids, 100)) {
    if (!chunkIds.length) continue
    // Page through bookings for these members.
    for (let from = 0; ; from += 1000) {
      const { data: page } = await supabase.from('onboarding_bookings')
        .select('time_slot').eq('studio_id', sid).in('member_id', chunkIds)
        .order('booking_id').range(from, from + 999)
      if (!page || page.length === 0) break
      for (const b of page) { const h = parseHour(b.time_slot); if (h != null) { buckets[h]++; total++ } }
      if (page.length < 1000) break
    }
  }
  res.json({ total, buckets: buckets.map((count, hour) => ({ hour, count })) })
})

// Edit a member (name/type/contact/status) — owner/manager.
router.patch('/members/:id', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const updates = { updated_at: new Date().toISOString() }
  if (req.body.full_name !== undefined) updates.full_name = req.body.full_name || null
  if (req.body.phone !== undefined) updates.phone = req.body.phone || null
  if (req.body.email !== undefined) updates.email = req.body.email ? String(req.body.email).trim().toLowerCase() : null
  if (req.body.status !== undefined) updates.status = req.body.status
  if (req.body.origin_studio !== undefined) updates.origin_studio = req.body.origin_studio || null
  if (req.body.expiration_date !== undefined) updates.expiration_date = req.body.expiration_date || null
  for (const k of ['address', 'city', 'state', 'postal_code']) if (req.body[k] !== undefined) updates[k] = req.body[k] || null
  if (req.body.member_type !== undefined && MEMBER_TYPES.includes(req.body.member_type)) updates.member_type = req.body.member_type
  if (req.body.is_cancelled !== undefined) {
    updates.is_cancelled = !!req.body.is_cancelled
    if (!req.body.is_cancelled) updates.cancelled_date = null
  }
  if (req.body.cancelled_date !== undefined && req.body.is_cancelled !== false) updates.cancelled_date = req.body.cancelled_date || null
  const { data, error } = await db().from('onboarding_members')
    .update(updates).eq('id', req.params.id).eq('studio_id', req.studio.id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── GET /api/onboarding/unreconciled ─────────────────────────────────────────
router.get('/unreconciled', authenticate, requireStudio, async (req, res) => {
  // Grouped by email across ALL months (via the onboarding_unreconciled_emails
  // view) so no month is truncated by a booking-row limit. One row per person.
  const { data, error } = await db()
    .from('onboarding_unreconciled_emails')
    .select('email, booking_count, last_booking_date, first_booking_date')
    .eq('studio_id', req.studio.id)
    .order('booking_count', { ascending: false })
    .limit(1000)
  if (error) return res.status(500).json({ error: error.message })
  res.json((data || []).map(g => ({
    email: g.email,
    count: g.booking_count,
    last: g.last_booking_date,
    first: g.first_booking_date,
  })))
})

// ─── Suggested cancelled matches (review before applying) ─────────────────────
// Fuzzy-match unreconciled emails to known cancelled people (by name), so a Lead
// can approve links in bulk instead of adding each person by hand.
router.get('/reconcile/suggestions', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const supabase = db(); const sid = req.studio.id
  const [{ data: un }, { data: ledger }, { data: cancMembers }] = await Promise.all([
    supabase.from('onboarding_unreconciled_emails').select('email, booking_count, last_booking_date').eq('studio_id', sid).limit(2000),
    supabase.from('cancellation_log').select('member_name').eq('studio_id', sid),
    supabase.from('onboarding_members').select('full_name').eq('studio_id', sid).eq('is_cancelled', true),
  ])
  // Candidate cancelled names → first/last tokens.
  const names = new Map()
  const addName = (nm) => {
    const toks = String(nm || '').toLowerCase().split(/[^a-z]+/).filter(t => t.length >= 2)
    if (toks.length < 2) return
    const first = toks[0], last = toks[toks.length - 1]
    const key = `${first}|${last}`
    if (!names.has(key)) names.set(key, { name: nm, first, last })
  }
  for (const r of ledger || []) addName(r.member_name)
  for (const m of cancMembers || []) addName(m.full_name)
  const cand = [...names.values()]

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const out = []
  for (const u of un || []) {
    if (!u.email || u.email === '(no email)') continue
    const lp = norm(u.email.split('@')[0])
    if (!lp) continue
    let best = null
    for (const c of cand) {
      let score = 0, conf = null
      if (lp === c.first + c.last || lp === c.last + c.first) { score = 100; conf = 'high' }
      else if (lp.includes(c.first) && lp.includes(c.last)) { score = 80; conf = 'high' }
      else if (lp.includes(c.last) && c.last.length >= 4 && lp.startsWith(c.first[0])) { score = 55; conf = 'medium' }
      else if (lp.includes(c.last) && c.last.length >= 5) { score = 35; conf = 'low' }
      if (conf && (!best || score > best.score)) best = { name: c.name, score, conf }
    }
    if (best) out.push({ email: u.email, bookings: u.booking_count, last_booking_date: u.last_booking_date, suggested_name: best.name, confidence: best.conf, score: best.score })
  }
  out.sort((a, b) => b.score - a.score || b.bookings - a.bookings)
  res.json(out)
})

// Apply approved matches: create a cancelled member per email + link its bookings +
// ensure they appear in the Cancellations & Saves section (link to an existing record,
// or create one so their save workflow lives alongside their workout history).
router.post('/reconcile/apply', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const matches = Array.isArray(req.body.matches) ? req.body.matches : []
  const supabase = db(); const sid = req.studio.id
  const normName = (s) => String(s || '').toLowerCase().replace(/\s*-\s*dup$/, '').replace(/\s+/g, ' ').trim()

  // Snapshot existing cancellation records so we only create what's genuinely missing.
  const { data: existingCanc } = await supabase.from('cancellation_log').select('member_id, member_name').eq('studio_id', sid)
  const cancIds = new Set((existingCanc || []).map(c => String(c.member_id)))
  const cancNames = new Set((existingCanc || []).map(c => normName(c.member_name)))

  let reconciled = 0, linked = 0, cancellationsCreated = 0
  for (const m of matches) {
    const email = String(m.email || '').trim().toLowerCase()
    if (!email) continue
    // Find the person's existing member record so we NEVER create a duplicate:
    //   1) exact email match (best); else
    //   2) an UNAMBIGUOUS name match (exactly one member with that name) — this is the
    //      usual case, because the reason the booking was unreconciled is that the SAIL
    //      record has a missing/different email. Reuse it and backfill the email.
    //   3) only when there's no email match AND no single clear name match do we create
    //      a MANUAL_ record (genuinely new person, or ambiguous common name → safer to add).
    let mem
    const { data: byEmail } = await supabase.from('onboarding_members')
      .select('*').eq('studio_id', sid).ilike('email', email).limit(2)
    if (byEmail && byEmail.length) {
      mem = byEmail[0]
    } else {
      const fullName = (m.full_name || '').trim()
      let byName = null
      if (fullName) {
        const { data: nm } = await supabase.from('onboarding_members')
          .select('*').eq('studio_id', sid).ilike('full_name', fullName)
        // Prefer a SAIL record (numeric id) with no email or this email — that's the
        // shell the import made. Falling back to the single overall match keeps the
        // old behavior. Ignore any pre-existing MANUAL_ dup so ambiguity from a prior
        // bad run doesn't block the reuse.
        const cand = (nm || []).filter(x => (x.email || '').toLowerCase() === email || !x.email
          || !String(x.customer_id || '').startsWith('MANUAL_'))
        const sail = cand.filter(x => !String(x.customer_id || '').startsWith('MANUAL_')
          && (!x.email || x.email.toLowerCase() === email))
        if (sail.length === 1) byName = sail[0]
        else if ((nm || []).length === 1) byName = nm[0]
      }
      if (byName) {
        mem = byName
        if (!byName.email) await supabase.from('onboarding_members').update({ email }).eq('id', byName.id)
      } else {
        const { data: created, error } = await supabase.from('onboarding_members').upsert({
          studio_id: sid, customer_id: `MANUAL_${email}`, email,
          full_name: m.full_name || null, member_type: 'member',
          is_cancelled: true, status: 'Cancelled', is_new_member: false, seen_in_last_import: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'studio_id,customer_id' }).select().single()
        if (error || !created) continue
        mem = created
      }
    }
    reconciled++
    const { data: upd } = await supabase.from('onboarding_bookings')
      .update({ member_id: mem.id })
      .eq('studio_id', sid).is('member_id', null).eq('member_email', email).select('booking_id')
    linked += (upd || []).length

    // Ensure a Cancellations & Saves record exists (auto-link + create if missing).
    const nm = normName(m.full_name || email)
    const already = cancIds.has(`MANUAL_${email}`) || (nm && cancNames.has(nm))
    if (!already) {
      // Approximate the cancel date with their last workout so the follow-up cadence is sane.
      const { data: lastBk } = await supabase.from('onboarding_bookings')
        .select('booking_date').eq('studio_id', sid).eq('member_id', mem.id)
        .order('booking_date', { ascending: false }).limit(1).maybeSingle()
      const reqDate = lastBk?.booking_date || todayInChicago()
      const followUp = (() => { const d = new Date(reqDate + 'T00:00:00'); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0] })()
      const { error: cErr } = await supabase.from('cancellation_log').upsert({
        studio_id: sid, member_name: m.full_name || email, member_id: `MANUAL_${email}`,
        date_requested: reqDate, cancel_reason: 'other',
        reason_notes: 'Reconciled from workout history — set the reason when you work the save',
        outcome: 'cancelled', win_back_step: 'call_scheduled', follow_up_date: followUp,
        offers_presented: [], offer_accepted: 'none', goal_recaptured: false,
        source: 'reconcile', import_key: `reconcile|${email}`, created_by: req.user.id,
      }, { onConflict: 'studio_id,import_key', ignoreDuplicates: true })
      if (!cErr) { cancellationsCreated++; cancIds.add(`MANUAL_${email}`); if (nm) cancNames.add(nm) }
    }
  }
  res.json({ reconciled, bookings_linked: linked, cancellations_created: cancellationsCreated })
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
    const curKey = monthKeyInChicago()
    await recomputeStudioTrends(supabase, req.studio.id, m, y, data.month_key === curKey)
  }
  res.json(data)
})

// ─── GET /api/member-activation/metrics?month_key=YYYY-MM ─────────────────────
// Returns computed vs. override (and the resolved value) for both Studio Trends
// metrics, so the UI can show the number, badge overrides, and explain them.
router.get('/metrics', authenticate, requireStudio, async (req, res) => {
  const supabase = db()
  const mk = req.query.month_key || monthKeyInChicago()
  const [y, m] = mk.split('-').map(Number)
  const curKey = monthKeyInChicago()

  const { count: computedCancels } = await supabase
    .from('onboarding_cancellation_ledger').select('id', { count: 'exact', head: true })
    .eq('studio_id', req.studio.id).eq('month_key', mk).eq('excluded', false)

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
             cancellations: build('cancellations', computedCancels || 0) })
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
  if (!['cancellations'].includes(metric)) return res.status(400).json({ error: 'invalid metric' })
  if (!month_key || override_value == null || !reason) return res.status(400).json({ error: 'month_key, override_value, reason required' })
  const supabase = db()
  const { data, error } = await supabase.from('onboarding_metric_overrides').upsert({
    studio_id: req.studio.id, metric, month_key, override_value: parseInt(override_value),
    reason, set_by: req.user.email || req.user.id, set_at: new Date().toISOString(),
  }, { onConflict: 'studio_id,metric,month_key' }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  const [y, m] = month_key.split('-').map(Number)
  const curKey = monthKeyInChicago()
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
  const curKey = monthKeyInChicago()
  await recomputeStudioTrends(supabase, req.studio.id, m, y, month_key === curKey)
  res.status(204).end()
})

// ─── GET /api/member-activation/daily-list ────────────────────────────────────
// One unified, prioritized list of members to reach today, each with WHY + script.
router.get('/daily-list', authenticate, requireStudio, async (req, res) => {
  const supabase = db()
  const studioId = req.studio.id
  const today = todayInChicago()

  await seedTemplates(supabase, studioId)

  const [{ data: tasks, error }, { data: templates }, { data: logRows }] = await Promise.all([
    supabase.from('onboarding_journey_tasks')
      .select('*, journey:onboarding_journeys!inner(id, status, current_track, member:onboarding_members!inner(id, full_name, phone, is_cancelled, status, join_date))')
      .eq('studio_id', studioId).eq('status', 'pending').lte('due_date', today),
    supabase.from('onboarding_touchpoint_templates').select('*').eq('studio_id', studioId),
    supabase.from('onboarding_touchpoint_log').select('member_id, touchpoint_key, done, notes, follow_up_date').eq('studio_id', studioId),
  ])
  if (error) return res.status(500).json({ error: error.message })
  const tplMap = new Map((templates || []).map(t => [t.template_key, t]))

  // Universal per-task log (notes + follow-up date + done) drives snooze/resolve for
  // every task kind. Keyed by member_id|task_key (journey trigger_ref, or 'reengage' /
  // 'missed_guest' for the recurring nudges).
  const logMap = new Map((logRows || []).map(r => [`${r.member_id}|${r.touchpoint_key}`, r]))
  const logFor = (memberId, key) => logMap.get(`${memberId}|${key}`) || null
  // One-time tasks are gone once done; recurring nudges (reengage/missed_guest) are not.
  const ONE_TIME = /^(day_|milestone_|passport|thank_you_card|save_|first_session)/
  // Decorate an item with its log; return false to DROP it (snoozed to a future date, or
  // a resolved one-time task). Sets notes/has_note/follow_up_date/overdue.
  const applyLog = (item, key) => {
    const lg = logFor(item.member_id, key)
    if (lg) {
      item.notes = lg.notes || null
      item.has_note = !!lg.notes
      item.follow_up_date = lg.follow_up_date || null
      if (lg.follow_up_date && lg.follow_up_date > today) return false   // snoozed until the follow-up date
      if (lg.done && ONE_TIME.test(key)) return false                    // resolved one-time task
    }
    item.overdue = !!(item.due_date && item.due_date < today)
    return true
  }

  // Filter out cancelled/paused/graduated-day-based, then enrich context for rendering.
  const live = (tasks || []).filter(t => {
    const j = t.journey, m = j?.member
    if (!m || m.is_cancelled) return false
    if (j.status === 'paused') return false
    if (t.trigger_kind === 'day_based' && j.status !== 'active') return false
    // A day step whose script was deactivated in Script Admin shouldn't surface (the
    // roster + journey view are already template-driven; keep the feed consistent).
    if (t.trigger_kind === 'day_based') {
      const tpl = tplMap.get(t.template_key)
      if (tpl && tpl.active === false) return false
    }
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

  let items = live.map(t => {
    const m = t.journey.member
    const a = actMap.get(m.id) || {}
    const tpl = tplMap.get(t.template_key) || {}
    const ctx = {
      first_name: t.context?.first_name || firstName(m.full_name),
      visit_days: a.visit_days || 0,
      total_sessions: a.total_sessions || 0,
      workouts_tried: a.workouts_tried || 0,
      goal_text: goalMap.get(m.id) || 'their goal',
      ...t.context,
      // Live lapse (wins over any value stored when the task was created).
      days_lapsed: daysBetween(a.last_booking_date),
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
      last_booking_date: a.last_booking_date || null,
      days_lapsed: ctx.days_lapsed,
      join_date: m.join_date || null,
    }
  }).filter(it => {
    // A "quiet N days" save call is moot once the member has booked again —
    // hide it live (the engine reverts the journey on the next import).
    if (it.trigger_ref === 'save_14d') return (it.days_lapsed ?? 999) >= 14
    if (it.trigger_ref === 'save_7d') return (it.days_lapsed ?? 999) >= 7
    return true
  })

  // Attach the shared log (notes / follow-up) and drop snoozed or resolved journey tasks.
  items = items.filter(it => applyLog(it, it.trigger_ref))

  // New members: keep only the NEXT (earliest-due) journey step per member — the roster
  // (GET /new-members) still shows the whole ladder. Nothing shows until a step comes due.
  const nextDay = new Map()
  for (const it of items) {
    if (it.trigger_kind !== 'day_based') continue
    const cur = nextDay.get(it.member_id)
    if (!cur || String(it.due_date) < String(cur.due_date)) nextDay.set(it.member_id, it)
  }
  items = items.filter(it => it.trigger_kind !== 'day_based' || nextDay.get(it.member_id) === it)

  // Re-engagement (roster-wide, live-computed): any active member lapsed 14+ days,
  // excluding first-90 save-fork members and anyone still within their tier cooldown.
  // Cooldown scales with how cold they are so the coldest are nudged monthly, not weekly.
  const REENGAGE_COOLDOWN = { reengage_14: 10, reengage_30: 14, reengage_60: 30 }  // days
  const logWindow = new Date(Date.now() - 90 * 86400000).toISOString()
  const [allMembers, actAll] = await Promise.all([
    fetchAllStudio(supabase, 'onboarding_members', 'id, full_name, phone, status, is_cancelled, join_date, member_type, lead_status', studioId),
    fetchAllStudio(supabase, 'onboarding_member_activity', 'member_id, last_booking_date, workouts_tried', studioId),
  ])
  const [{ data: allJourneys }, { data: reengRows }, { data: upcoming }] = await Promise.all([
    supabase.from('onboarding_journeys').select('member_id, status, start_date').eq('studio_id', studioId),
    supabase.from('onboarding_reengage_log').select('member_id, contacted_at, contacted_by').eq('studio_id', studioId).gte('contacted_at', logWindow).order('contacted_at', { ascending: false }),
    supabase.from('events').select('title, start_date').eq('studio_id', studioId).gte('start_date', today).order('start_date').limit(1),
  ])
  const lastBookMap = new Map((actAll || []).map(a => [a.member_id, a.last_booking_date]))
  const jMap = new Map((allJourneys || []).map(j => [j.member_id, j]))
  // Most-recent contact per member (rows come newest-first), plus a real-attempt count
  // (snoozes count toward the cooldown but not toward the displayed follow-up tally).
  const lastContactMap = new Map(), attemptsMap = new Map(), dismissedSet = new Set()
  for (const r of (reengRows || [])) {
    if (String(r.contacted_by || '').startsWith('dismissed:')) { dismissedSet.add(r.member_id); continue }  // deleted by the team
    if (!lastContactMap.has(r.member_id)) lastContactMap.set(r.member_id, r.contacted_at)
    if (!String(r.contacted_by || '').startsWith('snoozed:')) attemptsMap.set(r.member_id, (attemptsMap.get(r.member_id) || 0) + 1)
  }
  const eventName = upcoming && upcoming[0] ? `${upcoming[0].title} is coming up — ` : ''
  const addDaysStr = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }

  for (const mm of (allMembers || [])) {
    if (mm.is_cancelled || !/active/i.test(mm.status || '') || dismissedSet.has(mm.id)) continue
    if (mm.member_type && mm.member_type !== 'member') continue  // don't re-engage employees/comp/reciprocal
    const j = jMap.get(mm.id)
    const inFirst90 = j && j.status === 'active' && j.start_date && addDaysStr(j.start_date, 90) >= today
    if (inFirst90) continue  // save fork owns first-90 lapses
    const ref = lastBookMap.get(mm.id) || mm.join_date
    if (!ref) continue
    const lapse = Math.floor((new Date(today) - new Date(ref)) / 86400000)
    if (lapse < 14) continue
    const key = lapse >= 60 ? 'reengage_60' : lapse >= 30 ? 'reengage_30' : 'reengage_14'
    // Tier-specific cooldown: hide until enough days have passed since the last contact.
    const lastContact = lastContactMap.get(mm.id)
    if (lastContact) {
      const sinceContact = Math.floor((Date.now() - new Date(lastContact).getTime()) / 86400000)
      if (sinceContact < REENGAGE_COOLDOWN[key]) continue
    }
    const tpl = tplMap.get(key) || {}
    const ctx = { first_name: firstName(mm.full_name), days_lapsed: lapse, event_name: eventName }
    const tierDays = lapse >= 60 ? 60 : lapse >= 30 ? 30 : 14
    const item = {
      id: `reengage:${mm.id}`, kind: 'reengage', member_id: mm.id,
      member_name: mm.full_name || ctx.first_name, phone: mm.phone || null,
      channel: tpl.channel || (lapse >= 60 ? 'call' : 'text'),
      label: tpl.label || key, trigger_kind: 'reengage', trigger_ref: key,
      // De-prioritized vs onboarding/milestones; the coldest (60+) rank last.
      priority: lapse >= 60 ? 8 : lapse >= 30 ? 7 : 6, reward_key: null,
      script: renderTemplate(tpl.body || '', ctx),
      due_date: addDaysStr(ref, tierDays),   // when they crossed the tier threshold
      last_booking_date: lastBookMap.get(mm.id) || null, days_lapsed: lapse,
      last_contacted_at: lastContact || null, attempts: attemptsMap.get(mm.id) || 0,
    }
    // 'reengage' (constant) so a note/snooze survives a 14→30→60 tier change.
    if (applyLog(item, 'reengage')) items.push(item)
  }

  // Workout passport (roster-wide, live): any active member who has tried all 12
  // workout types and hasn't been celebrated yet (no sticker reward, no passport task).
  const [{ data: stickers }, { data: passportTasks }] = await Promise.all([
    supabase.from('onboarding_rewards_awarded').select('member_id').eq('studio_id', studioId).eq('reward_key', 'sticker'),
    supabase.from('onboarding_journey_tasks').select('journey:onboarding_journeys!inner(member_id)').eq('studio_id', studioId).eq('trigger_ref', 'passport_sticker'),
  ])
  const celebrated = new Set((stickers || []).map(r => r.member_id))
  for (const pt of passportTasks || []) if (pt.journey?.member_id) celebrated.add(pt.journey.member_id)
  const workoutsMap = new Map((actAll || []).map(a => [a.member_id, a.workouts_tried || 0]))
  const passTpl = tplMap.get('passport_sticker') || {}
  for (const mm of (allMembers || [])) {
    if (mm.is_cancelled || !/active/i.test(mm.status || '')) continue
    if (mm.member_type && mm.member_type !== 'member') continue
    if (celebrated.has(mm.id) || (workoutsMap.get(mm.id) || 0) < 12) continue
    const ctx = { first_name: firstName(mm.full_name) }
    const item = {
      id: `passport:${mm.id}`, kind: 'passport', member_id: mm.id,
      member_name: mm.full_name || ctx.first_name, phone: mm.phone || null,
      channel: passTpl.channel || 'text', label: passTpl.label || 'Workout passport complete 🎉',
      trigger_kind: 'event_based', trigger_ref: 'passport_sticker', priority: 4,
      reward_key: 'sticker', script: renderTemplate(passTpl.body || '', ctx), due_date: today,
      last_booking_date: lastBookMap.get(mm.id) || null, days_lapsed: null,
    }
    if (applyLog(item, 'passport_sticker')) items.push(item)
  }

  // Missed guests (SAIL "Be Back" leads): a be-back call/text, excluding Do Not Call,
  // on the same contact cooldown as re-engagement so the team isn't nagging weekly.
  const MISSED_COOLDOWN = 21  // days
  const mgTpl = tplMap.get('missed_guest') || {}
  for (const mm of (allMembers || [])) {
    if (mm.member_type !== 'missed_guest') continue
    if (/do\s*not\s*call/i.test(mm.lead_status || '')) continue
    if (dismissedSet.has(mm.id)) continue
    const lastContact = lastContactMap.get(mm.id)
    if (lastContact && Math.floor((Date.now() - new Date(lastContact).getTime()) / 86400000) < MISSED_COOLDOWN) continue
    const ctx = { first_name: firstName(mm.full_name), event_name: eventName }
    const item = {
      id: `missed:${mm.id}`, kind: 'missed_guest', member_id: mm.id,
      member_name: mm.full_name || ctx.first_name, phone: mm.phone || null,
      channel: mgTpl.channel || 'text', label: mgTpl.label || 'Missed guest — invite back',
      trigger_kind: 'lead', trigger_ref: 'missed_guest', priority: 9, reward_key: null,
      script: renderTemplate(mgTpl.body || "Hi {first_name}! We'd love to see you back at HOTWORX — come in for a free workout this week! 🔥", ctx),
      due_date: mm.join_date || today,   // dated from when they first came in (lead-created)
      last_booking_date: lastBookMap.get(mm.id) || null, days_lapsed: null,
      last_contacted_at: lastContact || null, attempts: attemptsMap.get(mm.id) || 0,
    }
    if (applyLog(item, 'missed_guest')) items.push(item)
  }

  // (Day-based next-step collapse already ran above; no blanket day_based exclusion here.)

  // Order by category — Onboarding first, then Milestones, then Re-engagement —
  // and within each by priority (re-engagement 14→30→60) then due date.
  const catRank = (it) => {
    const r = it.trigger_ref || ''
    if (r === 'missed_guest') return 3
    if (r.startsWith('reengage')) return 2
    if (r.startsWith('milestone') || r === 'passport_sticker') return 1
    return 0
  }
  items.sort((x, y) =>
    (x.overdue ? 0 : 1) - (y.overdue ? 0 : 1) ||   // overdue work floats to the top
    catRank(x) - catRank(y) ||
    x.priority - y.priority ||
    String(x.due_date).localeCompare(String(y.due_date))
  )
  res.json(items)
})

// ─── New-member roster: last 60 days + per-member journey checklist ────────────
router.get('/new-members', authenticate, requireStudio, async (req, res) => {
  const supabase = db(); const sid = req.studio.id
  const today = todayInChicago()
  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)

  const { data: members } = await supabase.from('onboarding_members')
    .select('id, full_name, phone, join_date, member_type, is_cancelled')
    .eq('studio_id', sid).gte('join_date', since).order('join_date', { ascending: false })
  const cohort = (members || []).filter(m => !m.is_cancelled && (!m.member_type || m.member_type === 'member') && m.join_date)
  const ids = cohort.map(m => m.id)
  if (!ids.length) return res.json([])

  const [{ data: journeys }, { data: recog }, { data: rewards }, { data: xforms }, { data: activity }, { data: logs }, { data: templates }] = await Promise.all([
    supabase.from('onboarding_journeys').select('id, member_id').eq('studio_id', sid).in('member_id', ids),
    supabase.from('onboarding_recognition_tasks').select('member_id, type, status').eq('studio_id', sid).in('member_id', ids),
    supabase.from('onboarding_rewards_awarded').select('member_id, reward_key').eq('studio_id', sid).in('member_id', ids),
    supabase.from('onboarding_transformation_records').select('member_id, before_photo_url').eq('studio_id', sid).in('member_id', ids),
    supabase.from('onboarding_member_activity').select('member_id, workouts_tried, visit_days, last_booking_date').eq('studio_id', sid).in('member_id', ids),
    supabase.from('onboarding_touchpoint_log').select('member_id, touchpoint_key, done, notes').eq('studio_id', sid).in('member_id', ids),
    supabase.from('onboarding_touchpoint_templates').select('template_key, label, sort_order, active').eq('studio_id', sid),
  ])
  // Manual check-off / notes overlay, keyed by member_id → { key → {done, notes} }.
  const logBy = new Map()
  for (const l of logs || []) { if (!logBy.has(l.member_id)) logBy.set(l.member_id, {}); logBy.get(l.member_id)[l.touchpoint_key] = l }
  const jIds = (journeys || []).map(j => j.id)
  const jMember = new Map((journeys || []).map(j => [j.id, j.member_id]))
  const { data: jtasks } = jIds.length
    ? await supabase.from('onboarding_journey_tasks').select('journey_id, trigger_ref, status, due_date, completed_at').in('journey_id', jIds)
    : { data: [] }

  const tasksBy = new Map()
  for (const t of jtasks || []) {
    const mid = jMember.get(t.journey_id); if (!mid) continue
    if (!tasksBy.has(mid)) tasksBy.set(mid, {})
    tasksBy.get(mid)[t.trigger_ref] = t   // one task per (journey, trigger_ref)
  }
  const cardStatus = new Map((recog || []).filter(r => r.type === 'thank_you_card').map(r => [r.member_id, r.status]))
  const stickerSet = new Set((rewards || []).filter(r => r.reward_key === 'sticker').map(r => r.member_id))
  const photoSet = new Set((xforms || []).filter(x => x.before_photo_url).map(x => x.member_id))
  const actBy = new Map((activity || []).map(a => [a.member_id, a]))

  const dayStatus = (task) => {
    if (!task) return { status: 'na' }
    if (task.status === 'completed') return { status: 'done', when: task.completed_at }
    if (task.status === 'skipped') return { status: 'skipped' }
    return { status: (task.due_date && task.due_date <= today) ? 'due' : 'upcoming', due_date: task.due_date }
  }

  // The roster checklist is DRIVEN BY the Script Admin templates so it stays in sync:
  // reordering, renaming, deactivating, or adding a custom journey script all reflect
  // here. Each known template maps to a short chip label + its status source; custom
  // journey scripts (custom_*) show up automatically with a derived short label.
  const KNOWN_CHIP = {
    day0_orientation:   { key: 'day_0_orientation', label: 'Orientation' },
    day2_goal_call:     { key: 'day_2',             label: 'Day 2 goal' },
    day5_checkin:       { key: 'day_5',             label: 'Day 5 check-in' },
    day21_bring_friend: { key: 'day_21',            label: 'Day 21 friend' },
    day30_review:       { key: 'day_30',            label: 'Day 30 review' },
    day60_review:       { key: 'day_60',            label: 'Day 60 review' },
    day90_close:        { key: 'day_90',            label: 'Day 90 close' },
    thank_you_card:     { key: 'thank_you_card',    label: 'Thank-you card' },
    passport_sticker:   { key: 'passport',          label: 'Passport' },
  }
  const shortChip = (lbl = '') => {
    const mo = lbl.match(/day\s*(\d+)/i)
    const base = mo ? `Day ${mo[1]}` : lbl.split(/[—\-:•]/)[0].trim()
    return base.length > 18 ? base.slice(0, 17) + '…' : base
  }
  // Active journey-category templates, in Script Admin (sort_order) order.
  let journeyTpls = (templates || [])
    .filter(t => t.active !== false && (KNOWN_CHIP[t.template_key] || t.template_key.startsWith('custom_')))
    .sort((a, b) => (a.sort_order ?? 900) - (b.sort_order ?? 900))
  // Fallback to the canonical order if templates are unavailable, so the roster is never blank.
  if (!journeyTpls.length) {
    journeyTpls = ['day0_orientation', 'day2_goal_call', 'day5_checkin', 'day21_bring_friend', 'day30_review', 'day60_review', 'day90_close', 'thank_you_card', 'passport_sticker']
      .map(k => ({ template_key: k, label: KNOWN_CHIP[k].label }))
  }

  const out = cohort.map(m => {
    const tks = tasksBy.get(m.id) || {}
    const daysIn = Math.floor((new Date(today) - new Date(m.join_date)) / 86400000)
    const wt = actBy.get(m.id)?.workouts_tried || 0
    const cs = cardStatus.get(m.id)
    const tps = []
    for (const tpl of journeyTpls) {
      const k = tpl.template_key
      const known = KNOWN_CHIP[k]
      if (known && known.key === 'thank_you_card') {
        tps.push({ key: 'thank_you_card', label: known.label, status: cs === 'completed' ? 'done' : cs ? 'due' : 'na' })
      } else if (known && known.key === 'passport') {
        tps.push({ key: 'passport', label: known.label, status: stickerSet.has(m.id) ? 'done' : (wt >= 12 ? 'due' : 'upcoming') })
      } else if (known) {
        tps.push({ key: known.key, label: known.label, ...dayStatus(tks[known.key]) })
      } else {
        // Custom journey step added in Script Admin — status from its journey task (if any),
        // else driven purely by the manual check-off overlay below.
        tps.push({ key: k, label: shortChip(tpl.label), ...dayStatus(tks[k]) })
      }
      // Pin the synthetic 1st-day photo right after the Day-2 goal call.
      if (k === 'day2_goal_call') {
        const day2 = tks['day_2']
        tps.push({ key: 'photo', label: '1st-day photo',
          status: photoSet.has(m.id) ? 'done' : (day2 && day2.due_date && day2.due_date <= today ? 'due' : 'upcoming') })
      }
    }

    // Overlay manual check-off + notes: a logged 'done' wins; notes always attach.
    const mlog = logBy.get(m.id) || {}
    for (const t of tps) {
      const l = mlog[t.key]
      if (l) { if (l.done) t.status = 'done'; if (l.notes) t.notes = l.notes }
    }

    return {
      member_id: m.id, full_name: m.full_name, join_date: m.join_date, days_in: daysIn,
      visit_days: actBy.get(m.id)?.visit_days || 0,
      last_booking_date: actBy.get(m.id)?.last_booking_date || null,
      due_count: tps.filter(t => t.status === 'due').length,
      done_count: tps.filter(t => t.status === 'done').length,
      touchpoints: tps,
    }
  })
  res.json(out)
})

// Check off (or reopen) a new-member touchpoint + save notes. Layered store; also
// nudges the native record so other surfaces stay in sync where one exists.
router.post('/new-members/:memberId/touchpoint', authenticate, requireStudio, async (req, res) => {
  const supabase = db(); const sid = req.studio.id, mid = req.params.memberId
  const { key, done, notes } = req.body
  if (!key) return res.status(400).json({ error: 'key required' })
  const who = req.user.email || req.user.id
  const { error } = await supabase.from('onboarding_touchpoint_log').upsert({
    studio_id: sid, member_id: mid, touchpoint_key: key,
    done: !!done, notes: notes || null,
    completed_by: done ? who : null, completed_at: done ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'studio_id,member_id,touchpoint_key' })
  if (error) return res.status(500).json({ error: error.message })

  // Keep native records consistent for the touchpoints that have them.
  if (done) {
    if (key === 'passport') {
      await supabase.from('onboarding_rewards_awarded').upsert({
        studio_id: sid, member_id: mid, reward_key: 'sticker', awarded_at: new Date().toISOString(), fulfilled: true,
      }, { onConflict: 'studio_id,member_id,reward_key' })
    } else if (key === 'thank_you_card') {
      await supabase.from('onboarding_recognition_tasks')
        .update({ status: 'completed', completed_by: who, completed_at: new Date().toISOString() })
        .eq('studio_id', sid).eq('member_id', mid).eq('type', 'thank_you_card').eq('status', 'pending')
    } else if (key.startsWith('day_')) {
      // Complete the matching journey task so it also leaves the Daily List.
      const { data: js } = await supabase.from('onboarding_journeys').select('id').eq('studio_id', sid).eq('member_id', mid)
      const jIds = (js || []).map(j => j.id)
      if (jIds.length) await supabase.from('onboarding_journey_tasks')
        .update({ status: 'completed', completed_by: who, completed_at: new Date().toISOString() })
        .in('journey_id', jIds).eq('trigger_ref', key).eq('status', 'pending')
    }
  }
  res.json({ ok: true })
})

// ─── Universal Daily-List task log ────────────────────────────────────────────
// One endpoint for EVERY task kind: save a note + a follow-up date + done, into the
// shared onboarding_touchpoint_log (keyed by member_id + task_key). A future
// follow_up_date snoozes the task; done resolves it. Mirrors the side-effects of the
// per-kind endpoints so native records (journey tasks, rewards, recognition, reengage
// history) stay consistent.
router.post('/daily-list/log', authenticate, requireStudio, async (req, res) => {
  const supabase = db(); const sid = req.studio.id
  const { member_id, task_key, note, follow_up_date, done, kind } = req.body
  if (!member_id || !task_key) return res.status(400).json({ error: 'member_id and task_key required' })
  const who = req.user.email || req.user.id
  const fu = follow_up_date && /^\d{4}-\d{2}-\d{2}$/.test(follow_up_date) ? follow_up_date : null

  // Day-2 hard gate: don't let the generic modal complete Day 2 without goal/photo/consent.
  if (task_key === 'day_2' && done) {
    const { data: tr } = await supabase.from('onboarding_transformation_records')
      .select('goal_text, before_photo_url, consent').eq('studio_id', sid).eq('member_id', member_id).maybeSingle()
    if (!tr || !tr.goal_text || !tr.before_photo_url || !tr.consent) {
      return res.status(422).json({ error: 'day2_gate', message: 'Capture goal, before photo, and consent before completing Day 2.' })
    }
  }

  const { error } = await supabase.from('onboarding_touchpoint_log').upsert({
    studio_id: sid, member_id, touchpoint_key: task_key,
    done: !!done, notes: note || null, follow_up_date: fu,
    completed_by: done ? who : null, completed_at: done ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'studio_id,member_id,touchpoint_key' })
  if (error) return res.status(500).json({ error: error.message })

  if (done) {
    if (task_key === 'passport' || task_key === 'passport_sticker') {
      await supabase.from('onboarding_rewards_awarded').upsert({
        studio_id: sid, member_id, reward_key: 'sticker', awarded_at: new Date().toISOString(), fulfilled: true,
      }, { onConflict: 'studio_id,member_id,reward_key' })
    } else if (task_key === 'thank_you_card') {
      await supabase.from('onboarding_recognition_tasks')
        .update({ status: 'completed', completed_by: who, completed_at: new Date().toISOString() })
        .eq('studio_id', sid).eq('member_id', member_id).eq('type', 'thank_you_card').eq('status', 'pending')
    }
    // Complete the matching journey task (day_*, milestone_*, save_*, passport_sticker…) so all surfaces agree.
    const { data: js } = await supabase.from('onboarding_journeys').select('id').eq('studio_id', sid).eq('member_id', member_id)
    const jIds = (js || []).map(j => j.id)
    if (jIds.length) await supabase.from('onboarding_journey_tasks')
      .update({ status: 'completed', completed_by: who, completed_at: new Date().toISOString() })
      .in('journey_id', jIds).eq('trigger_ref', task_key).eq('status', 'pending')
  }

  // Recurring nudges keep their attempt/cooldown history in the reengage log.
  if (kind === 'reengage' || kind === 'missed_guest') {
    if (done) await supabase.from('onboarding_reengage_log').insert({ studio_id: sid, member_id, contacted_by: who })
    else if (fu) await supabase.from('onboarding_reengage_log').insert({ studio_id: sid, member_id, contacted_by: `snoozed:${who}` })
  }

  res.json({ ok: true })
})

// Log a re-engagement contact (starts the cooldown; member drops off until it expires or they book).
router.post('/reengage/:memberId/complete', authenticate, requireStudio, async (req, res) => {
  const { error } = await db().from('onboarding_reengage_log').insert({
    studio_id: req.studio.id, member_id: req.params.memberId, contacted_by: req.user.email || req.user.id,
  })
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json({ ok: true })
})

// Snooze a re-engagement item ("not now") — same tier cooldown, but tagged so it
// isn't counted as an actual follow-up attempt in the card history.
router.post('/reengage/:memberId/snooze', authenticate, requireStudio, async (req, res) => {
  const { error } = await db().from('onboarding_reengage_log').insert({
    studio_id: req.studio.id, member_id: req.params.memberId, contacted_by: `snoozed:${req.user.email || req.user.id}`,
  })
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json({ ok: true })
})

// Celebrate / dismiss a workout-passport item — award the sticker (idempotent) so
// it drops off the list. fulfilled=true means the physical sticker was handed over.
router.post('/passport/:memberId/complete', authenticate, requireStudio, async (req, res) => {
  const { error } = await db().from('onboarding_rewards_awarded').upsert({
    studio_id: req.studio.id, member_id: req.params.memberId, reward_key: 'sticker',
    awarded_at: new Date().toISOString(), fulfilled: !!req.body.fulfilled,
  }, { onConflict: 'studio_id,member_id,reward_key' })
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json({ ok: true })
})

// Permanently remove a member from re-engagement (team decided it's not needed).
router.post('/reengage/:memberId/dismiss', authenticate, requireStudio, async (req, res) => {
  const { error } = await db().from('onboarding_reengage_log').insert({
    studio_id: req.studio.id, member_id: req.params.memberId, contacted_by: `dismissed:${req.user.email || req.user.id}`,
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
    .select('*').eq('studio_id', req.studio.id).eq('active', true)
    .order('sort_order', { ascending: true, nullsFirst: false }).order('template_key')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

// Reorder scripts — the order drives the member journey path. Body: { keys: [...] }
router.put('/templates/reorder', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const keys = Array.isArray(req.body.keys) ? req.body.keys : []
  const supabase = db()
  for (let i = 0; i < keys.length; i++) {
    await supabase.from('onboarding_touchpoint_templates')
      .update({ sort_order: (i + 1) * 10, updated_at: new Date().toISOString() })
      .eq('studio_id', req.studio.id).eq('template_key', keys[i])
  }
  res.json({ ok: true })
})

// Add a new custom script/milestone template.
router.post('/templates', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { label, channel, body } = req.body
  if (!label || !String(label).trim()) return res.status(400).json({ error: 'label required' })
  const ch = ['text', 'call', 'in_studio'].includes(channel) ? channel : 'text'
  const slug = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'script'
  const supabase = db()
  // Ensure a unique key within the studio (custom_<slug>, then _2, _3, …).
  const { data: existing } = await supabase.from('onboarding_touchpoint_templates')
    .select('template_key').eq('studio_id', req.studio.id)
  const have = new Set((existing || []).map(t => t.template_key))
  let key = `custom_${slug}`
  for (let i = 2; have.has(key); i++) key = `custom_${slug}_${i}`
  const { data, error } = await supabase.from('onboarding_touchpoint_templates').insert({
    studio_id: req.studio.id, template_key: key, label: String(label).trim(), channel: ch,
    body: body || '', active: true, updated_by: req.user.email || req.user.id, updated_at: new Date().toISOString(),
  }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
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

// Soft-delete: hide from the list but keep the row so seeded defaults don't respawn.
router.delete('/templates/:key', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const { error } = await db().from('onboarding_touchpoint_templates')
    .update({ active: false, updated_by: req.user.email || req.user.id, updated_at: new Date().toISOString() })
    .eq('studio_id', req.studio.id).eq('template_key', req.params.key)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── Cards & Birthdays recognition checklist ──────────────────────────────────
router.get('/recognition', authenticate, requireStudio, async (req, res) => {
  let q = db().from('onboarding_recognition_tasks').select('*').eq('studio_id', req.studio.id)
  if (req.query.type) q = q.eq('type', req.query.type)
  if (req.query.month_key) q = q.eq('month_key', req.query.month_key)
  if (req.query.status) q = q.eq('status', req.query.status)
  const { data, error } = await q.order('ref_date', { ascending: true }).limit(1000)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

router.post('/recognition/:id/complete', authenticate, requireStudio, async (req, res) => {
  const { data, error } = await db().from('onboarding_recognition_tasks')
    .update({ status: 'completed', completed_by: req.user.email || req.user.id, completed_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('studio_id', req.studio.id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.post('/recognition/:id/skip', authenticate, requireStudio, async (req, res) => {
  const { data, error } = await db().from('onboarding_recognition_tasks')
    .update({ status: 'skipped', completed_by: req.user.email || req.user.id, completed_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('studio_id', req.studio.id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Delete a recognition task (birthday / thank-you card) — e.g. a bad birthday-list row.
router.delete('/recognition/:id', authenticate, requireStudio, async (req, res) => {
  const { error } = await db().from('onboarding_recognition_tasks')
    .delete().eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// Monthly birthday upload → create birthday checklist tasks (deduped, idempotent).
router.post('/recognition/birthdays/import', authenticate, requireStudio, requireRole('owner', 'manager'), async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : []
  const year = new Date().getFullYear()
  const supabase = db()

  // Preload roster for member matching (by SAIL Id / customer_id, then email).
  const { data: members } = await supabase.from('onboarding_members')
    .select('id, customer_id, email').eq('studio_id', req.studio.id)
  const byCid = new Map((members || []).map(m => [m.customer_id, m]))
  const byEmail = new Map((members || []).filter(m => m.email).map(m => [String(m.email).toLowerCase(), m]))

  let skipped = 0, excluded = 0, addressUpdated = 0
  const out = []
  for (const raw of rows) {
    const r = normalizeRow(raw)
    const sub_status = pick(r, ['Lead Sub Status', 'Sub Status', 'Substatus', 'SubStatus'])
    const lead_status = pick(r, ['Lead Status', 'Status'])
    // Never text people marked not-interested or do-not-call.
    if ((sub_status && /not interested/i.test(sub_status)) || (lead_status && /do not call/i.test(lead_status))) { excluded++; continue }

    const name = pick(r, ['Full Name', 'Name', 'Member Name', 'Customer Name'])
      || [pick(r, ['First Name', 'FirstName']), pick(r, ['Last Name', 'LastName'])].filter(Boolean).join(' ').trim()
    const md = birthdayMonthDay(pick(r, ['DOB', 'Birthday', 'Birth Date', 'BirthDate', 'Date of Birth', 'Bday', 'Birthdate']))
    if (!name || !md) { skipped++; continue }
    const email = (pick(r, ['Email Address', 'Email']) || '').toLowerCase() || null
    const phone = pick(r, ['Phone Number', 'Phone', 'Phone No', 'Mobile', 'Cell']) || null
    const customer_id = pick(r, ['Id', 'Customer Id', 'CustomerId', 'Customer ID'])
    const last_session = parseDate(pick(r, ['Last Booked Session', 'Last Session', 'Last Booking', 'Last Booked']))

    // Match to an existing member; if found, save their mailing address to the profile.
    const matched = (customer_id && byCid.get(customer_id)) || (email && byEmail.get(email)) || null
    const address = pick(r, ['Address', 'Street', 'Address Line 1'])
    const city = pick(r, ['City'])
    const state = pick(r, ['State'])
    const postal_code = pick(r, ['Postal Code', 'Zip', 'Zip Code', 'ZipCode', 'Zipcode'])
    if (matched && (address || city || state || postal_code)) {
      await supabase.from('onboarding_members').update({
        address: address || null, city: city || null, state: state || null, postal_code: postal_code || null,
        updated_at: new Date().toISOString(),
      }).eq('id', matched.id)
      addressUpdated++
    }

    const mm = String(md.m).padStart(2, '0'), dd = String(md.d).padStart(2, '0')
    const month_key = `${year}-${mm}`
    const keyId = email || name.toLowerCase().replace(/\s+/g, ' ')
    out.push({
      studio_id: req.studio.id, type: 'birthday', member_id: matched?.id || null,
      member_name: name, email, phone, customer_id: customer_id || null,
      lead_status: lead_status || null, sub_status: sub_status || null, last_session,
      ref_date: `${year}-${mm}-${dd}`, month_key, source: 'import',
      dedup_key: `bday|${month_key}|${keyId}`,
    })
  }
  const byKey = new Map()
  for (const o of out) byKey.set(o.dedup_key, o)
  const deduped = [...byKey.values()]
  let created = 0
  for (let i = 0; i < deduped.length; i += 500) {
    const { data, error } = await supabase.from('onboarding_recognition_tasks')
      .upsert(deduped.slice(i, i + 500), { onConflict: 'studio_id,dedup_key', ignoreDuplicates: true }).select('id')
    if (error) return res.status(500).json({ error: error.message })
    created += (data || []).length
  }
  res.json({ received: rows.length, created, skipped, excluded, address_updated: addressUpdated })
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
