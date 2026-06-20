const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const authenticate = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/roleGuard')
const { requireStudio } = require('../middleware/studioMiddleware')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

router.use(authenticate, requireStudio)

// The skill library (categories/skills/scripts/quizzes) is SHARED across studios —
// the studio playbook. Each TSA's progress (status/attempts/demos/feedback) is
// scoped to the studio. Owner + Lead(manager) can author everything.
const canAuthor = requireRole('owner', 'manager')

// ─── Helpers ────────────────────────────────────────────────────────────────
// Display names from the Team section (user_profiles.full_name), with an auth
// metadata / email fallback so a name always resolves.
async function namesFor(sb, ids) {
  const map = {}
  if (!ids.length) return map
  const { data } = await sb.from('user_profiles').select('id, full_name').in('id', ids)
  for (const r of data || []) if (r.full_name) map[r.id] = r.full_name
  // Fallback for anyone missing a profile name.
  for (const id of ids) {
    if (map[id]) continue
    try {
      const { data: u } = await sb.auth.admin.getUserById(id)
      map[id] = u?.user?.user_metadata?.full_name || u?.user?.email?.split('@')[0] || 'Team Member'
    } catch { map[id] = 'Team Member' }
  }
  return map
}

// The whole coaching team — managers + TSAs (owner excluded), active only.
async function activeTeamIds(sb, studioId) {
  const [{ data: members }, { data: inactive }] = await Promise.all([
    sb.from('user_studios').select('user_id, role').eq('studio_id', studioId).in('role', ['tsa', 'manager']),
    sb.from('user_profiles').select('id').eq('is_active', false),
  ])
  const dead = new Set((inactive || []).map(r => r.id))
  return [...new Set((members || []).map(m => m.user_id).filter(id => !dead.has(id)))]
}

function gradeQuiz(questions, answers) {
  const norm = s => String(s ?? '').trim().toLowerCase()
  let correct = 0
  for (const q of questions) {
    const given = answers[q.id]
    if (given != null && norm(given) === norm(q.correct_answer)) correct++
  }
  const total = questions.length || 1
  return Math.round((correct / total) * 100)
}

// ─── Library ──────────────────────────────────────────────────────────────────
// GET /library — categories → skills → current script + quiz count (all roles read)
router.get('/library', async (req, res) => {
  const sb = db()
  const [{ data: cats }, { data: skills }, { data: scripts }, { data: questions }] = await Promise.all([
    sb.from('skill_category').select('*').eq('active', true).order('sort_order'),
    sb.from('skill').select('*').eq('active', true).order('sort_order'),
    sb.from('script').select('skill_id, version, video_url, is_current').eq('is_current', true),
    sb.from('quiz_question').select('skill_id'),
  ])
  const scriptBySkill = {}
  for (const s of scripts || []) scriptBySkill[s.skill_id] = s
  const qCount = {}
  for (const q of questions || []) qCount[q.skill_id] = (qCount[q.skill_id] || 0) + 1

  const skillsByCat = {}
  for (const sk of skills || []) {
    (skillsByCat[sk.category_id] = skillsByCat[sk.category_id] || []).push({
      ...sk,
      current_version: scriptBySkill[sk.id]?.version || null,
      has_video: !!scriptBySkill[sk.id]?.video_url,
      quiz_count: qCount[sk.id] || 0,
    })
  }
  res.json((cats || []).map(c => ({ ...c, skills: skillsByCat[c.id] || [] })))
})

// GET /skills/:id — full skill detail: current script + quiz questions (read)
router.get('/skills/:id', async (req, res) => {
  const sb = db()
  const [{ data: skill }, { data: script }, { data: questions }] = await Promise.all([
    sb.from('skill').select('*').eq('id', req.params.id).maybeSingle(),
    sb.from('script').select('*').eq('skill_id', req.params.id).eq('is_current', true).maybeSingle(),
    sb.from('quiz_question').select('*').eq('skill_id', req.params.id).order('sort_order'),
  ])
  if (!skill) return res.status(404).json({ error: 'Skill not found' })
  res.json({ skill, script: script || null, questions: questions || [] })
})

