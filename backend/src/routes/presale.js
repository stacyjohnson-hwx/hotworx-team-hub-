// Pre-Sale planner (PRD Phase 1 — Track). A campaign layer with a lead ledger:
// actuals are always SUM(lead_count), never typed over. Studio-scoped; the tab is
// only shown when studios.presale_enabled is true (Franchise Admin toggle).
const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireStudio } = require('../middleware/studioMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { todayInChicago } = require('../utils/dates')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
router.use(authenticate, requireStudio)

async function activeCampaign(sb, studioId) {
  const { data } = await sb.from('presale_campaigns').select('*')
    .eq('studio_id', studioId).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data || null
}

// ─── GET /api/presale/dashboard ──────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const sb = db(); const sid = req.studio.id
    const campaign = await activeCampaign(sb, sid)
    if (!campaign) return res.json({ campaign: null })

    const [{ data: channels }, { data: log }] = await Promise.all([
      sb.from('presale_channels').select('*').eq('campaign_id', campaign.id).order('sort_order'),
      sb.from('presale_lead_log').select('channel_id, lead_count, logged_on').eq('campaign_id', campaign.id),
    ])
    const actualByCh = {}, dailyMap = {}
    for (const l of log || []) {
      actualByCh[l.channel_id] = (actualByCh[l.channel_id] || 0) + (l.lead_count || 0)
      dailyMap[l.logged_on] = (dailyMap[l.logged_on] || 0) + (l.lead_count || 0)
    }
    const chRows = (channels || []).map(c => ({
      id: c.id, key: c.key, label: c.label, channel_group: c.channel_group || 'Other',
      plan_units: Number(c.plan_units) || 0, plan_per_unit: Number(c.plan_per_unit) || 0,
      planned: (Number(c.plan_units) || 0) * (Number(c.plan_per_unit) || 0),
      actual: actualByCh[c.id] || 0,
    }))
    const actual = chRows.reduce((s, c) => s + c.actual, 0)
    const planned = chRows.reduce((s, c) => s + c.planned, 0)

    // Pace: leads/day needed to hit the goal by launch day.
    const today = todayInChicago()
    let daysRemaining = null, perDayRequired = null
    if (campaign.launch_day) {
      daysRemaining = Math.max(0, Math.round((new Date(campaign.launch_day) - new Date(today)) / 86400000))
      const gap = Math.max(0, campaign.goal_leads - actual)
      perDayRequired = daysRemaining > 0 ? Math.ceil(gap / daysRemaining) : gap
    }
    // Last 14 days sparkline.
    const daily = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - i)
      const ds = d.toISOString().slice(0, 10)
      daily.push({ date: ds, count: dailyMap[ds] || 0 })
    }

    res.json({
      campaign, goal: campaign.goal_leads, actual, planned,
      channels: chRows,
      pace: { today, days_remaining: daysRemaining, per_day_required: perDayRequired, gap: Math.max(0, campaign.goal_leads - actual) },
      daily,
    })
  } catch (err) {
    console.error('GET /presale/dashboard', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/presale/leads — append to the ledger ──────────────────────────
router.post('/leads', async (req, res) => {
  try {
    const sb = db(); const sid = req.studio.id
    const { channel_id, lead_count, logged_on, source_tag, notes } = req.body
    const n = parseInt(lead_count)
    if (!channel_id || !Number.isFinite(n)) return res.status(400).json({ error: 'channel_id and lead_count required' })
    const { data: ch } = await sb.from('presale_channels').select('id, campaign_id, studio_id').eq('id', channel_id).maybeSingle()
    if (!ch || ch.studio_id !== sid) return res.status(404).json({ error: 'Channel not found for this studio' })
    const { data, error } = await sb.from('presale_lead_log').insert({
      campaign_id: ch.campaign_id, channel_id, studio_id: sid,
      logged_on: logged_on || todayInChicago(), lead_count: n,
      source_tag: source_tag || null, notes: notes || null, logged_by: req.user.id,
    }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    res.status(201).json(data)
  } catch (err) {
    console.error('POST /presale/leads', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── PUT /api/presale/channels/:id/plan — edit the plan (owner only) ──────────
router.put('/channels/:id/plan', requireRole('owner'), async (req, res) => {
  const sb = db()
  const num = (v) => (v === '' || v == null) ? 0 : Number(v)
  const patch = {}
  if (req.body.plan_units !== undefined) patch.plan_units = num(req.body.plan_units)
  if (req.body.plan_per_unit !== undefined) patch.plan_per_unit = num(req.body.plan_per_unit)
  const { data, error } = await sb.from('presale_channels').update(patch)
    .eq('id', req.params.id).eq('studio_id', req.studio.id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── PUT /api/presale/campaign — edit goal / launch day (owner only) ──────────
router.put('/campaign', requireRole('owner'), async (req, res) => {
  const sb = db()
  const patch = { updated_at: new Date().toISOString() }
  if (req.body.goal_leads !== undefined) patch.goal_leads = parseInt(req.body.goal_leads) || 1000
  if (req.body.launch_day !== undefined) patch.launch_day = req.body.launch_day || null
  if (req.body.name !== undefined) patch.name = String(req.body.name).trim()
  const { data, error } = await sb.from('presale_campaigns').update(patch)
    .eq('studio_id', req.studio.id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

module.exports = router
