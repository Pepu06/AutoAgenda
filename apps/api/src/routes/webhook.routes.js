const { Router } = require('express');
const { verify, receive, handleMercadoPagoWebhook } = require('../controllers/webhook.controller');

const router = Router();

// WhatsApp webhook
router.get('/', verify);
router.post('/', receive);

// Mercado Pago webhook
router.post('/mercadopago', handleMercadoPagoWebhook);

module.exports = router;
