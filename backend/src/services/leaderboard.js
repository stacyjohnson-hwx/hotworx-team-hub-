// Shared team-performance leaderboard aggregation.
// Used by GET /api/goals/leaderboard and by auto-scored contests.
// Returns one row per active TSA/manager (with scheduled hours) for a month/year,
// carrying the raw metric values a contest can rank on plus commission figures.
const { createClient } = require('@supabase/supabase-js')
const { calcCommission } = require('./commissionCalc')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function getInactiveUserIds() {
  const { data } = await db().from('user_profiles').select('id').eq('is_active', false)
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
  for (const s of (data || [])) countMap[s.tsa_id] = (countMap[s.tsa_id] || 0) + 1
  return countMap
}

async function getStudioGoalTargets(month, year, studioId) {
  const { data: g } = await db().from('studio_goals')
    .select('eft_target, memberships_target, retail_target, total_leads_target')
    .eq('studio_id', studioId).eq('month', month).eq('year', year).maybeSingle()
  return { ...(g || {}), total_leads_target: (g && g.total_leads_target) || 145 }
}

async function getStudioTrends(month, year, studioId) {
  const [{ data: trends }, { data: goals }] = await Promise.all([
    db().from('studio_trends').select('retail,membership_cash,in_the_bank,itb_goal,net_eft').eq('studio_id', studioId).eq('month', month).eq('year', year).maybeSingle(),
    db().from('studio_goals').select('retail_actual,in_the_bank_target').eq('studio_id', studioId).eq('month', month).eq('year', year).maybeSingle(),
  ])
  const t = trends || {}
  const g = goals || {}
  return {
    retail:          t.retail          ?? 0,
    membership_cash: t.membership_cash ?? 0,
    in_the_bank:     t.in_the_bank     ?? 0,
    itb_goal:        g.in_the_bank_target ?? t.itb_goal ?? 0,
    net_eft:         t.net_eft         ?? 0,
  }
}

// Per-TSA leaderboard for a studio + month/year. Only active tsa/manager users
// with scheduled hours are included.
async function computeLeaderboard(studioId, month, year) {
  const [{ data: { users }, error: uErr }, inactiveIds] = await Promise.all([
    db().auth.admin.listUsers(),
    getInactiveUserIds(),
  ])
  if (uErr) throw new Error(uErr.message)

  const studioUsers = users.filter(u =>
    ['tsa', 'manager'].includes(u.app_metadata?.role) && !inactiveIds.has(u.id)
  )

  const [{ data: goalsData, error: gErr }, hoursMap, shiftCountMap, studioTargets, studioData] = await Promise.all([
    db().from('personal_goals')
      .select('tsa_id, total_memberships, retail_actual, sweat_basic, sweat_elite, pos_collected, eft_actual, pif_6mo, pif_12mo, itb_bonus_override, calls_made, texts_made')
      .eq('studio_id', studioId).eq('month', month).eq('year', year),
    getMonthlyHours(Number(month), Number(year), studioId),
    getMonthlyShiftCounts(Number(month), Number(year), studioId),
    getStudioGoalTargets(month, year, studioId),
    getStudioTrends(Number(month), Number(year), studioId),
  ])
  if (gErr) throw new Error(gErr.message)

  const goalsMap = {}
  for (const g of (goalsData || [])) goalsMap[g.tsa_id] = g

  const totalHours = studioUsers.reduce((sum, u) => sum + (hoursMap[u.id] || 0), 0)

  return studioUsers
    .filter(u => (hoursMap[u.id] || 0) > 0)
    .map(u => {
      const userRole = u.app_metadata?.role
      const goals = goalsMap[u.id] || {}
      const scheduledHours = hoursMap[u.id] || 0
      const hoursPct = totalHours > 0 ? scheduledHours / totalHours : 0
      const membersGoal = studioTargets.memberships_target ? Math.round(studioTargets.memberships_target * hoursPct) : null
      const retailGoal  = studioTargets.retail_target ? Math.round(studioTargets.retail_target * hoursPct * 100) / 100 : null
      const commission  = calcCommission(goals, userRole, studioData)
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
        eft_actual:                goals.eft_actual         || 0,
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
}

module.exports = { computeLeaderboard }
