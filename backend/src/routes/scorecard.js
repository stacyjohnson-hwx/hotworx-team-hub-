const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')
const { ensureScorecardSchema } = require('../services/scorecardSchema')
const {
  STATUS_THRESHOLDS, GROUPS, GROUP_ORDER, CATALOG, HERO_KEYS,
} = require('../services/scorecardCatalog')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Best-effort: try to auto-create the tables via the direct pg connection
// (DATABASE_URL). If that connection isn't available in this environment, we do
// NOT block — the tables may already exist (created via the Supabase SQL editor),
// and all reads/writes below go through the Supabase service client regardless.
// If the tables genuinely don't exist, the Supabase queries surface a clear error.
async function withSchema(res, fn) {
  try {
    await ensureScorecardSchema()
  } catch (err) {
    console.warn('[scorecard] auto-bootstrap unavailable, continuing via Supabase client:', err.message)
  }
  return fn()
}

// Build the fully-resolved metric list for a month: catalog + owner goal overrides
// + this month's actuals.
function resolveMetrics(goalRows, actuals) {
  const overrides = {}
  for (const g of goalRows || []) overrides[g.metric_key] = g
  return CATALOG.map((m) => {
    const ov = overrides[m.key] || {}
    const goal = ov.goal != null ? Number(ov.goal) : m.goal
    // "lower is better" is intrinsic to the metric (attrition, open issues) — always
    // from the catalog, never from an owner override (which could wrongly flip colors).
    const lowerIsBetter = !!m.lowerIsBetter
    const actual = actuals && actuals[m.key] != null ? actuals[m.key] : null
    return {
      key: m.key,
      label: m.label,
      group: m.group,
      type: m.type,
      source: m.source,
      note: m.note || null,
      goal,
      lowerIsBetter,
      actual,
      auto: m.auto || null,        // computeKey when the value is pulled, not entered
      autoGoal: m.autoGoal || null, // computeKey when the GOAL is pulled (e.g. ITB goal)
      isHero: m.group === 'hero',
    }
  })
}

