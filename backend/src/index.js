require('dotenv').config()
const express = require('express')
const cors = require('cors')

const app = express()

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }))
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

const { startEodCron } = require('./jobs/eodEmailCron')

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`HOTWORX Team Hub backend running on port ${PORT}`)
  startEodCron()
})
