const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')
const { calcCommission } = require('../services/commissionCalc')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Apply studio middleware to all routes
router.use(authenticate, requireStudio)

const STUDIO_GOAL_DEFAULTS = {
  eft_target: 500, eft_actual: 0,
  memberships_target: 0, memberships_actual: 0,
  retail_target: 0, retail_actual: 0,
  conversion_rate_target: 35, conversion_rate_actual: 0,
  checkin_show_rate_target: 80, checkin_show_rate_actual: 0,
  close_rate_target: 50, close_rate_actual: 0,
  in_the_bank_target: null,
  total_leads_target: 145,
  notes: '',
}

const PERSONAL_GOAL_DEFAULTS = {
  eft_actual: 0, pos_collected: 0,
  pif_6mo: 0, pif_12mo: 0,
  retail_actual: 0,
  sweat_basic: 0, sweat_elite: 0, total_memberships: 0,
  calls_made: 0, texts_made: 0,
  itb_bonus_override: null, itb_bonus_note: '',
  net_eft_bonus_override: null,
}

async function getUserName(uid) {
  const { data } = await db().auth.admin.getUserById(uid)
  const u = data?.user
  return {
    name: u?.user_metadata?.full_name || u?.email?.split('@')[0] || 'Team Member',
    email: u?.email,
    role: u?.app_metadata?.role,
    avatar_url: u?.user_metadata?.avatar_url || null,
  }
}

// Returns a Set of user IDs that are deactivated, so the goals routes
// can filter them out without an extra query per user.
async function getInactiveUserIds() {
  const { data } = await db()
    .from('user_profiles')
    .select('id')
    .eq('is_active', false)
  return new Set((data || []).map(p => p.id))
}

async function getMonthlyHours(month, year, studioId) {
  const m = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  const { data } = await db()
    .from('shifts')
    .select('tsa_id, start_time, end_time')
    .eq('studio_id', studioId)
    .gte('shift_date', `${year}-${m}-01`)
    .lte('shift_date', `${year}-${m}-${String(lastDay).padStart(2, '0')}`)
  const hoursMap = {}
  for (const s of (data || [])) {
    const [sh, sm] = (s.start_time || '0:0').split(':').map(Number)
    const [eh, em] = (s.end_time   || '0:0').split(':').map(Number)
    const hrs = Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60)
    hoursMap[s.tsa_id] = (hoursMap[s.tsa_id] || 0) + hrs
  }
  return hoursMap
}

async function getMonthlyShiftCounts(month, year, studioId) {
  const m = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  const { data } = await db()
    .from('shifts')
    .select('tsa_id')
    .eq('studio_id', studioId)
    .gte('shift_date', `${year}-${m}-01`)
    .lte('shift_date', `${year}-${m}-${String(lastDay).padStart(2, '0')}`)
  const countMap = {}
  for (const s of (data || [])) {
    countMap[s.tsa_id] = (countMap[s.tsa_id] || 0) + 1
  }
  return countMap
}

async function getStudioGoalTargets(month, year, studioId) {
  const [{ data: g }, { data: t }] = await Promise.all([
    db().from('studio_goals')
      .select('eft_target, memberships_target, retail_target, total_leads_target')
      .eq('studio_id', studioId).eq('month', month).eq('year', year).maybeSingle(),
    db().from('studio_trends')
      .select('leads')
      .eq('studio_id', studioId).eq('month', month).eq('year', year).maybeSingle(),
  ])
  return {
    ...(g || {}),
    total_leads_target: (g && g.total_leads_target) || 145, // studio monthly lead goal
    total_leads_actual: t?.leads ?? 0,
  }
}

async function getStudioTrends(month, year, studioId) {
  const [{ data: trends }, { data: goals }] = await Promise.all([
    db().from('studio_trends').select('retail,membership_cash,in_the_bank,itb_goal,net_eft').eq('studio_id', studioId).eq('month', month).eq('year', year).maybeSingle(),
    db().from('studio_goals').select('retail_actual,in_the_bank_target').eq('studio_id', studioId).eq('month', month).eq('year', year).maybeSingle(),
  ])
  const t = trends || {}
  const g = goals || {}
  return {
    retail:         t.retail         ?? 0,
    membership_cash:t.membership_cash?? 0,
    in_the_bank:    t.in_the_bank    ?? 0,
    itb_goal:       g.in_the_bank_target ?? t.itb_goal ?? 0,
    net_eft:        t.net_eft        ?? 0,
  }
}