// Pull values that feed auto metrics from other modules (Studio Trends, Events,
// Promotions, Maintenance). Returns { values: { computeKey -> number|null }, extras }.
async function computeAutoValues(sb, studioId, year, month) {
  const pm = month === 1 ? 12 : month - 1
  const py = month === 1 ? year - 1 : year
  const round = (n, d = 0) => { const f = 10 ** d; return Math.round(n * f) / f }
  const pad = (n) => String(n).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  const monthStart = `${year}-${pad(month)}-01`
  const monthEnd = `${year}-${pad(month)}-${pad(lastDay)}`

  // Month-to-date end (today for the current month, full month if past, none if future).
  const now = new Date()
  const curY = now.getFullYear(), curM = now.getMonth() + 1, curD = now.getDate()
  let endDay
  if (year > curY || (year === curY && month > curM)) endDay = 0
  else if (year < curY || (year === curY && month < curM)) endDay = lastDay
  else endDay = Math.min(curD, lastDay)
  const shiftEnd = endDay === 0 ? '1900-01-01' : `${year}-${pad(month)}-${pad(endDay)}`

  const monthKey = `${year}-${pad(month)}`
  const [thisT, prevT, evRes, promoRes, maintRes, taskRes, compRes, shiftRes, goalRes,
         recogRes, newJourneysRes, milestoneRes,
         b2bContactsRes, b2bInterRes, terrRes, terrVisitRes, membersRes, tpLogRes,
         contestsRes] = await Promise.all([
    sb.from('studio_trends').select('*').eq('studio_id', studioId).eq('year', year).eq('month', month).maybeSingle(),
    sb.from('studio_trends').select('*').eq('studio_id', studioId).eq('year', py).eq('month', pm).maybeSingle(),
    // Filter by actual date (matches the Events page) so events/promos dated in a
    // prior year never leak in, even if their month/year columns are mis-tagged.
    sb.from('events').select('id, title, start_date, event_type').eq('studio_id', studioId).gte('start_date', monthStart).lte('start_date', monthEnd).order('start_date'),
    sb.from('promotions').select('id, title, promo_type, start_date').eq('studio_id', studioId).gte('start_date', monthStart).lte('start_date', monthEnd).order('start_date'),
    sb.from('maintenance_logs').select('id, status').eq('studio_id', studioId).in('status', ['open', 'in_progress']),
    sb.from('cleaning_tasks').select('*').eq('studio_id', studioId).eq('active', true),
    sb.from('cleaning_completions').select('task_id, completion_date').eq('studio_id', studioId).gte('completion_date', monthStart).lte('completion_date', monthEnd),
    sb.from('shifts').select('id').eq('studio_id', studioId).gte('shift_date', monthStart).lte('shift_date', shiftEnd),
    sb.from('studio_goals').select('memberships_target').eq('studio_id', studioId).eq('year', year).eq('month', month).maybeSingle(),
    // Member Activation feeds for Retention & Experience (done vs total this month).
    sb.from('onboarding_recognition_tasks').select('member_id, type, status').eq('studio_id', studioId).eq('month_key', monthKey),
    sb.from('onboarding_journeys').select('id, member_id').eq('studio_id', studioId).gte('start_date', monthStart).lte('start_date', monthEnd),
    sb.from('onboarding_journey_tasks').select('journey_id, trigger_ref, status').eq('studio_id', studioId).gte('due_date', monthStart).lte('due_date', monthEnd),
    // B2B / Canvassing feeds for Outreach & Lead Gen.
    sb.from('b2b_contacts').select('id, industry, partner_type, has_lead_box').eq('studio_id', studioId),
    sb.from('b2b_interactions').select('contact_id, type, logged_at').eq('studio_id', studioId).gte('logged_at', monthStart).lte('logged_at', `${monthEnd}T23:59:59.999Z`),
    sb.from('territories').select('id, type').eq('studio_id', studioId),
    sb.from('territory_visits').select('territory_id, visit_date').eq('studio_id', studioId).gte('visit_date', monthStart).lte('visit_date', monthEnd),
    // Roster + manual touchpoint check-offs — so retention metrics count only real,
    // active members and credit the work logged in the Member Activation page.
    sb.from('onboarding_members').select('id, is_cancelled, join_date, member_type').eq('studio_id', studioId),
    sb.from('onboarding_touchpoint_log').select('member_id, touchpoint_key, done').eq('studio_id', studioId).eq('done', true),
    // Team & Culture: a contest running this month satisfies the Monthly Challenge.
    sb.from('contests').select('id, title, starts_on, ends_on, period_month, period_year').eq('studio_id', studioId),
  ])

  const t = thisT.data || null
  const prev = prevT.data || null
  const events = evRes.data || []
  const promos = promoRes.data || []
  const openMaint = (maintRes.data || []).length

  const num = (v) => (v == null ? 0 : Number(v))
  const bomEvents = events.filter(e => e.event_type === 'business_of_the_month')
  const influencerEvents = events.filter(e => e.event_type === 'influencer_visit')
  // Events Held excludes "Team" events; Promotions Run excludes "HOTWORX" promos.
  const countedEvents = events.filter(e => e.event_type !== 'team')
  const countedPromos = promos.filter(p => p.promo_type !== 'hotworx')

  // Team & Culture: pull dates from Team events titled "…meeting…" / "…outing…".
  const teamEvents = events.filter(e => e.event_type === 'team')
  const teamMeeting = teamEvents.find(e => /meeting/i.test(e.title || ''))
  const teamOuting = teamEvents.find(e => /outing/i.test(e.title || ''))

  // Monthly Challenge = met when a contest runs during this month. Matches either an
  // auto contest tagged to the month, or any contest whose active window overlaps it.
  const contests = contestsRes.data || []
  const contestThisMonth = contests.find(c =>
    (c.period_month === month && c.period_year === year) ||
    (c.starts_on && c.ends_on && c.starts_on <= monthEnd && c.ends_on >= monthStart)
  )

  // Cleaning compliance, month-to-date: expected task occurrences vs completed.
  const cleaningPct = computeCleaningCompliance(taskRes.data || [], compRes.data || [], year, month, lastDay)

  // ── Retention & Experience (Member Activation) ─────────────────────────
  // Only count work tied to a real, active member. Birthday uploads that never
  // matched a member (member_id NULL) and cancelled members inflated the goals.
  const members = membersRes.data || []
  const activeMemberIds = new Set(members.filter(m => !m.is_cancelled).map(m => m.id))
  const newMemberIds = new Set(members.filter(m =>
    !m.is_cancelled && (!m.member_type || m.member_type === 'member') &&
    m.join_date && m.join_date >= monthStart && m.join_date <= monthEnd
  ).map(m => m.id))

  // Manual touchpoint check-offs from the Member Activation page: member_id → Set(keys done).
  const doneLog = new Map()
  for (const l of (tpLogRes.data || [])) {
    if (!l.done || !l.member_id) continue
    if (!doneLog.has(l.member_id)) doneLog.set(l.member_id, new Set())
    doneLog.get(l.member_id).add(l.touchpoint_key)
  }
  const loggedDone = (mid, key) => doneLog.get(mid)?.has(key) || false

  const recog = recogRes.data || []
  const countDone = (rows) => rows.filter(r => r.status === 'completed').length
  // Recognition tasks, scoped to real active members (drops orphaned/cancelled rows).
  const cards = recog.filter(r => r.type === 'thank_you_card' && r.member_id && activeMemberIds.has(r.member_id))
  const bdays = recog.filter(r => r.type === 'birthday'       && r.member_id && activeMemberIds.has(r.member_id))
  // A card counts done if the recognition task is complete OR it was checked off in the log.
  const cardsDone = cards.filter(r => r.status === 'completed' || loggedDone(r.member_id, 'thank_you_card')).length

  // Week-1 check-ins: of members who JOINED this month, how many got a first-week
  // touch (orientation / Day-2 goal / Day-5 check-in) done — via the journey engine
  // OR a manual check-off in the Member Activation page.
  const FIRST_WEEK = ['day_0_orientation', 'day_2', 'day_5']
  const journeyMember = new Map((newJourneysRes.data || []).map(j => [j.id, j.member_id]))
  const jTasks = milestoneRes.data || []
  const week1Members = new Set()
  for (const t of jTasks) {
    if (t.status === 'completed' && FIRST_WEEK.includes(t.trigger_ref)) {
      const mid = journeyMember.get(t.journey_id)
      if (mid && newMemberIds.has(mid)) week1Members.add(mid)
    }
  }
  for (const mid of newMemberIds) {
    if (FIRST_WEEK.some(k => loggedDone(mid, k))) week1Members.add(mid)
  }
  const week1Done = week1Members.size
  // Milestone check-ins hit this month (visit-day milestones + workout passport).
  const milestoneTasks = jTasks.filter(t => /^milestone/.test(t.trigger_ref || '') || t.trigger_ref === 'passport_sticker')

  // ── Outreach & Lead Gen (B2B + Canvassing) ─────────────────────────────
  const b2bContacts = b2bContactsRes.data || []
  const cById = new Map(b2bContacts.map(c => [c.id, c]))
  const isApt = (c) => (c.industry || '').toLowerCase().includes('apart')
  const isCorp = (c) => c.partner_type === 'corporate' || (c.industry || '').toLowerCase().includes('corporate')
  const leadBoxesActive = b2bContacts.filter(c => c.has_lead_box).length
  // "Contacted this month" = a logged interaction this month, split by apartment vs business.
  const aptContacted = new Set(), bizContacted = new Set()
  let corpPresentations = 0
  for (const i of (b2bInterRes.data || [])) {
    const c = cById.get(i.contact_id); if (!c) continue
    if (isApt(c)) aptContacted.add(i.contact_id); else bizContacted.add(i.contact_id)
    if (i.type === 'meeting' && isCorp(c)) corpPresentations++
  }
  // Neighborhoods flyered = distinct neighborhood territories canvassed this month.
  const nbhdIds = new Set((terrRes.data || []).filter(t => t.type === 'neighborhood').map(t => t.id))
  const nbhdFlyered = new Set((terrVisitRes.data || []).filter(v => nbhdIds.has(v.territory_id)).map(v => v.territory_id)).size

  // Outreach per shift = (calls + texts this month) ÷ shifts scheduled to date.
  const shiftsToDate = (shiftRes.data || []).length
  const outreachPerShift = t
    ? (shiftsToDate > 0 ? round((num(t.calls_made) + num(t.texts_made)) / shiftsToDate) : null)
    : null

  const values = {
    net_eft_increase:       t ? num(t.eft_increase) - num(t.eft_decrease) : null,
    new_members:            t ? num(t.new_members) : null,
    net_members:            t ? num(t.new_members) - num(t.cancellations) : null,
    in_the_bank:            t ? num(t.in_the_bank) : null,
    itb_goal:               t ? num(t.itb_goal) : null,
    close_rate:             t && num(t.red_appts_held) > 0 ? round(num(t.new_members) / num(t.red_appts_held) * 100) : (t ? 0 : null),
    checkin_show_rate:      t && num(t.red_appts_booked) > 0 ? round(num(t.red_appts_held) / num(t.red_appts_booked) * 100) : (t ? 0 : null),
    sweat_elite_mix:        t ? num(t.sweat_elite_pct) : null,
    attrition_rate:         t && prev && num(prev.total_member_count) > 0 ? round(num(t.cancellations) / num(prev.total_member_count) * 100, 1) : null,
    five_star_reviews_delta: t ? num(t.five_star_reviews) - num(prev?.five_star_reviews) : null,
    ig_growth_delta:        t ? num(t.instagram_followers) - num(prev?.instagram_followers) : null,
    events_held:            countedEvents.length,
    promotions_run:         countedPromos.length,
    business_of_the_month:  bomEvents.length,
    influencer_visits:      influencerEvents.length,
    open_maintenance_issues: openMaint,
    cleaning_compliance:    cleaningPct,
    outreach_per_shift:     outreachPerShift,
    team_meeting_date:      teamMeeting?.start_date || null,
    team_outing_date:       teamOuting?.start_date || null,
    // Contest running this month → title becomes the challenge value (met). When none,
    // leave undefined so any manually-typed challenge still shows.
    monthly_challenge_auto: contestThisMonth ? contestThisMonth.title : undefined,
    // New-member goal sourced from the Goals page (studio_goals.memberships_target).
    memberships_goal:       goalRes.data && Number(goalRes.data.memberships_target) > 0 ? Number(goalRes.data.memberships_target) : null,
    // Retention & Experience — done vs total this month, from Member Activation.
    thankyou_cards_done:    cardsDone,
    thankyou_cards_total:   cards.length || null,
    birthdays_done:         countDone(bdays),
    birthdays_total:        bdays.length || null,
    week1_checkins_done:    week1Done,
    week1_checkins_total:   newMemberIds.size || null,
    milestone_checkins_done:  countDone(milestoneTasks),
    milestone_checkins_total: milestoneTasks.length || null,
    // Outreach & Lead Gen — pulled from B2B outreach + canvassing.
    neighborhoods_flyered:  nbhdFlyered,
    apartments_contacted:   aptContacted.size,
    businesses_contacted:   bizContacted.size,
    lead_boxes_active:      leadBoxesActive,
    corporate_presentations: corpPresentations,
  }

  // Business-of-the-Month card: first such event + its linked B2B contact (logo).
  let businessOfMonth = null
  if (bomEvents.length) {
    const ev = bomEvents[0]
    const { data: links } = await sb
      .from('event_b2b_contacts')
      .select('b2b_contacts(id, business_name, logo_url, website)')
      .eq('event_id', ev.id)
      .limit(1)
    const c = links && links[0] && links[0].b2b_contacts
    businessOfMonth = {
      event_title: ev.title,
      business_name: c?.business_name || ev.title,
      logo_url: c?.logo_url || null,
      website: c?.website || null,
      b2b_contact_id: c?.id || null,
    }
  }

  return {
    values,
    extras: {
      eventsThisMonth: countedEvents,
      promosThisMonth: countedPromos,
      bomEventsThisMonth: bomEvents,
      influencerEventsThisMonth: influencerEvents,
      businessOfMonth,
      // New vs cancelled breakdown for the Net Members hero card.
      memberBreakdown: t ? { new: num(t.new_members), cancelled: num(t.cancellations), net: num(t.new_members) - num(t.cancellations) } : null,
      // Increase vs decrease breakdown for the Net EFT Increase hero card.
      eftBreakdown: t ? { increase: num(t.eft_increase), decrease: num(t.eft_decrease), net: num(t.eft_increase) - num(t.eft_decrease) } : null,
      // Marketing funnel (this month) — Leads → Booked → Showed → Closed.
      funnel: t ? {
        leads: num(t.leads),
        booked: num(t.red_appts_booked),
        showed: num(t.red_appts_held),
        closed: num(t.new_members),
      } : null,
    },
  }
}

