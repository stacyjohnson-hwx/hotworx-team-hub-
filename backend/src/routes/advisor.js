/**
 * /api/advisor
 *
 * Layer 2 — AI Advisor
 * Aggregates studio data + feedback signals → calls Claude → returns recommendations.
 * Only Owner and Manager roles may access this route.
 */

const express    = require('express')
const router     = express.Router()
const { createClient } = require('@supabase/supabase-js')
const Anthropic  = require('@anthropic-ai/sdk')
const authenticate  = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ─── GET /api/advisor ─────────────────────────────────────────────────────────
// Returns the most-recent cached recommendations for the given month/year.
router.get('/', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const month = parseInt(req.query.month) || new Date().getMonth() + 1
  const year  = parseInt(req.query.year)  || new Date().getFullYear()
  try {
    const { data, error } = await db()
      .from('advisor_cache')
      .select('*')
      .eq('month', month)
      .eq('year', year)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    res.json(data || null)
  } catch (err) {
    console.error('GET /advisor', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/advisor/generate ──────────────────────────────────────────────
// Aggregates data, calls Claude, persists result, returns it.
router.post('/generate', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  const month = parseInt(req.body.month) || new Date().getMonth() + 1
  const year  = parseInt(req.body.year)  || new Date().getFullYear()

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'ANTHROPIC_API_KEY is not configured. Add it to your backend .env file to enable AI recommendations.',
    })
  }

  try {
    // ── 1. Gather context ──────────────────────────────────────────────────────
    const context = await gatherContext(month, year)

    // ── 2. Build prompt ────────────────────────────────────────────────────────
    const prompt = buildPrompt(month, year, context)

    // ── 3. Call Claude ─────────────────────────────────────────────────────────
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0]?.text || ''
    let recommendations
    try {
      // Claude should return JSON — extract it robustly
      const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/)
      recommendations = JSON.parse(jsonMatch ? jsonMatch[1] : raw)
    } catch {
      // Fallback: wrap the raw text as a single insight
      recommendations = {
        sections: [{
          id: 'insights',
          title: 'AI Insights',
          icon: 'Sparkles',
          summary: raw,
          items: [],
        }],
      }
    }

    // ── 4. Persist ─────────────────────────────────────────────────────────────
    const { data: saved, error: saveErr } = await db()
      .from('advisor_cache')
      .insert({
        month,
        year,
        generated_by:   req.user.id,
        recommendations,
        context_digest: JSON.stringify(context).slice(0, 500),
      })
      .select()
      .single()

    if (saveErr) throw saveErr
    res.status(201).json(saved)
  } catch (err) {
    console.error('POST /advisor/generate', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── Data aggregation ─────────────────────────────────────────────────────────

async function gatherContext(month, year) {
  const client = db()

  // Previous 3 months for trend context
  const periods = getPreviousPeriods(month, year, 3)

  const [
    signalsRes,
    b2bContactsRes,
    b2bInteractionsRes,
    eventsRes,
    promosRes,
    goalsRes,
    leadsRes,
    eodRes,
  ] = await Promise.all([
    // All feedback signals ever recorded
    client.from('feedback_signals').select('entity_type,entity_id,entity_label,signal,created_at'),

    // All B2B contacts
    client.from('b2b_contacts').select('id,business_name,industry,status,next_action,next_action_date,notes').order('created_at', { ascending: false }),

    // B2B interactions (last 90 days)
    client.from('b2b_interactions').select('contact_id,interaction_type,notes,logged_at').gte('logged_at', ninetyDaysAgo()),

    // Events from last 3 months + current
    client.from('events').select('id,title,event_type,start_date,month,year').in('year', [...new Set(periods.map(p => p.year))]).in('month', [...new Set(periods.map(p => p.month))]),

    // Promotions from last 3 months + current
    client.from('promotions').select('id,title,promo_type,ongoing,active,month,year').in('year', [...new Set(periods.map(p => p.year))]).in('month', [...new Set(periods.map(p => p.month))]),

    // Studio goals for last 3 months
    client.from('studio_goals').select('month,year,eft_target,eft_actual,memberships_target,memberships_actual,retail_target,retail_actual,total_leads_target,in_the_bank_target').in('year', [...new Set(periods.map(p => p.year))]).in('month', [...new Set(periods.map(p => p.month))]),

    // Lead counts for last 90 days
    client.from('leads').select('lead_date,count').gte('lead_date', ninetyDaysAgo()),

    // EOD submissions last 60 days — key sales metrics
    client.from('eod_submissions').select('shift_date,shift_type,sweat_basic,sweat_elite,cancellations_count,retail_amount,phone_calls,sms_sent,red_appt_scheduled,support_notes').gte('shift_date', sixtyDaysAgo()).order('shift_date', { ascending: false }),
  ])

  // Build feedback signal summary by entity type
  const signalSummary = {}
  for (const row of (signalsRes.data || [])) {
    const key = row.entity_type
    if (!signalSummary[key]) signalSummary[key] = []
    const existing = signalSummary[key].find(x => x.id === row.entity_id)
    if (existing) {
      if (row.signal === 1)  existing.up++
      if (row.signal === 0)  existing.neutral++
      if (row.signal === -1) existing.down++
    } else {
      signalSummary[key].push({
        id:      row.entity_id,
        label:   row.entity_label || row.entity_id,
        up:      row.signal === 1  ? 1 : 0,
        neutral: row.signal === 0  ? 1 : 0,
        down:    row.signal === -1 ? 1 : 0,
      })
    }
  }

  // Last interaction per B2B contact
  const lastInteraction = {}
  for (const row of (b2bInteractionsRes.data || [])) {
    if (!lastInteraction[row.contact_id] || row.logged_at > lastInteraction[row.contact_id].logged_at) {
      lastInteraction[row.contact_id] = row
    }
  }

  // EOD summary: aggregate over last 60 days
  const eodRows = eodRes.data || []
  const eodSummary = {
    total_shifts:       eodRows.length,
    total_new_members:  eodRows.reduce((s, r) => s + (r.sweat_basic || 0) + (r.sweat_elite || 0), 0),
    total_cancellations:eodRows.reduce((s, r) => s + (r.cancellations_count || 0), 0),
    total_retail:       eodRows.reduce((s, r) => s + parseFloat(r.retail_amount || 0), 0),
    total_calls:        eodRows.reduce((s, r) => s + (r.phone_calls || 0), 0),
    total_sms:          eodRows.reduce((s, r) => s + (r.sms_sent || 0), 0),
    total_red_appts:    eodRows.reduce((s, r) => s + (r.red_appt_scheduled || 0), 0),
    support_notes:      eodRows.filter(r => r.support_notes).map(r => ({ date: r.shift_date, note: r.support_notes })).slice(0, 5),
  }

  // Lead total for current month
  const currentLeads = (leadsRes.data || [])
    .filter(l => {
      const d = new Date(l.lead_date)
      return d.getMonth() + 1 === month && d.getFullYear() === year
    })
    .reduce((s, l) => s + (l.count || 0), 0)

  return {
    month,
    year,
    signalSummary,
    b2bContacts:   (b2bContactsRes.data   || []).map(c => ({ ...c, lastInteraction: lastInteraction[c.id] || null })),
    events:        eventsRes.data   || [],
    promos:        promosRes.data   || [],
    studioGoals:   goalsRes.data    || [],
    currentLeads,
    leadGoal:      145,
    eodSummary,
  }
}

function buildPrompt(month, year, ctx) {
  const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' })

  // Serialize feedback signals compactly
  const signalText = (type) => {
    const list = ctx.signalSummary[type] || []
    if (!list.length) return '  (none rated yet)'
    return list.map(x => {
      const tags = []
      if (x.up > 0)      tags.push(`${x.up}👍`)
      if (x.neutral > 0) tags.push(`${x.neutral}😐`)
      if (x.down > 0)    tags.push(`${x.down}👎`)
      return `  • "${x.label}": ${tags.join(' ')}`
    }).join('\n')
  }

  // B2B contact status
  const b2bText = ctx.b2bContacts.slice(0, 30).map(c => {
    const daysSince = c.lastInteraction
      ? Math.floor((Date.now() - new Date(c.lastInteraction.logged_at)) / 86400000)
      : null
    const overdue = c.next_action_date && new Date(c.next_action_date) < new Date() ? ' [OVERDUE]' : ''
    return `  • ${c.business_name} (${c.industry || 'unknown industry'}) — status: ${c.status}${overdue}` +
           (daysSince !== null ? `, last contact: ${daysSince}d ago` : ', no interactions logged') +
           (c.next_action ? `, next: ${c.next_action}` : '')
  }).join('\n')

  // Events list
  const eventsText = ctx.events.length
    ? ctx.events.map(e => `  • ${e.title} (${e.event_type}, ${e.month}/${e.year})`).join('\n')
    : '  (none in this period)'

  // Promos list
  const promosText = ctx.promos.length
    ? ctx.promos.map(p => `  • ${p.title} (${p.promo_type}${p.ongoing ? ', ongoing' : ''}, ${p.month}/${p.year})`).join('\n')
    : '  (none in this period)'

  // Goals
  const currentGoal = ctx.studioGoals.find(g => g.month === month && g.year === year)
  const goalsText = currentGoal
    ? `EFT target: $${currentGoal.eft_target || '?'} (actual: $${currentGoal.eft_actual || 0}), ` +
      `Memberships: ${currentGoal.memberships_target || '?'} (actual: ${currentGoal.memberships_actual || 0}), ` +
      `Retail: $${currentGoal.retail_target || '?'} (actual: $${currentGoal.retail_actual || 0}), ` +
      `ITB target: $${currentGoal.in_the_bank_target || '?'}`
    : 'No goals set for current month yet'

  // EOD summary
  const { total_shifts, total_new_members, total_cancellations, total_retail, total_calls, total_sms, total_red_appts, support_notes } = ctx.eodSummary
  const supportText = support_notes.length
    ? support_notes.map(n => `  • ${n.date}: "${n.note}"`).join('\n')
    : '  (none)'

  return `You are an AI advisor for HOTWORX Pewaukee, a boutique infrared sauna fitness studio. The owner uses you to get monthly recommendations to improve studio performance.

Today is ${monthName} ${year}. Analyze the following studio data and provide specific, actionable recommendations.

=== FEEDBACK SIGNALS (Team ratings of activities) ===

Events rated:
${signalText('event')}

Promotions rated:
${signalText('promo')}

B2B Partners rated:
${signalText('b2b')}

Growth Plays rated:
${signalText('play')}

Missions rated:
${signalText('mission')}

=== B2B PIPELINE (${ctx.b2bContacts.length} contacts) ===
${b2bText}

=== EVENTS (last 3 months) ===
${eventsText}

=== PROMOTIONS (last 3 months) ===
${promosText}

=== CURRENT MONTH GOALS ===
${goalsText}

=== LEAD GENERATION ===
Current month total: ${ctx.currentLeads} leads (goal: ${ctx.leadGoal}/month)

=== EOD PERFORMANCE (last 60 days, ${total_shifts} shifts) ===
New members: ${total_new_members} | Cancellations: ${total_cancellations} | Retail: $${total_retail.toFixed(0)}
Phone calls: ${total_calls} | SMS sent: ${total_sms} | Red appointments scheduled: ${total_red_appts}

Team support requests:
${supportText}

=== YOUR TASK ===
Based on this data, provide recommendations in EXACTLY this JSON format (no markdown explanation, just JSON):

{
  "sections": [
    {
      "id": "b2b_partners",
      "title": "B2B Partners to Prioritize",
      "icon": "Building2",
      "summary": "1-2 sentence overview of the B2B landscape and main theme",
      "items": [
        {
          "label": "Business Name",
          "reason": "Specific, concrete reason why to prioritize or revisit this partner based on the data (mention signals, interaction recency, overdue actions)",
          "priority": "high|medium|low",
          "action": "Specific action to take this month"
        }
      ]
    },
    {
      "id": "events_promos",
      "title": "Events & Promos to Consider",
      "icon": "Megaphone",
      "summary": "1-2 sentence overview of event/promo momentum",
      "items": [
        {
          "label": "Event or Promo Name",
          "reason": "Why to run or skip this (reference thumbs signals if any, patterns from past months)",
          "priority": "high|medium|low",
          "action": "Specific recommendation (rehost, retire, modify, launch)"
        }
      ]
    },
    {
      "id": "goals",
      "title": "Goal Suggestions for This Month",
      "icon": "Target",
      "summary": "1-2 sentence overview of goal-setting priorities",
      "items": [
        {
          "label": "Goal Area (e.g. Lead Generation, Retail, Memberships)",
          "reason": "Why this target makes sense given recent performance and trends",
          "priority": "high|medium|low",
          "action": "Specific suggested target or tactic"
        }
      ]
    },
    {
      "id": "insights",
      "title": "Patterns & Insights",
      "icon": "Sparkles",
      "summary": "1-2 sentence synthesis of what's working and what needs attention",
      "items": [
        {
          "label": "Insight title",
          "reason": "Observation from the data",
          "priority": "medium",
          "action": "Suggested response or next step"
        }
      ]
    }
  ]
}

Be specific and grounded in the actual data above. Mention business names, event titles, and numbers where relevant. If there is very little data, acknowledge it and give general guidance for a studio in its early months.`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPreviousPeriods(month, year, count) {
  const periods = []
  for (let i = 0; i < count; i++) {
    let m = month - i
    let y = year
    if (m <= 0) { m += 12; y-- }
    periods.push({ month: m, year: y })
  }
  return periods
}

function ninetyDaysAgo() {
  const d = new Date()
  d.setDate(d.getDate() - 90)
  return d.toISOString().split('T')[0]
}

function sixtyDaysAgo() {
  const d = new Date()
  d.setDate(d.getDate() - 60)
  return d.toISOString().split('T')[0]
}

module.exports = router
