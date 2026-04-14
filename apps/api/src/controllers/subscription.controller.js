const { supabase } = require('@autoagenda/db');
const { createSubscription, cancelSubscription, getPlanConfig, PLANS } = require('../services/mercadopago');
const { getUserTenants } = require('../middleware/tenantAuth');
const { AppError, NotFoundError, ValidationError } = require('../errors');
const logger = require('../config/logger');

/**
 * GET /api/subscription
 * Get current subscription for authenticated tenant
 */
async function getSubscription(req, res, next) {
  try {
    let { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .maybeSingle();

    if (error) throw error;

    // Get tenant for message usage count
    const { data: tenant } = await supabase
      .from('tenants')
      .select('messages_sent_this_month')
      .eq('id', req.tenantId)
      .single();

    // No subscription row yet → create trial row
    if (!subscription) {
      const now = new Date();
      const trialEndsAt = tenant?.trial_ends_at
        ? new Date(tenant.trial_ends_at)
        : new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

      const { data: created, error: createError } = await supabase
        .from('subscriptions')
        .insert({
          id: crypto.randomUUID(),
          tenant_id: req.tenantId,
          plan: 'trial',
          status: 'active',
          current_period_start: now.toISOString(),
          current_period_end: trialEndsAt.toISOString(),
          cancel_at_period_end: false,
        })
        .select()
        .single();

      if (createError) throw createError;
      subscription = created;
    }

    const planConfig = getPlanConfig(subscription.plan);
    const now = new Date();
    const trialEndsAt = subscription.plan === 'trial' && subscription.current_period_end
      ? new Date(subscription.current_period_end)
      : null;
    // NULL current_period_end on trial = no expiry set yet, treat as active
    const isInTrial = subscription.plan === 'trial' && (!trialEndsAt || trialEndsAt > now);
    const trialDaysLeft = isInTrial ? Math.ceil((trialEndsAt - now) / (1000 * 60 * 60 * 24)) : 0;

    res.json({
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        mpSubscriptionId: subscription.mp_subscription_id,
      },
      usage: {
        messagesSent: tenant?.messages_sent_this_month || 0,
        messageLimit: planConfig?.messageLimit,
        unlimited: planConfig?.messageLimit === null,
      },
      trial: {
        active: isInTrial,
        endsAt: trialEndsAt,
        daysLeft: trialDaysLeft,
      },
      planDetails: planConfig,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/subscription/checkout
 * Create a checkout session for a plan upgrade
 * Body: { plan: 'inicial' | 'profesional' | 'custom' }
 * Uses authenticated user's email automatically
 */
async function createCheckout(req, res, next) {
  try {
    const { plan } = req.body;

    if (!plan || !['inicial', 'profesional', 'custom'].includes(plan)) {
      throw new ValidationError('Invalid plan. Must be "inicial", "profesional", or "custom"');
    }

    // Get user email from database
    logger.info({ userId: req.userId, tenantId: req.tenantId }, 'Fetching user email for checkout');
    
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email')
      .eq('id', req.userId)
      .single();

    if (userError) {
      logger.error({ error: userError, userId: req.userId }, 'Error fetching user from database');
      throw new NotFoundError('User not found');
    }

    if (!user) {
      logger.error({ userId: req.userId }, 'User not found in database');
      throw new NotFoundError('User not found');
    }
    
    logger.info({ email: user.email }, 'User email retrieved successfully');

    // Check if tenant already has an active paid subscription
    const { data: currentSub } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('tenant_id', req.tenantId)
      .maybeSingle();

    if (currentSub && ['inicial', 'profesional', 'custom'].includes(currentSub.plan) && currentSub.status === 'active') {
      throw new ValidationError('You already have an active paid subscription. Please cancel it first to change plans.');
    }

    // Build payer object with user's email
    const payer = {
      email: user.email,
    };

    const subscriptionData = await createSubscription(req.tenantId, plan, payer);

    logger.info({ tenantId: req.tenantId, plan, email: user.email }, 'Checkout session created');

    res.json({
      success: true,
      checkoutUrl: subscriptionData.initPoint,
      subscriptionId: subscriptionData.subscriptionId,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/subscription/cancel
 * Cancel current subscription (will remain active until period end)
 */
async function cancelSubcription(req, res, next) {
  try {
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('mp_subscription_id, status, plan')
      .eq('tenant_id', req.tenantId)
      .maybeSingle();

    if (error) throw error;

    if (!subscription) {
      throw new NotFoundError('No subscription found');
    }

    if (subscription.status === 'cancelled') {
      throw new ValidationError('Subscription is already cancelled');
    }

    if (subscription.plan === 'trial') {
      throw new ValidationError('Cannot cancel trial subscription');
    }

    if (!subscription.mp_subscription_id) {
      throw new ValidationError('No Mercado Pago subscription ID found');
    }

    await cancelSubscription(subscription.mp_subscription_id);

    logger.info({ tenantId: req.tenantId, mpSubscriptionId: subscription.mp_subscription_id }, 'Subscription cancelled');

    res.json({
      success: true,
      message: 'Subscription cancelled. You will retain access until the end of the current billing period.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/subscription/plans
 * Get all available plans and their features
 */
async function getPlans(req, res, next) {
  try {
    const plans = Object.entries(PLANS)
      .map(([key, config]) => ({
      id: key,
      name: config.name,
      subtitle: config.subtitle,
      price: config.price,
      currency: config.currency || 'ARS',
      messageLimit: config.messageLimit,
      calendarsLimit: config.calendarsLimit,
      unlimited: config.messageLimit === null,
      extraMessagePrice: config.extraMessagePrice,
      description: config.description,
      valueProposition: config.valueProposition,
      customPricing: config.customPricing || false,
      contactRequired: config.contactRequired || false,
      features: getFeaturesByPlan(key),
    }));

    res.json({ plans });
  } catch (error) {
    next(error);
  }
}

/**
 * Helper to get features list by plan
 */
function getFeaturesByPlan(plan) {
  const features = {
    trial: [
      '✅ Mensajes ilimitados por 15 días',
      '✅ 1 agenda de Google Calendar',
      '✅ Confirmaciones automáticas',
      '✅ Recordatorios programados',
      '✅ Panel de control básico',
    ],
    inicial: [
      '✅ 100 recordatorios de WhatsApp/mes',
      '✅ Confirmaciones automáticas',
      '✅ Recordatorios programados',
      '✅ Panel de control completo',
      '✅ Soporte por email',
    ],
    profesional: [
      '✅ 200 recordatorios de WhatsApp/mes',
      '✅ Confirmaciones automáticas',
      '✅ Recordatorios programados',
      '✅ Panel de control completo',
      '✅ Soporte técnico prioritario',
      '✅ Estadísticas avanzadas',
      '✅ Múltiples usuarios',
    ],
    custom: [
      '✅ 300 recordatorios de WhatsApp/mes',
      '✅ Confirmaciones automáticas',
      '✅ Recordatorios programados',
      '✅ Panel de control completo',
      '✅ Soporte técnico prioritario',
      '✅ Estadísticas avanzadas',
      '✅ Múltiples usuarios',
    ],
  };

  return features[plan] || [];
}

/**
 * GET /api/subscription/user-tenants
 * Get all tenants accessible by the authenticated user
 */
async function getUserTenantsController(req, res, next) {
  try {
    const tenants = await getUserTenants(req.userId);
    res.json(tenants);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSubscription,
  createCheckout,
  cancelSubcription,
  getPlans,
  getUserTenantsController,
};
