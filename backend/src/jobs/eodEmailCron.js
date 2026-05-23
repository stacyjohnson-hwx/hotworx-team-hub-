const cron = require('node-cron')
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
      await sendEodEmail(date)
    } catch (err) {
      console.error('[EOD Cron] Error:', err.message)
    }
  }, { timezone: 'America/Chicago' })

  console.log('[EOD Cron] Scheduled — fires at 10:00 PM CT daily')
}

module.exports = { startEodCron, todayInChicago }
