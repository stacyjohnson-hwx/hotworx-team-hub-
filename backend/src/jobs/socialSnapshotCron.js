const cron = require('node-cron')
const { createClient } = require('@supabase/supabase-js')
const { FETCHERS } = require('../services/socialConnectors')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const todayInChicago = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

// Job A — nightly follower/review snapshot (PRD §6). Idempotent: re-running the
// same day overwrites today's row (unique channel_id + snapshot_date). A channel
// whose connector isn't provisioned yet is skipped, not failed — the dashboard
// keeps rendering last-known data.
async function snapshotChannels() {
  const date = todayInChicago()
  const supabase = db()
  const { data: channels, error } = await supabase
    .from('social_channels').select('*').eq('active', true)
  if (error) { console.error('[Social Cron] load channels:', error.message); return { ok: 0, skipped: 0 } }

  let ok = 0, skipped = 0
  for (const ch of channels || []) {
    try {
      const fetcher = FETCHERS[ch.platform]
      const current = fetcher ? await fetcher(ch) : null
      if (!current) { skipped++; continue }   // connector not configured / no data
      await supabase.from('channel_snapshots').upsert({
        channel_id: ch.id, snapshot_date: date,
        followers: current.followers ?? null,
        rating: current.rating ?? null,
        review_count: current.review_count ?? null,
        captured_at: new Date().toISOString(),
      }, { onConflict: 'channel_id,snapshot_date' })
      ok++
    } catch (e) {
      console.error(`[Social Cron] ${ch.platform} snapshot failed:`, e.message)
      skipped++
    }
  }
  console.log(`[Social Cron] snapshot ${date}: ${ok} recorded, ${skipped} skipped (unconfigured/none)`)
  return { ok, skipped }
}

function startSocialCron() {
  // 2:00 AM America/Chicago (PRD §6, Job A). Post-insights + teardown jobs
  // (B, C) layer on here once connectors are live.
  cron.schedule('0 2 * * *', () => { snapshotChannels().catch(e => console.error('[Social Cron]', e.message)) },
    { timezone: 'America/Chicago' })
}

module.exports = { startSocialCron, snapshotChannels }
