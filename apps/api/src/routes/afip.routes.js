const { Router } = require('express');
const auth = require('../middleware/auth');
const {
  getConfig, updateConfig, listInvoices, createInvoice, getComprobante,
} = require('../controllers/afip.controller');

const router = Router();
router.use(auth);

router.get('/config', getConfig);
router.put('/config', updateConfig);
router.get('/invoices', listInvoices);
router.post('/invoices', createInvoice);
router.get('/invoices/:id/comprobante', getComprobante);

module.exports = router;
