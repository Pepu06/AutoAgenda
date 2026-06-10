// apps/api/src/routes/baileys.routes.js
const { Router } = require('express');
const auth = require('../middleware/auth');
const { getStatus, connect, disconnect, qrStream } = require('../controllers/baileys.controller');

const router = Router();
router.use(auth);

router.get('/status',     getStatus);
router.post('/connect',   connect);
router.delete('/session', disconnect);
router.get('/qr',         qrStream);

module.exports = router;
