const router = require('express').Router()
const { diagnoseEmail } = require('../services/eodEmail')

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

// TEMP debug: run the real email diagnostic server-side (bypasses browser/auth).
// Guarded by ?confirm=send so it isn't triggered casually. Remove after debugging.
router.get('/email-test', async (req, res) => {
  if (req.query.confirm !== 'send') return res.json({ hint: 'add ?confirm=send to run a real send test' })
  const studioId = req.query.studio || '3abc6af6-37b8-4c13-b761-a92b5204ca25'
  try {
    const result = await diagnoseEmail(studioId)
    res.json(result)
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message, stack: (e.stack || '').split('\n').slice(0, 4) })
  }
})

module.exports = router
