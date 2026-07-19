const app = require('./app')
const { startEodCron } = require('./jobs/eodEmailCron')
const { startSocialCron } = require('./jobs/socialSnapshotCron')
const { startTrendCron } = require('./jobs/trendDiscoveryCron')

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`HOTWORX Team Hub backend running on port ${PORT}`)
  startEodCron()
  startSocialCron()
  startTrendCron()
})
