const { supabase } = require('@recordai/db');
const { createSubscription, cancelSubscription, getPlanConfig, PLANS } = require('../services/mercadopago');
const { AppError, NotFoundError, ValidationError } = require('../errors');
const logger = require('../config/logger');

/**
 * GET /api/subscription
 * Get current subscription for authenticated tenant
 */
async function getSubscription(req, res, next) {
  try {
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .maybeSingle();

    if (error) throw error;

    if (!subscription) {
      throw new NotFoundError('No subscription found for this tenant');
    }

    // Get tenant to check trial status
    const { data: tenant } = await supabase
      .from('tenants')
      .select('trial_ends_at, messages_sent_this_month, created_at')
      .eq('id', req.tenantId)
      .single();

    const planConfig = getPlanConfig(subscription.plan);
    const now = new Date();
    const trialEndsAt = tenant?.trial_ends_at ? new Date(tenant.trial_ends_at) : null;
    const isInTrial = trialEndsAt && trialEndsAt > now;
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
 * Body: { plan: 'inicial' | 'profesional' | 'custom', payer: { email, firstName, lastName } }
 */
async function createCheckout(req, res, next) {
  try {
    const { plan, payer } = req.body;

    if (!plan || !['inicial', 'profesional', 'custom'].includes(plan)) {
      throw new ValidationError('Invalid plan. Must be "inicial", "profesional", or "custom"');
    }

    if (!payer?.email) {
      throw new ValidationError('Payer email is required');
    }

    // Check if tenant already has an active paid subscription
    const { data: currentSub } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('tenant_id', req.tenantId)
      .maybeSingle();

    if (currentSub && ['inicial', 'profesional', 'custom'].includes(currentSub.plan) && currentSub.status === 'active') {
      throw new ValidationError('You already have an active paid subscription. Please cancel it first to change plans.');
    }

    const subscriptionData = await createSubscription(req.tenantId, plan, payer);

    logger.info({ tenantId: req.tenantId, plan }, 'Checkout session created');

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
    const plans = Object.entries(PLANS).map(([key, config]) => ({
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
      '✅ 1 agenda de Google Calendar',
      '✅ 100 recordatorios de WhatsApp/mes',
      '✅ Confirmaciones automáticas',
      '✅ Recordatorios programados',
      '✅ Panel de control completo',
      '✅ Soporte por email',
      '💰 $150 por mensaje adicional',
    ],
    profesional: [
      '✅ Hasta 3 agendas de Google Calendar',
      '✅ 500 recordatorios de WhatsApp/mes',
      '✅ Confirmaciones automáticas',
      '✅ Recordatorios programados',
      '✅ Panel de control completo',
      '✅ Soporte técnico prioritario',
      '✅ Estadísticas avanzadas',
      '✅ Múltiples usuarios',
      '💰 $120 por mensaje adicional',
    ],
    custom: [
      '✅ Agendas ilimitadas',
      '✅ Mensajes masivos sin límite',
      '✅ Integración con CRM propio',
      '✅ API personalizada',
      '✅ Soporte dedicado 24/7',
      '✅ Reportes personalizados',
      '✅ Onboarding y capacitación',
      '💼 Precio a medida según volumen',
    ],
  };

  return features[plan] || [];
}

module.exports = {
  getSubscription,
  createCheckout,
  cancelSubcription,
  getPlans,
};
