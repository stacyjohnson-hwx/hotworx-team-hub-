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
    if (!origin) return callback(null, true)
    if (allowedOrigins.some(o => origin.startsWith(o))) return callback(null, true)
    callback(new Error(`CORS blocked: ${origin}`))
  },
  credentials: true,
}))
app.use(express.json())

app.use('/api/health',          require('./routes/health'))
app.use('/api/cleaning',        require('./routes/cleaning'))
app.use('/api/eod',             require('./routes/eod'))
app.use('/api/goals',           require('./routes/goals'))
app.use('/api/leads',           require('./routes/leads'))
app.use('/api/studio-trends',   require('./routes/studio-trends'))
app.use('/api/scorecard',       require('./routes/scorecard'))
app.use('/api/schedule',        require('./routes/schedule'))
app.use('/api/availability',    require('./routes/availability'))
app.use('/api/timeoff',         require('./routes/timeoff'))
app.use('/api/users',           require('./routes/users'))
app.use('/api/b2b',             require('./routes/b2b'))
app.use('/api/territories',     require('./routes/territories'))
app.use('/api/marketing',       require('./routes/marketing'))
app.use('/api/leadgen',         require('./routes/leadgen'))
app.use('/api/orders',          require('./routes/orders'))
app.use('/api/events',          require('./routes/events'))
app.use('/api/sops',            require('./routes/sops'))
app.use('/api/training',        require('./routes/training'))
app.use('/api/certification',   require('./routes/certification'))
app.use('/api/todo',            require('./routes/todo'))
app.use('/api/coaching',        require('./routes/coaching'))
app.use('/api/outreach',        require('./routes/outreach'))
app.use('/api/feedback',        require('./routes/feedback'))
app.use('/api/maintenance',     require('./routes/maintenance'))
app.use('/api/escalations',     require('./routes/escalations'))
app.use('/api/dashboard-links', require('./routes/dashboardLinks'))
app.use('/api/advisor',         require('./routes/advisor'))
app.use('/api/competitors',          require('./routes/competitors'))
app.use('/api/retail/import',       require('./routes/retail-import'))
app.use('/api/retail/analytics',    require('./routes/retail-analytics'))
app.use('/api/retail/counts',       require('./routes/retail-counts'))
app.use('/api/retail',              require('./routes/retail'))

module.exports = app