// Replicates the cleaning module's "task active on date" rule so compliance
// matches what the Cleaning screen shows.
function cleaningTaskActiveOnDate(task, dateStr) {
  const d = new Date(dateStr)
  switch (task.frequency) {
    case 'daily':     return true
    case 'weekly':    return task.day_of_week === d.getDay()
    case 'monthly':   return task.day_of_month === d.getDate()
    case 'quarterly': return Array.isArray(task.quarterly_dates) && task.quarterly_dates.includes(dateStr)
    case 'one_off':   return task.one_off_date === dateStr
    default:          return false
  }
}

// Month-to-date compliance: of every task occurrence that should have happened
// from the 1st through today (or the full month, if past), what % were completed.
function computeCleaningCompliance(tasks, completions, year, month, lastDay) {
  const pad = (n) => String(n).padStart(2, '0')
  const now = new Date()
  const curY = now.getFullYear(), curM = now.getMonth() + 1, curD = now.getDate()
  let endDay
  if (year > curY || (year === curY && month > curM)) endDay = 0           // future month
  else if (year < curY || (year === curY && month < curM)) endDay = lastDay // past month
  else endDay = Math.min(curD, lastDay)                                     // current month
  if (endDay === 0 || !tasks.length) return null

  const done = new Set(completions.map(c => `${c.task_id}|${c.completion_date}`))
  let expected = 0, completed = 0
  for (let day = 1; day <= endDay; day++) {
    const dateStr = `${year}-${pad(month)}-${pad(day)}`
    for (const task of tasks) {
      if (cleaningTaskActiveOnDate(task, dateStr)) {
        expected++
        if (done.has(`${task.id}|${dateStr}`)) completed++
      }
    }
  }
  return expected === 0 ? null : Math.round((completed / expected) * 100)
}

