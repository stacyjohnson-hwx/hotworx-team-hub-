const cron = require('node-cron')
const { createClient } = require('@supabase/supabase-js')
const { sendEodEmail } = require('../services/eodEmail')

function todayInChicago() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) // YYYY-MM-DD
}

function startEodCron() {
  // Fire at 10:00 PM every day, America/Chicago timezone
  cron.schedule('0 22 * * *', async () => {
    const date = todayInChicago()
    console.log(`[EOD Cron] Running nightly digest for ${date}`)
    try {
      // One digest per studio → that studio's active owner + manager users
      const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
      const { data: studios } = await db.from('studios').select('id')
      for (const s of (studios || [])) {
        await sendEodEmail(date, s.id)
      }
    } catch (err) {
      console.error('[EOD Cron] Error:', err.message)
    }
  }, { timezone: 'America/Chicago' })

  console.log('[EOD Cron] Scheduled — fires at 10:00 PM CT daily')
}

// If no closing EOD is entered by 8:30 PM CT, create an 'auto' end-of-day record
// so every operating day still has a history entry. Only for studios actively
// using EOD (submitted something in the last 14 days), to avoid empty records.
function startEodAutoSubmitCron() {
  cron.schedule('30 20 * * *', async () => {
    const date = todayInChicago()
    console.log(`[EOD AutoSubmit] Checking ${date}`)
    try {
      const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
      const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
      const { data: studios } = await db.from('studios').select('id')
      for (const s of (studios || [])) {
        // Active-EOD guard
        const { count: recent } = await db.from('eod_submissions')
          .select('id', { count: 'exact', head: true })
          .eq('studio_id', s.id).gte('shift_date', since)
        if (!recent) continue
        // Already have an end-of-day record today? (real closing or a prior auto)
        const { count: closed } = await db.from('eod_submissions')
          .select('id', { count: 'exact', head: true })
          .eq('studio_id', s.id).eq('shift_date', date).in('shift_type', ['closing', 'auto'])
        if (closed) continue
        // Need a submitter (NOT NULL) — use the studio owner
        const { data: owner } = await db.from('user_studios')
          .select('user_id').eq('studio_id', s.id).eq('role', 'owner').limit(1).maybeSingle()
        if (!owner) { console.warn(`[EOD AutoSubmit] no owner for studio ${s.id}, skipping`); continue }
        const { error } = await db.from('eod_submissions').insert({
          studio_id: s.id, submitted_by: owner.user_id, shift_date: date, shift_type: 'auto',
          auto_submitted: true, submitted_at: new Date().toISOString(),
          general_notes: 'Auto-submitted at 8:30 PM CT — no closing EOD was entered. The day’s logged tasks are still shown below.',
        })
        if (error && error.code !== '23505') console.error('[EOD AutoSubmit]', s.id, error.message)
        else console.log(`[EOD AutoSubmit] created auto EOD for studio ${s.id} ${date}`)
      }
    } catch (err) {
      console.error('[EOD AutoSubmit] Error:', err.message)
    }
  }, { timezone: 'America/Chicago' })
  console.log('[EOD AutoSubmit] Scheduled — fires at 8:30 PM CT daily')
}

module.exports = { startEodCron, startEodAutoSubmitCron, todayInChicago }
