// Seed a brand-new studio with starter content by copying the library tables from a
// template source studio (Pewaukee by default). Mirrors the manual SQL copy used to
// stand up Madison. Idempotent: each table is skipped if the new studio already has rows,
// so a retry after a partial failure fills only what's missing.
//
// Global/shared content (scorecard catalog, certification curriculum) needs no seeding.
// Operational tables (bookings, completions, EOD, journeys, goals, trends, …) start empty.

const { seedTemplates } = require('./journeyEngine')

const TEMPLATE_STUDIO_ID =
  process.env.TEMPLATE_STUDIO_ID || '3abc6af6-37b8-4c13-b761-a92b5204ca25' // HOTWORX Pewaukee

function chunk(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

// Page through all rows for a studio (Supabase caps a select at 1000).
async function fetchAll(sb, table, studioId) {
  const PAGE = 1000
  let out = [], from = 0
  for (;;) {
    const { data, error } = await sb.from(table).select('*').eq('studio_id', studioId).range(from, from + PAGE - 1)
    if (error) throw new Error(`${table} read: ${error.message}`)
    if (!data || !data.length) break
    out = out.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

async function alreadySeeded(sb, table, studioId) {
  const { count } = await sb.from(table).select('id', { count: 'exact', head: true }).eq('studio_id', studioId)
  return (count || 0) > 0
}

// Copy a flat library table: drop identity/timestamp columns, remap studio_id, insert.
// Keeps created_by/updated_by/staff_id (valid user references) to satisfy any constraints.
async function copyTable(sb, table, srcStudio, newStudio, strip = ['id', 'created_at', 'updated_at']) {
  if (await alreadySeeded(sb, table, newStudio)) return { table, copied: 0, skipped: true }
  const rows = await fetchAll(sb, table, srcStudio)
  const mapped = rows.map(r => {
    const o = { ...r }
    for (const k of strip) delete o[k]
    o.studio_id = newStudio
    return o
  })
  for (const c of chunk(mapped, 500)) {
    const { error } = await sb.from(table).insert(c)
    if (error) throw new Error(`${table} insert: ${error.message}`)
  }
  return { table, copied: mapped.length }
}

// SOPs have a child version table keyed by sop_id, so copy parents first and remap.
async function copySops(sb, srcStudio, newStudio) {
  if (await alreadySeeded(sb, 'sops', newStudio)) return { table: 'sops', copied: 0, skipped: true }
  const sops = await fetchAll(sb, 'sops', srcStudio)
  let sopCopied = 0, verCopied = 0
  for (const s of sops) {
    const { id: oldId, created_at, updated_at, ...rest } = s
    const { data: newSop, error } = await sb.from('sops').insert({ ...rest, studio_id: newStudio }).select('id').single()
    if (error) throw new Error(`sops insert: ${error.message}`)
    sopCopied++
    const { data: vers, error: vErr } = await sb.from('sop_versions')
      .select('version, content, updated_by, updated_at').eq('sop_id', oldId)
    if (vErr) throw new Error(`sop_versions read: ${vErr.message}`)
    if (vers && vers.length) {
      const vrows = vers.map(v => ({ sop_id: newSop.id, version: v.version, content: v.content, updated_by: v.updated_by, updated_at: v.updated_at }))
      const { error: ie } = await sb.from('sop_versions').insert(vrows)
      if (ie) throw new Error(`sop_versions insert: ${ie.message}`)
      verCopied += vrows.length
    }
  }
  return { table: 'sops', copied: sopCopied, versions: verCopied }
}

// Seed a new studio's libraries. Returns a per-step report (never throws for a single
// library so a partial success is visible; the caller can re-run to fill the rest).
async function seedStudio(sb, newStudioId, srcStudioId = TEMPLATE_STUDIO_ID) {
  const steps = []
  const run = async (label, fn) => {
    try { steps.push(await fn()) }
    catch (e) { steps.push({ table: label, error: e.message }) }
  }

  await run('cleaning_tasks', () => copyTable(sb, 'cleaning_tasks', srcStudioId, newStudioId))
  await run('marketing_tasks', () => copyTable(sb, 'marketing_tasks', srcStudioId, newStudioId))
  await run('marketing_ideas', () => copyTable(sb, 'marketing_ideas', srcStudioId, newStudioId, ['id']))
  await run('sops', () => copySops(sb, srcStudioId, newStudioId))
  await run('onboarding_touchpoint_templates', async () => {
    await seedTemplates(sb, newStudioId)   // idempotent, seeds from code defaults
    return { table: 'onboarding_touchpoint_templates', seeded: true }
  })

  const ok = steps.every(s => !s.error)
  return { ok, steps }
}

module.exports = { seedStudio, TEMPLATE_STUDIO_ID }