// GET /api/scorecard/:year/:month — resolved metrics + review state for a month.
router.get('/:year/:month', authenticate, requireStudio, requireRole('owner', 'manager'), (req, res) =>
  withSchema(res, async () => {
    const year = Number(req.params.year)
    const month = Number(req.params.month)
    const sb = db()

    const [{ data: monthRow, error: mErr }, { data: goalRows, error: gErr }] = await Promise.all([
      sb.from('scorecard_months').select('*').eq('studio_id', req.studio.id).eq('year', year).eq('month', month).maybeSingle(),
      sb.from('scorecard_goals').select('*').eq('studio_id', req.studio.id),
    ])
    if (mErr) return res.status(500).json({ error: mErr.message })
    if (gErr) return res.status(500).json({ error: gErr.message })

    let reviewedByName = null
    if (monthRow?.reviewed_by) {
      const { data: prof } = await sb.from('user_profiles').select('name').eq('id', monthRow.reviewed_by).maybeSingle()
      reviewedByName = prof?.name || null
    }

    // Resolve manual actuals, then override auto metrics with pulled values.
    const metrics = resolveMetrics(goalRows, monthRow?.actuals || {})
    let extras = { eventsThisMonth: [], promosThisMonth: [], businessOfMonth: null }
    try {
      const auto = await computeAutoValues(sb, req.studio.id, year, month)
      extras = auto.extras
      for (const m of metrics) {
        if (m.auto && auto.values[m.auto] !== undefined) m.actual = auto.values[m.auto]
        if (m.autoGoal && auto.values[m.autoGoal] != null) m.goal = auto.values[m.autoGoal]
      }
    } catch (e) {
      console.error('[scorecard] auto-compute failed:', e.message)
    }

    res.json({
      year,
      month,
      metrics,
      heroKeys: HERO_KEYS,
      groups: GROUPS,
      groupOrder: GROUP_ORDER,
      thresholds: STATUS_THRESHOLDS,
      reviewedBy: monthRow?.reviewed_by || null,
      reviewedByName,
      reviewedAt: monthRow?.reviewed_at || null,
      updatedAt: monthRow?.updated_at || null,
      ...extras,
    })
  }))

