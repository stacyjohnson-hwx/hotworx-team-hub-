const router = require('express').Router()

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    studio: process.env.STUDIO_NAME || 'HOTWORX Pewaukee',
    timestamp: new Date().toISOString(),
  })
})

// Public email-config status — booleans + build marker only (no secrets, no PII).
// Lets us confirm which code is deployed and which transport env vars are present.
router.get('/email', (req, res) => {
  const sender = process.env.EMAIL_FROM || process.env.EMAIL_USER || ''
  res.json({
    build: 'email-sendgrid-2',
    sendgrid_set: !!process.env.SENDGRID_API_KEY,
    gmail_set: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
    resend_set: !!process.env.RESEND_API_KEY,
    sender_domain: sender.includes('@') ? sender.split('@')[1] : null,
    sender_set: !!sender,
  })
})

module.exports = router
