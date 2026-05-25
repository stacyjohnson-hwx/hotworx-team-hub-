require('dotenv').config()
const express = require('express')
const cors = require('cors')

const app = express()

const allowedOrigins = [
  'http://localhost:5173',
  'https://hotworx-team.vercel.app',
  process.env.FRONTEND_URL,
].filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Railway health checks)
    if (!origin) return callback(null, true)
    if (allowedOrigins.some(o => origin.startsWith(o))) return callback(null, true)
    callback(new Error(`CORS blocked: ${origin}`))
  },
  credentials: true,
}))
app.use(express.json())

// Routes
app.use('/api/health', require('./routes/health'))

app.use('/api/cleaning',  require('./routes/cleaning'))
app.use('/api/eod',       require('./routes/eod'))
app.use('/api/goals',          require('./routes/goals'))
app.use('/api/leads',          require('./routes/leads'))
app.use('/api/studio-trends',  require('./routes/studio-trends'))
app.use('/api/schedule',  require('./routes/schedule'))
app.use('/api/timeoff',   require('./routes/timeoff'))
app.use('/api/users',     require('./routes/users'))

app.use('/api/b2b',       require('./routes/b2b'))
app.use('/api/orders',    require('./routes/orders'))
app.use('/api/events',    require('./routes/events'))

app.use('/api/sops',      require('./routes/sops'))
app.use('/api/training',  require('./routes/training'))

app.use('/api/todo',      require('./routes/todo'))
app.use('/api/coaching',  require('./routes/coaching'))
app.use('/api/outreach',  require('./routes/outreach'))
app.use('/api/feedback',  require('./routes/feedback'))

const { startEodCron } = require('./jobs/eodEmailCron')

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`HOTWORX Team Hub backend running on port ${PORT}`)
  startEodCron()
})