router.post('/categories', canAuthor, async (req, res) => {
  const { name, sort_order } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  const { data, error } = await db().from('skill_category').insert({ name, sort_order: sort_order ?? 0 }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})
router.put('/categories/:id', canAuthor, async (req, res) => {
  const { name, sort_order, active } = req.body
  const { data, error } = await db().from('skill_category').update({ name, sort_order, active }).eq('id', req.params.id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})
// DELETE /categories/:id — blocked while it still has skills (deleting would
// cascade-wipe those skills + all certification progress on them).
router.delete('/categories/:id', canAuthor, async (req, res) => {
  const sb = db()
  const { data: skills } = await sb.from('skill').select('id').eq('category_id', req.params.id).eq('active', true).limit(1)
  if (skills && skills.length) {
    return res.status(400).json({ error: 'Move or delete this category’s skills first.' })
  }
  const { error } = await sb.from('skill_category').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

router.post('/skills', canAuthor, async (req, res) => {
  const { category_id, name, sort_order, pass_threshold } = req.body
  if (!category_id || !name) return res.status(400).json({ error: 'category_id and name required' })
  const { data, error } = await db().from('skill')
    .insert({ category_id, name, sort_order: sort_order ?? 0, pass_threshold: pass_threshold ?? 80 })
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})
router.put('/skills/:id', canAuthor, async (req, res) => {
  const { name, sort_order, pass_threshold, active, category_id } = req.body
  const { data, error } = await db().from('skill')
    .update({ name, sort_order, pass_threshold, active, category_id })
    .eq('id', req.params.id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /skills/:id — permanently removes the skill, its script, quiz, and all
// certification progress on it (FK cascade).
router.delete('/skills/:id', canAuthor, async (req, res) => {
  const { error } = await db().from('skill').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// PUT /skills/:id/script — save a NEW script version. Flips current Certified TSAs
// (all studios) to Needs Recert on the new version.
router.put('/skills/:id/script', canAuthor, async (req, res) => {
  const skillId = req.params.id
  const { body, video_url } = req.body
  const sb = db()
  const { data: cur } = await sb.from('script').select('version').eq('skill_id', skillId).eq('is_current', true).maybeSingle()
  const nextVersion = (cur?.version || 0) + 1
  await sb.from('script').update({ is_current: false }).eq('skill_id', skillId).eq('is_current', true)
  const { data, error } = await sb.from('script')
    .insert({ skill_id: skillId, version: nextVersion, body: body || '', video_url: video_url || null, is_current: true, updated_by: req.user.id, updated_at: new Date().toISOString() })
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  // Recert: anyone certified on this skill must re-quiz + re-demo on the new version.
  await sb.from('tsa_skill_status').update({ status: 'needs_recert', updated_at: new Date().toISOString() })
    .eq('skill_id', skillId).eq('status', 'certified')
  res.json(data)
})

// Quiz question authoring
router.post('/skills/:id/questions', canAuthor, async (req, res) => {
  const { type, prompt, choices, correct_answer, explanation, sort_order } = req.body
  if (!prompt || !correct_answer) return res.status(400).json({ error: 'prompt and correct_answer required' })
  const { data, error } = await db().from('quiz_question')
    .insert({ skill_id: req.params.id, type: type || 'multiple_choice', prompt, choices: choices || null, correct_answer, explanation: explanation || null, sort_order: sort_order ?? 0 })
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})
router.put('/questions/:qid', canAuthor, async (req, res) => {
  const { type, prompt, choices, correct_answer, explanation, sort_order } = req.body
  const { data, error } = await db().from('quiz_question')
    .update({ type, prompt, choices: choices || null, correct_answer, explanation: explanation ?? null, sort_order }).eq('id', req.params.qid).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})
router.delete('/questions/:qid', canAuthor, async (req, res) => {
  const { error } = await db().from('quiz_question').delete().eq('id', req.params.qid)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── TSA board (own progress) ───────────────────────────────────────────────
// GET /my — current user's status across all active skills + overall progress
router.get('/my', async (req, res) => {
  const sb = db()
  const uid = req.user.id
  const [{ data: skills }, { data: statuses }] = await Promise.all([
    sb.from('skill').select('id, name, category_id').eq('active', true).order('sort_order'),
    sb.from('tsa_skill_status').select('*').eq('studio_id', req.studio.id).eq('tsa_user_id', uid),
  ])
  const bySkill = {}
  for (const s of statuses || []) bySkill[s.skill_id] = s
  const rows = (skills || []).map(sk => ({
    skill_id: sk.id, name: sk.name, category_id: sk.category_id,
    status: bySkill[sk.id]?.status || 'not_started',
    certified_on: bySkill[sk.id]?.certified_on || null,
  }))
  const certified = rows.filter(r => r.status === 'certified').length
  res.json({ rows, certified, total: rows.length })
})

// POST /skills/:id/start — TSA marks practicing → Learning (if not further along)
router.post('/skills/:id/start', async (req, res) => {
  const sb = db()
  const { data: existing } = await sb.from('tsa_skill_status').select('status')
    .eq('studio_id', req.studio.id).eq('tsa_user_id', req.user.id).eq('skill_id', req.params.id).maybeSingle()
  // Only advance from not_started/needs_recert into learning; don't downgrade.
  if (existing && ['ready_to_test', 'certified'].includes(existing.status)) return res.json(existing)
  const { data, error } = await sb.from('tsa_skill_status').upsert({
    studio_id: req.studio.id, tsa_user_id: req.user.id, skill_id: req.params.id,
    status: 'learning', updated_at: new Date().toISOString(),
  }, { onConflict: 'studio_id, tsa_user_id, skill_id' }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /skills/:id/quiz — submit answers, grade, store attempt, auto-advance on pass
router.post('/skills/:id/quiz', async (req, res) => {
  const sb = db()
  const skillId = req.params.id
  const answers = req.body?.answers || {}
  const [{ data: skill }, { data: questions }] = await Promise.all([
    sb.from('skill').select('pass_threshold').eq('id', skillId).maybeSingle(),
    sb.from('quiz_question').select('*').eq('skill_id', skillId),
  ])
  if (!questions || !questions.length) return res.status(400).json({ error: 'This skill has no quiz yet.' })
  const score = gradeQuiz(questions, answers)
  const threshold = skill?.pass_threshold ?? 80
  const passed = score >= threshold

  await sb.from('quiz_attempt').insert({
    studio_id: req.studio.id, tsa_user_id: req.user.id, skill_id: skillId, score, passed,
  })
  if (passed) {
    await sb.from('tsa_skill_status').upsert({
      studio_id: req.studio.id, tsa_user_id: req.user.id, skill_id: skillId,
      status: 'ready_to_test', updated_at: new Date().toISOString(),
    }, { onConflict: 'studio_id, tsa_user_id, skill_id' })
  }
  res.json({ score, passed, threshold })
})

// ─── Lead: live demo ──────────────────────────────────────────────────────────
// GET /pending — queue of (tsa, skill) in ready_to_test
router.get('/pending', canAuthor, async (req, res) => {
  const sb = db()
  const [{ data: rows }, { data: skills }] = await Promise.all([
    sb.from('tsa_skill_status').select('*').eq('studio_id', req.studio.id).eq('status', 'ready_to_test').order('updated_at'),
    sb.from('skill').select('id, name'),
  ])
  const skillName = {}; for (const s of skills || []) skillName[s.id] = s.name
  const names = await namesFor(sb, [...new Set((rows || []).map(r => r.tsa_user_id))])
  res.json((rows || []).map(r => ({
    tsa_user_id: r.tsa_user_id, tsa_name: names[r.tsa_user_id] || 'Team Member',
    skill_id: r.skill_id, skill_name: skillName[r.skill_id] || 'Skill',
    since: r.updated_at,
  })))
})

// POST /skills/:id/demo — Lead records live-demo result (pass → Certified)
router.post('/skills/:id/demo', canAuthor, async (req, res) => {
  const sb = db()
  const skillId = req.params.id
  const { tsa_user_id, result, rubric_scores, feedback_note } = req.body
  if (!tsa_user_id || !['pass', 'fail'].includes(result)) return res.status(400).json({ error: 'tsa_user_id and result (pass|fail) required' })

  await sb.from('live_demo_result').insert({
    studio_id: req.studio.id, tsa_user_id, skill_id: skillId, lead_user_id: req.user.id,
    result, rubric_scores: rubric_scores || null, feedback_note: feedback_note || null,
  })

  if (result === 'pass') {
    const { data: cur } = await sb.from('script').select('version').eq('skill_id', skillId).eq('is_current', true).maybeSingle()
    await sb.from('tsa_skill_status').upsert({
      studio_id: req.studio.id, tsa_user_id, skill_id: skillId, status: 'certified',
      certified_on: new Date().toISOString().slice(0, 10), certified_by: req.user.id,
      current_script_version: cur?.version || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'studio_id, tsa_user_id, skill_id' })
  } else {
    await sb.from('tsa_skill_status').upsert({
      studio_id: req.studio.id, tsa_user_id, skill_id: skillId, status: 'learning', updated_at: new Date().toISOString(),
    }, { onConflict: 'studio_id, tsa_user_id, skill_id' })
  }
  // Demo feedback always lands in the TSA's coaching feed (growth-framed).
  if (feedback_note) {
    await sb.from('coaching_feedback').insert({
      studio_id: req.studio.id, tsa_user_id, lead_user_id: req.user.id, skill_id: skillId,
      source: 'live_demo', note: feedback_note,
    })
  }
  res.json({ ok: true, result })
})

// ─── Lead/Owner: certification matrix + roll-ups ────────────────────────────────
router.get('/matrix', canAuthor, async (req, res) => {
  const sb = db()
  const [tsaIds, { data: skills }, { data: statuses }] = await Promise.all([
    activeTeamIds(sb, req.studio.id),
    sb.from('skill').select('id, name, category_id').eq('active', true).order('sort_order'),
    sb.from('tsa_skill_status').select('tsa_user_id, skill_id, status').eq('studio_id', req.studio.id),
  ])
  const names = await namesFor(sb, tsaIds)
  const stat = {}
  for (const s of statuses || []) stat[`${s.tsa_user_id}|${s.skill_id}`] = s.status

  const tsas = tsaIds.map(id => ({
    tsa_user_id: id, name: names[id] || 'Team Member',
    statuses: Object.fromEntries((skills || []).map(sk => [sk.id, stat[`${id}|${sk.id}`] || 'not_started'])),
  }))
  // Roll-up: % certified per skill across active TSAs
  const rollup = {}
  for (const sk of skills || []) {
    const certified = tsas.filter(t => t.statuses[sk.id] === 'certified').length
    rollup[sk.id] = { certified, total: tsas.length, pct: tsas.length ? Math.round((certified / tsas.length) * 100) : 0 }
  }
  res.json({ skills: skills || [], tsas, rollup })
})

// ─── Coaching feedback feed ─────────────────────────────────────────────────────
// GET /feedback?tsa_user_id= — TSA sees own; Lead/Owner can pass any TSA
router.get('/feedback', async (req, res) => {
  const sb = db()
  const isLead = req.role === 'owner' || req.role === 'manager'
  const target = isLead && req.query.tsa_user_id ? req.query.tsa_user_id : req.user.id
  const [{ data: rows }, { data: skills }] = await Promise.all([
    sb.from('coaching_feedback').select('*').eq('studio_id', req.studio.id).eq('tsa_user_id', target).order('created_at', { ascending: false }),
    sb.from('skill').select('id, name'),
  ])
  const skillName = {}; for (const s of skills || []) skillName[s.id] = s.name
  const leadNames = await namesFor(sb, [...new Set((rows || []).map(r => r.lead_user_id).filter(Boolean))])
  res.json((rows || []).map(r => ({
    ...r, skill_name: r.skill_id ? skillName[r.skill_id] : null, lead_name: leadNames[r.lead_user_id] || null,
  })))
})

router.post('/feedback', canAuthor, async (req, res) => {
  const { tsa_user_id, skill_id, note, source } = req.body
  if (!tsa_user_id || !note) return res.status(400).json({ error: 'tsa_user_id and note required' })
  const { data, error } = await db().from('coaching_feedback').insert({
    studio_id: req.studio.id, tsa_user_id, lead_user_id: req.user.id,
    skill_id: skill_id || null, source: source || 'general', note,
  }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ─── Coaching tracker (owner/manager only) ─────────────────────────────────────
// Per-employee coaching log + development status. Answers: is 1:1 coaching
// happening, who's improving, who's at risk.
const daysSince = (d) => (d ? Math.floor((Date.now() - new Date(d + 'T00:00:00').getTime()) / 86400000) : null)

router.get('/coaching/overview', canAuthor, async (req, res) => {
  const sb = db()
  const studioId = req.studio.id
  const [team, { data: logs }, { data: statuses }, { data: statusRows }, { data: skills }] = await Promise.all([
    activeTeamIds(sb, studioId),
    sb.from('coaching_log').select('employee_user_id, met_on, rating, next_session_on').eq('studio_id', studioId).order('met_on', { ascending: false }),
    sb.from('coaching_dev_status').select('employee_user_id, status, status_note').eq('studio_id', studioId),
    sb.from('tsa_skill_status').select('tsa_user_id, status').eq('studio_id', studioId).eq('status', 'certified'),
    sb.from('skill').select('id').eq('active', true),
  ])
  const names = await namesFor(sb, team)
  const statusMap = {}; for (const s of statuses || []) statusMap[s.employee_user_id] = s
  const certCount = {}; for (const r of statusRows || []) certCount[r.tsa_user_id] = (certCount[r.tsa_user_id] || 0) + 1
  const totalSkills = (skills || []).length
  const now = Date.now()
  const within = (d, days) => d && (now - new Date(d + 'T00:00:00').getTime()) <= days * 86400000

  const rows = team.map(id => {
    const mine = (logs || []).filter(l => l.employee_user_id === id) // already desc by met_on
    const last = mine[0]
    const ratings = [...mine].reverse().filter(l => l.rating != null).map(l => l.rating).slice(-10)
    return {
      employee_user_id: id,
      name: names[id] || 'Team Member',
      last_met: last?.met_on || null,
      days_since: daysSince(last?.met_on),
      next_session_on: last?.next_session_on || null,
      sessions_30d: mine.filter(l => within(l.met_on, 30)).length,
      sessions_90d: mine.filter(l => within(l.met_on, 90)).length,
      total_sessions: mine.length,
      ratings,
      status: statusMap[id]?.status || null,
      status_note: statusMap[id]?.status_note || null,
      certified: certCount[id] || 0,
      total_skills: totalSkills,
    }
  })
  res.json(rows)
})

router.get('/coaching/:employeeId', canAuthor, async (req, res) => {
  const sb = db()
  const [{ data: log }, { data: status }, { data: skills }] = await Promise.all([
    sb.from('coaching_log').select('*').eq('studio_id', req.studio.id).eq('employee_user_id', req.params.employeeId).order('met_on', { ascending: false }),
    sb.from('coaching_dev_status').select('*').eq('studio_id', req.studio.id).eq('employee_user_id', req.params.employeeId).maybeSingle(),
    sb.from('skill').select('id, name'),
  ])
  const names = await namesFor(sb, [req.params.employeeId, ...new Set((log || []).map(l => l.coach_user_id).filter(Boolean))])
  const skillName = {}; for (const s of skills || []) skillName[s.id] = s.name
  res.json({
    name: names[req.params.employeeId] || 'Team Member',
    status: status || null,
    log: (log || []).map(l => ({ ...l, skill_name: l.skill_id ? skillName[l.skill_id] : null, coach_name: names[l.coach_user_id] || null })),
  })
})

router.post('/coaching/:employeeId/log', canAuthor, async (req, res) => {
  const { met_on, type, skill_id, rating, wins, focus, action_items, next_session_on, coach_user_id } = req.body
  const { data, error } = await db().from('coaching_log').insert({
    studio_id: req.studio.id, employee_user_id: req.params.employeeId,
    coach_user_id: coach_user_id || req.user.id,
    met_on: met_on || new Date().toISOString().slice(0, 10),
    type: type || '1_on_1', skill_id: skill_id || null,
    rating: rating || null, wins: wins || null, focus: focus || null,
    action_items: action_items || null, next_session_on: next_session_on || null,
    created_by: req.user.id,
  }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.put('/coaching/log/:id', canAuthor, async (req, res) => {
  const { met_on, type, skill_id, rating, wins, focus, action_items, next_session_on } = req.body
  const { data, error } = await db().from('coaching_log').update({
    met_on, type, skill_id: skill_id || null, rating: rating || null, wins, focus, action_items, next_session_on: next_session_on || null,
  }).eq('id', req.params.id).eq('studio_id', req.studio.id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.delete('/coaching/log/:id', canAuthor, async (req, res) => {
  const { error } = await db().from('coaching_log').delete().eq('id', req.params.id).eq('studio_id', req.studio.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

router.put('/coaching/:employeeId/status', canAuthor, async (req, res) => {
  const { status, status_note } = req.body
  const { data, error } = await db().from('coaching_dev_status').upsert({
    studio_id: req.studio.id, employee_user_id: req.params.employeeId,
    status: status || 'on_track', status_note: status_note || null,
    updated_by: req.user.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'studio_id, employee_user_id' }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

module.exports = router
