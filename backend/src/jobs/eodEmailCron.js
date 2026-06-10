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

module.exports = { startEodCron, todayInChicago }