// PUT /api/scorecard/:year/:month — save actuals (owner + manager).
// Body: { actuals: { metric_key: value, ... } }  (merged into existing)
router.put('/:year/:month', authenticate, requireStudio, requireRole('owner', 'manager'), (req, res) =>
  withSchema(res, async () => {
    const year = Number(req.params.year)
    const month = Number(req.params.month)
    const incoming = req.body?.actuals
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ error: 'actuals object required' })
    }
    const sb = db()

    const { data: existing, error: exErr } = await sb
      .from('scorecard_months').select('actuals')
      .eq('studio_id', req.studio.id).eq('year', year).eq('month', month).maybeSingle()
    if (exErr) return res.status(500).json({ error: exErr.message })

    const merged = { ...(existing?.actuals || {}), ...incoming }

    const { data, error } = await sb
      .from('scorecard_months')
      .upsert({
        studio_id: req.studio.id, year, month,
        actuals: merged,
        updated_by: req.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'studio_id, year, month' })
      .select().single()
    if (error) return res.status(500).json({ error: error.message })
    res.json(data)
  }))

// PUT /api/scorecard/goals — owner-editable goal overrides (seeds future months).
// Body: { goals: [{ metric_key, goal, lower_is_better }] }
router.put('/goals', authenticate, requireStudio, requireRole('owner'), (req, res) =>
  withSchema(res, async () => {
    const goals = req.body?.goals
    if (!Array.isArray(goals)) return res.status(400).json({ error: 'goals array required' })
    const sb = db()

    const rows = goals
      .filter((g) => g && g.metric_key)
      .map((g) => ({
        studio_id: req.studio.id,
        metric_key: g.metric_key,
        goal: g.goal === '' || g.goal == null ? null : Number(g.goal),
        lower_is_better: g.lower_is_better ?? null,
        updated_by: req.user.id,
        updated_at: new Date().toISOString(),
      }))
    if (!rows.length) return res.json([])

    const { data, error } = await sb
      .from('scorecard_goals')
      .upsert(rows, { onConflict: 'studio_id, metric_key' })
      .select()
    if (error) return res.status(500).json({ error: error.message })
    res.json(data)
  }))

// POST /api/scorecard/:year/:month/review — owner sign-off toggle.
// Body: { reviewed: true|false }
router.post('/:year/:month/review', authenticate, requireStudio, requireRole('owner'), (req, res) =>
  withSchema(res, async () => {
    const year = Number(req.params.year)
    const month = Number(req.params.month)
    const reviewed = req.body?.reviewed !== false
    const sb = db()

    const { data, error } = await sb
      .from('scorecard_months')
      .upsert({
        studio_id: req.studio.id, year, month,
        reviewed_by: reviewed ? req.user.id : null,
        reviewed_at: reviewed ? new Date().toISOString() : null,
        updated_by: req.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'studio_id, year, month' })
      .select().single()
    if (error) return res.status(500).json({ error: error.message })
    res.json(data)
  }))

module.exports = router
