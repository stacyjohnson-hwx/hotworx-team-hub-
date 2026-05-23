const router = require('express').Router()

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    studio: process.env.STUDIO_NAME || 'HOTWORX Pewaukee',
    timestamp: new Date().toISOString(),
  })
})

module.exports = router