// ── Studio Goals ─────────────────────────────────────────────────────────────

router.get('/studio', async (req, res) => {
  const { month, year } = req.query
  if (!month || !year) return res.status(400).json({ error: 'month and year required' })

  const [{ data: goals, error }, { data: trends }] = await Promise.all([
    db().from('studio_goals').select('*').eq('studio_id', req.studio.id).eq('month', month).eq('year', year).maybeSingle(),
    db().from('studio_trends').select(
      'leads,cancellations,total_member_count,new_members,' +
      'membership_cash,net_eft,eft_decrease,in_the_bank,itb_goal,' +
      'eft_increase,retail'
    ).eq('studio_id', req.studio.id).eq('month', month).eq('year', year).maybeSingle(),
  ])

  if (error) return res.status(500).json({ error: error.message })

  const base = goals || { ...STUDIO_GOAL_DEFAULTS, month: Number(month), year: Number(year), studio_id: req.studio.id }
  const t = trends || {}

  res.json({
    ...base,
    // Actuals pulled from studio_trends (read-only on this endpoint)
    eft_actual:           t.eft_increase       ?? base.eft_actual,
    memberships_actual:   t.new_members        ?? base.memberships_actual,
    retail_actual:        t.retail             ?? base.retail_actual,
    total_leads_actual:   t.leads              ?? null,
    cancellations_actual: t.cancellations      ?? null,
    total_members_actual: t.total_member_count ?? null,
    new_members_actual:   t.new_members        ?? null,
    membership_cash:      t.membership_cash    ?? null,
    net_eft:              t.net_eft            ?? null,
    eft_decrease_actual:  t.eft_decrease       ?? null,
    in_the_bank_actual:   t.in_the_bank        ?? null,
    itb_goal:             t.itb_goal           ?? null,
  })
})

