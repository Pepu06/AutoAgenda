const express = require('express');
const authenticate = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const {
	createPaymentProof,
	getAdminPaymentProofs,
	approvePaymentProof,
	rejectPaymentProof,
	getAdminPaymentProofImage,
} = require('../controllers/paymentProofs.controller');

const router = express.Router();

// Tenant endpoint: upload payment proof
router.post('/payment-proofs', authenticate, createPaymentProof);

// Admin endpoints — password-gated in controller; rate limit to slow brute force.
router.use('/admin/payment-proofs', authLimiter);
router.get('/admin/payment-proofs', getAdminPaymentProofs);
router.post('/admin/payment-proofs/:proofId/approve', approvePaymentProof);
router.post('/admin/payment-proofs/:proofId/reject', rejectPaymentProof);
router.get('/admin/payment-proofs/:proofId/image', getAdminPaymentProofImage);

module.exports = router;
