const express = require('express');
const authenticate = require('../middleware/auth');
const { validateTenantAccess } = require('../middleware/tenantAuth');
const {
  getSubscription,
  createCheckout,
  cancelSubcription,
  getPlans,
  getUserTenantsController,
} = require('../controllers/subscription.controller');

const router = express.Router();

// All subscription routes require authentication
router.use(authenticate);

// GET /api/subscription - Get current subscription details
router.get('/', getSubscription);

// GET /api/subscription/plans - Get all available plans
router.get('/plans', getPlans);

// GET /api/subscription/user-tenants - Get all tenants for the authenticated user
router.get('/user-tenants', getUserTenantsController);

// POST /api/subscription/checkout - Create checkout session
// validateTenantAccess allows tenantId override from body for multi-tenant users
router.post('/checkout', validateTenantAccess, createCheckout);

// POST /api/subscription/cancel - Cancel subscription
router.post('/cancel', validateTenantAccess, cancelSubcription);

module.exports = router;