router.put('/studio', requireRole('owner', 'manager'), async (req, res) => {
  const { month, year, ...fields } = req.body
  if (!month || !year) return res.status(400).json({ error: 'month and year required' })

  // Strip read-only fields that come from studio_trends (not stored in studio_goals)
  const READ_ONLY_FIELDS = [
    'eft_actual', 'memberships_actual', 'retail_actual',
    'total_leads_actual', 'cancellations_actual', 'total_members_actual',
    'new_members_actual', 'membership_cash', 'net_eft', 'eft_decrease_actual',
    'in_the_bank_actual', 'itb_goal',
  ]
  const safeFields = Object.fromEntries(
    Object.entries(fields).filter(([k]) => !READ_ONLY_FIELDS.includes(k))
  )

  const { data, error } = await db()
    .from('studio_goals')
    .upsert({
      month,
      year,
      studio_id: req.studio.id,
      ...safeFields,
      updated_by: req.user.id,
      updated_at: new Date().toISOString()
    }, { onConflict: 'studio_id,month,year' })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ── Personal Goals ────────────────────────────────────────────────────────────

router.get('/personal', authenticate, async (req, res) => {
  const { month, year } = req.query
  if (!month || !year) return res.status(400).json({ error: 'month and year required' })

  if (req.role === 'tsa') {
    const m = String(month).padStart(2, '0')
    const lastDay = new Date(Number(year), Number(month), 0).getDate()
    const startDate = `${year}-${m}-01`
    const endDate   = `${year}-${m}-${String(lastDay).padStart(2, '0')}`

    const [{ data, error }, hoursMap, studioTargets, { data: myShifts }] = await Promise.all([
      db().from('personal_goals').select('*').eq('studio_id', req.studio.id).eq('tsa_id', req.user.id).eq('month', month).eq('year', year).maybeSingle(),
      getMonthlyHours(Number(month), Number(year), req.studio.id),
      getStudioGoalTargets(month, year, req.studio.id),
      db().from('shifts').select('id, shift_date, start_time, end_time, notes')
        .eq('studio_id', req.studio.id).eq('tsa_id', req.user.id).gte('shift_date', startDate).lte('shift_date', endDate)
        .order('shift_date').order('start_time'),
    ])

    if (error) return res.status(500).json({ error: error.message })
    const goals = data || { ...PERSONAL_GOAL_DEFAULTS, tsa_id: req.user.id, studio_id: req.studio.id, month: Number(month), year: Number(year) }
    const { name, avatar_url } = await getUserName(req.user.id)
    const commission = calcCommission(goals, 'tsa')

    const myHours    = hoursMap[req.user.id] || 0
    const totalHours = Object.values(hoursMap).reduce((s, h) => s + h, 0)
    const hoursPct   = totalHours > 0 ? myHours / totalHours : 0
    const shifts     = myShifts || []
    const shiftCount = shifts.length

    const eftGoal     = studioTargets.eft_target        ? Math.round(studioTargets.eft_target        * hoursPct * 100) / 100 : null
    const membersGoal = studioTargets.memberships_target ? Math.round(studioTargets.memberships_target * hoursPct)           : null
    const retailGoal  = studioTargets.retail_target     ? Math.round(studioTargets.retail_target     * hoursPct * 100) / 100 : null

    const todayStr    = new Date().toLocaleDateString('en-CA')

    return res.json([{
      ...goals,
      tsa_name: name, avatar_url, commission,
      scheduled_hours:          Math.round(myHours * 10) / 10,
      scheduled_shifts:         shiftCount,
      total_team_hours:         Math.round(totalHours * 10) / 10,
      hours_pct:                hoursPct,
      eft_goal_computed:        eftGoal,
      memberships_goal_computed:membersGoal,
      retail_goal_computed:     retailGoal,
      eft_per_shift:            (shiftCount > 0 && eftGoal)     ? Math.round(eftGoal     / shiftCount * 100) / 100 : null,
      memberships_per_shift:    (shiftCount > 0 && membersGoal) ? Math.round(membersGoal / shiftCount * 10)  / 10  : null,
      retail_per_shift:         (shiftCount > 0 && retailGoal)  ? Math.round(retailGoal  / shiftCount * 100) / 100 : null,
      studio_targets:           studioTargets,
      all_shifts:               shifts,
      todays_shifts:            shifts.filter(s => s.shift_date === todayStr),
    }])
  }

  // Owner/manager: members of THIS studio merged with goals
  const [{ data: { users }, error: uErr }, inactiveIds, { data: memberRows }] = await Promise.all([
    db().auth.admin.listUsers(),
    getInactiveUserIds(),
    db().from('user_studios').select('user_id, role').eq('studio_id', req.studio.id),
  ])
  if (uErr) return res.status(500).json({ error: uErr.message })

  // Per-studio role lookup — scopes the list to actual studio members (no global/placeholder accounts)
  const roleByUser = {}
  for (const m of memberRows || []) roleByUser[m.user_id] = m.role

  const studioUsers = users.filter(u => roleByUser[u.id] && !inactiveIds.has(u.id))

  const { data: goalsData, error: gErr } = await db()
    .from('personal_goals').select('*').eq('studio_id', req.studio.id).eq('month', month).eq('year', year)
  if (gErr) return res.status(500).json({ error: gErr.message })

  // Fetch studio trends, hours, and goal targets in parallel
  const [studioData, hoursMap, studioTargets] = await Promise.all([
    getStudioTrends(month, year, req.studio.id),
    getMonthlyHours(Number(month), Number(year), req.studio.id),
    getStudioGoalTargets(month, year, req.studio.id),
  ])

  const goalsMap = {}
  for (const g of goalsData) goalsMap[g.tsa_id] = g

  // Total hours across TSA + manager only (owner excluded from goal distribution)
  const nonOwners = studioUsers.filter(u => roleByUser[u.id] !== 'owner')
  const totalHours = nonOwners.reduce((sum, u) => sum + (hoursMap[u.id] || 0), 0)

  const result = studioUsers.map(u => {
    const userRole = roleByUser[u.id]
    const goals = goalsMap[u.id] || { ...PERSONAL_GOAL_DEFAULTS, tsa_id: u.id, studio_id: req.studio.id, month: Number(month), year: Number(year) }
    const commission = calcCommission(goals, userRole, studioData)

    const scheduledHours = userRole !== 'owner' ? (hoursMap[u.id] || 0) : 0
    const hoursPct = totalHours > 0 ? scheduledHours / totalHours : 0

    return {
      ...goals,
      tsa_name:   u.user_metadata?.full_name || u.email?.split('@')[0] || 'Team Member',
      tsa_email:  u.email,
      tsa_role:   userRole,
      avatar_url: u.user_metadata?.avatar_url || null,
      commission,
      studio_data: userRole === 'manager' ? studioData : undefined,
      // Hours-based goal allocation
      scheduled_hours:          Math.round(scheduledHours * 10) / 10,
      hours_pct:                hoursPct,
      total_team_hours:         Math.round(totalHours * 10) / 10,
      eft_goal_computed:        studioTargets.eft_target        ? Math.round(studioTargets.eft_target        * hoursPct * 100) / 100 : null,
      memberships_goal_computed:studioTargets.memberships_target ? Math.round(studioTargets.memberships_target * hoursPct)           : null,
      retail_goal_computed:     studioTargets.retail_target     ? Math.round(studioTargets.retail_target     * hoursPct * 100) / 100 : null,
    }
  })

  res.json(result.sort((a, b) => a.tsa_name.localeCompare(b.tsa_name)))
})

router.put('/personal/:tsaId', requireRole('owner', 'manager'), async (req, res) => {
  const { month, year, ...fields } = req.body
  if (!month || !year) return res.status(400).json({ error: 'month and year required' })

  const { data, error } = await db()
    .from('personal_goals')
    .upsert({
      tsa_id: req.params.tsaId,
      studio_id: req.studio.id,
      month,
      year,
      ...fields,
      updated_by: req.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'studio_id,tsa_id,month,year' })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  const { name, avatar_url, role: userRole } = await getUserName(req.params.tsaId)
  const studioData = userRole === 'manager' ? await getStudioTrends(month, year, req.studio.id) : {}
  const commission = calcCommission(data, userRole, studioData)
  res.json({ ...data, tsa_name: name, avatar_url, tsa_role: userRole, commission, studio_data: userRole === 'manager' ? studioData : undefined })
})

// ── Team Performance Leaderboard (all roles) ──────────────────────────────────

router.get('/leaderboard', async (req, res) => {
  const { month, year } = req.query
  if (!month || !year) return res.status(400).json({ error: 'month and year required' })

  const [{ data: { users }, error: uErr }, inactiveIds] = await Promise.all([
    db().auth.admin.listUsers(),
    getInactiveUserIds(),
  ])
  if (uErr) return res.status(500).json({ error: uErr.message })

  const studioUsers = users.filter(u =>
    ['tsa', 'manager'].includes(u.app_metadata?.role) &&
    !inactiveIds.has(u.id)
  )

  const [{ data: goalsData, error: gErr }, hoursMap, shiftCountMap, studioTargets] = await Promise.all([
    db().from('personal_goals')
      .select('tsa_id, total_memberships, retail_actual, sweat_basic, sweat_elite, pos_collected, eft_actual, pif_6mo, pif_12mo, itb_bonus_override, calls_made, texts_made')
      .eq('studio_id', req.studio.id).eq('month', month).eq('year', year),
    getMonthlyHours(Number(month), Number(year), req.studio.id),
    getMonthlyShiftCounts(Number(month), Number(year), req.studio.id),
    getStudioGoalTargets(month, year, req.studio.id),
  ])

  if (gErr) return res.status(500).json({ error: gErr.message })

  const goalsMap = {}
  for (const g of (goalsData || [])) goalsMap[g.tsa_id] = g

  const totalHours = studioUsers.reduce((sum, u) => sum + (hoursMap[u.id] || 0), 0)

  const result = studioUsers
    .filter(u => (hoursMap[u.id] || 0) > 0)
    .map(u => {
      const userRole = u.app_metadata?.role
      const goals = goalsMap[u.id] || {}
      const scheduledHours = hoursMap[u.id] || 0
      const hoursPct = totalHours > 0 ? scheduledHours / totalHours : 0
      const membersGoal = studioTargets.memberships_target ? Math.round(studioTargets.memberships_target * hoursPct) : null
      const retailGoal  = studioTargets.retail_target ? Math.round(studioTargets.retail_target * hoursPct * 100) / 100 : null
      const commission  = calcCommission(goals, userRole)
      return {
        tsa_id:       u.id,
        tsa_name:     u.user_metadata?.full_name || u.email?.split('@')[0] || 'Team Member',
        tsa_role:     userRole,
        avatar_url:   u.user_metadata?.avatar_url || null,
        total_memberships:         goals.total_memberships || 0,
        sweat_basic:               goals.sweat_basic        || 0,
        sweat_elite:               goals.sweat_elite        || 0,
        retail_actual:             goals.retail_actual      || 0,
        pos_collected:             goals.pos_collected      || 0,
        calls_made:                goals.calls_made         || 0,
        texts_made:                goals.texts_made         || 0,
        outreach:                  (goals.calls_made || 0) + (goals.texts_made || 0),
        shift_count:               shiftCountMap[u.id]      || 0,
        outreach_goal:             (shiftCountMap[u.id] || 0) * 50,
        scheduled_hours:           Math.round(scheduledHours * 10) / 10,
        hours_pct:                 hoursPct,
        memberships_goal_computed: membersGoal,
        retail_goal_computed:      retailGoal,
        commission_total:          commission.total,
        commission_retail_rate:    commission.retail_rate   || 0,
        commission_retail:         commission.retail_commission || 0,
        commission_eft:            commission.eft_commission    || 0,
        commission_itb:            commission.itb_bonus         || 0,
      }
    })

  res.json(result)
})

// ─── POST /api/goals/suggest ──────────────────────────────────────────────────
// Analyzes last 3 months of actuals and returns AI-suggested targets.
// Owner + Manager only.
router.post('/suggest', requireRole('owner', 'manager'), async (req, res) => {
  const { month, year } = req.body
  const m = parseInt(month) || new Date().getMonth() + 1
  const y = parseInt(year)  || new Date().getFullYear()

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not configured.' })
  }

  try {
    const Anthropic = require('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // Gather last 3 months of studio_goals + studio_trends
    const periods = []
    for (let i = 1; i <= 3; i++) {
      let pm = m - i, py = y
      if (pm <= 0) { pm += 12; py-- }
      periods.push({ month: pm, year: py })
    }

    const monthInts = [...new Set(periods.map(p => p.month))]
    const yearInts  = [...new Set(periods.map(p => p.year))]

    const [goalsRes, trendsRes, leadsRes] = await Promise.all([
      db().from('studio_goals')
        .select('month,year,eft_target,eft_actual,memberships_target,memberships_actual,retail_target,retail_actual,in_the_bank_target,total_leads_target,conversion_rate_target,conversion_rate_actual,checkin_show_rate_target,checkin_show_rate_actual,close_rate_target,close_rate_actual')
        .eq('studio_id', req.studio.id).in('month', monthInts).in('year', yearInts),
      db().from('studio_trends')
        .select('month,year,eft_increase,new_members,retail,in_the_bank,leads,cancellations,total_member_count')
        .eq('studio_id', req.studio.id).in('month', monthInts).in('year', yearInts),
      db().from('leads')
        .select('lead_date,count')
        .eq('studio_id', req.studio.id)
        .gte('lead_date', `${periods[periods.length - 1].year}-${String(periods[periods.length - 1].month).padStart(2, '0')}-01`),
    ])

    const goalsMap  = {}
    for (const g of (goalsRes.data || []))  goalsMap[`${g.year}-${g.month}`]  = g
    const trendsMap = {}
    for (const t of (trendsRes.data || [])) trendsMap[`${t.year}-${t.month}`] = t

    const monthName = (mo, yr) => new Date(yr, mo - 1, 1).toLocaleString('default', { month: 'long' })

    const historyLines = periods.map(p => {
      const g = goalsMap[`${p.year}-${p.month}`]  || {}
      const t = trendsMap[`${p.year}-${p.month}`] || {}
      return `${monthName(p.month, p.year)} ${p.year}:
  EFT increase: actual $${t.eft_increase ?? g.eft_actual ?? 'n/a'} (target was $${g.eft_target ?? 'not set'})
  New memberships: actual ${t.new_members ?? g.memberships_actual ?? 'n/a'} (target was ${g.memberships_target ?? 'not set'})
  Retail: actual $${t.retail ?? g.retail_actual ?? 'n/a'} (target was $${g.retail_target ?? 'not set'})
  In the Bank: $${t.in_the_bank ?? 'n/a'} (goal was $${g.in_the_bank_target ?? 'not set'})
  Leads: ${t.leads ?? 'n/a'} (goal was ${g.total_leads_target ?? 145})
  Cancellations: ${t.cancellations ?? 'n/a'}
  Total members: ${t.total_member_count ?? 'n/a'}
  Conversion rate: ${g.conversion_rate_actual ?? 'n/a'}% (target ${g.conversion_rate_target ?? 35}%)
  Check-in show rate: ${g.checkin_show_rate_actual ?? 'n/a'}% (target ${g.checkin_show_rate_target ?? 80}%)
  Close rate: ${g.close_rate_actual ?? 'n/a'}% (target ${g.close_rate_target ?? 50}%)`
    }).join('\n\n')

    const targetMonth = monthName(m, y)

    const prompt = `You are an AI advisor for HOTWORX Pewaukee, a boutique infrared sauna fitness studio. The owner needs suggested monthly goal targets for ${targetMonth} ${y}.

Here is the studio's performance over the last 3 months:

${historyLines}

Studio context:
- EFT (Electronic Funds Transfer) increase is the primary revenue driver — monthly quota for commission is $500 for TSAs, $750 for the manager
- Lead generation goal is typically 145/month (5/day)
- Conversion rate = percentage of leads who book a trial appointment
- Check-in show rate = percentage of trial appointments who actually show up
- Studio close rate = percentage of shows who purchase a membership
- "In the Bank" is the total EFT base (cumulative memberships × dues)

Based on the last 3 months of performance, suggest realistic but motivating targets for ${targetMonth} ${y}. If the studio consistently hit or missed targets, adjust accordingly. If there is no historical data, use the typical studio defaults.

Respond with ONLY valid JSON in this exact format:
{
  "eft_target": <number>,
  "memberships_target": <number>,
  "retail_target": <number>,
  "in_the_bank_target": <number or null>,
  "total_leads_target": <number>,
  "conversion_rate_target": <number>,
  "checkin_show_rate_target": <number>,
  "close_rate_target": <number>,
  "summary": "<1-2 sentences explaining the overall approach>",
  "reasoning": {
    "eft_target": "<one short sentence>",
    "memberships_target": "<one short sentence>",
    "retail_target": "<one short sentence>",
    "in_the_bank_target": "<one short sentence>",
    "total_leads_target": "<one short sentence>",
    "conversion_rate_target": "<one short sentence>",
    "checkin_show_rate_target": "<one short sentence>",
    "close_rate_target": "<one short sentence>"
  }
}`

    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0]?.text || ''

    // Robust JSON extraction
    let suggestion
    try { suggestion = JSON.parse(raw) } catch {}
    if (!suggestion) {
      const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (fenceMatch) try { suggestion = JSON.parse(fenceMatch[1].trim()) } catch {}
    }
    if (!suggestion) {
      const braces = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
      try { suggestion = JSON.parse(braces) } catch {}
    }
    if (!suggestion) return res.status(500).json({ error: 'AI returned an unparseable response. Try again.' })

    res.json(suggestion)
  } catch (err) {
    console.error('POST /goals/suggest', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
