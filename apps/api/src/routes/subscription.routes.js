const express = require('express');
const authenticate = require('../middleware/auth');
const {
  getSubscription,
  createCheckout,
  cancelSubcription,
  getPlans,
} = require('../controllers/subscription.controller');

const router = express.Router();

// All subscription routes require authentication
router.use(authenticate);

// GET /api/subscription - Get current subscription details
router.get('/', getSubscription);

// GET /api/subscription/plans - Get all available plans
router.get('/plans', getPlans);

// POST /api/subscription/checkout - Create checkout session
router.post('/checkout', createCheckout);

// POST /api/subscription/cancel - Cancel subscription
router.post('/cancel', cancelSubcription);

module.exports = router;
