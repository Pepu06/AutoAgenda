const { MercadoPagoConfig, PreApproval } = require('mercadopago');
const { supabase } = require('@autoagenda/db');
const logger = require('../config/logger');
const env = require('../config/env');

// Initialize Mercado Pago client
const client = new MercadoPagoConfig({
  accessToken: env.MERCADOPAGO_ACCESS_TOKEN,
  options: { timeout: 5000 }
});

const preApprovalApi = new PreApproval(client);

// Plan prices and limits
const PLANS = {
  trial: {
    name: 'Trial (15 días)',
    price: 0,
    messageLimit: null, // unlimited during trial
    calendarsLimit: 1,
    description: 'Prueba gratis por 15 días con todas las funciones',
  },
  inicial: {
    name: 'Plan de 100 citas al mes',
    subtitle: 'Ideal para profesionales independientes',
    price: 25000,
    messageLimit: 100,
    calendarsLimit: 1,
    currency: 'ARS',
    description: '1 agenda de Google Calendar, 100 recordatorios de WhatsApp al mes',
    valueProposition: 'Con un solo turno recuperado al mes, el plan se paga solo.',
    mpPlanId: 'cdc4ff38174c4a4ca96f285db153f2a0',
  },
  profesional: {
    name: 'Plan de 200 citas al mes',
    subtitle: 'Para equipos y consultorios en crecimiento',
    price: 40000,
    messageLimit: 200,
    calendarsLimit: 3,
    currency: 'ARS',
    description: '200 recordatorios de WhatsApp al mes, soporte técnico',
    valueProposition: 'Más volumen mensual con mejor costo por cita.',
    mpPlanId: 'a96dc488a9164d43b5f54b5454881025',
  },
  custom: {
    name: 'Plan de 300 citas al mes',
    subtitle: 'Para alto volumen de turnos',
    price: 50000,
    messageLimit: 300,
    calendarsLimit: 5,
    currency: 'ARS',
    description: '300 recordatorios de WhatsApp al mes, soporte prioritario',
    customPricing: false,
    contactRequired: false,
    valueProposition: 'El mejor valor para equipos con agenda intensa.',
    mpPlanId: 'a7c481d3cb6e4118836dd5fd7bd838e3',
  },
};

/**
 * Create a Mercado Pago subscription for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {string} plan - Plan type: 'inicial' | 'profesional' | 'custom'
 * @param {object} payer - Payer information { email, firstName, lastName }
 * @returns {Promise<object>} Subscription data with init_point URL
 */
async function createSubscription(tenantId, plan, payer) {
  if (!['inicial', 'profesional', 'custom'].includes(plan)) {
    throw new Error('Invalid plan. Must be "inicial", "profesional", or "custom"');
  }

  const planConfig = PLANS[plan];
  const backUrl = `${env.BASE_URL}/billing/success`;
  const notificationUrl = `${env.BASE_URL}/api/webhooks/mercadopago`;

  try {
    let preApproval;

    if (planConfig.mpPlanId) {
      // Pre-created plan: redirect to MP public checkout URL directly.
      // MP requires card_token_id to create preapprovals programmatically with preapproval_plan_id,
      // so we skip preapproval creation and send the user to the plan's checkout page.
      const checkoutUrl = `https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=${planConfig.mpPlanId}`;
      logger.info({ tenantId, plan }, 'Redirecting to MP plan checkout');
      return {
        subscriptionId: null,
        initPoint: checkoutUrl,
        sandboxInitPoint: checkoutUrl,
        status: 'pending',
      };
    }

    {
      const subscriptionBody = {
        reason: `AutoAgenda - ${planConfig.name}`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: planConfig.price,
          currency_id: planConfig.currency,
        },
        back_url: backUrl,
        payer_email: payer.email,
        external_reference: tenantId,
        status: 'pending',
      };
      preApproval = await preApprovalApi.create({ body: subscriptionBody });
    }

    logger.info({ tenantId, plan, mpSubscriptionId: preApproval.id }, 'Mercado Pago subscription created');

    // Update subscription in database
    const now = new Date();
    const currentPeriodEnd = new Date(now);
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    await supabase
      .from('subscriptions')
      .upsert({
        tenant_id: tenantId,
        plan: plan,
        status: 'active',
        mp_subscription_id: preApproval.id,
        current_period_start: now.toISOString(),
        current_period_end: currentPeriodEnd.toISOString(),
        cancel_at_period_end: false,
        updated_at: now.toISOString(),
      }, {
        onConflict: 'tenant_id',
      });

    return {
      subscriptionId: preApproval.id,
      initPoint: preApproval.init_point,
      sandboxInitPoint: preApproval.sandbox_init_point,
      status: preApproval.status,
    };
  } catch (error) {
    logger.error({ tenantId, plan, error: error.message }, 'Error creating Mercado Pago subscription');
    throw error;
  }
}

/**
 * Cancel a Mercado Pago subscription
 * @param {string} mpSubscriptionId - Mercado Pago subscription ID
 * @returns {Promise<void>}
 */
async function cancelSubscription(mpSubscriptionId) {
  try {
    await preApprovalApi.update({
      id: mpSubscriptionId,
      body: {
        status: 'cancelled',
      },
    });

    logger.info({ mpSubscriptionId }, 'Mercado Pago subscription cancelled');

    // Update subscription in database
    await supabase
      .from('subscriptions')
      .update({
        status: 'cancelled',
        cancel_at_period_end: true,
        updated_at: new Date().toISOString(),
      })
      .eq('mp_subscription_id', mpSubscriptionId);
  } catch (error) {
    logger.error({ mpSubscriptionId, error: error.message }, 'Error cancelling Mercado Pago subscription');
    throw error;
  }
}

/**
 * Get subscription status from Mercado Pago
 * @param {string} mpSubscriptionId - Mercado Pago subscription ID
 * @returns {Promise<object>} Subscription data
 */
async function getSubscriptionStatus(mpSubscriptionId) {
  try {
    const subscription = await preApprovalApi.get({ id: mpSubscriptionId });
    
    logger.info({ mpSubscriptionId, status: subscription.status }, 'Fetched subscription status from Mercado Pago');

    return {
      id: subscription.id,
      status: subscription.status,
      reason: subscription.reason,
      payerEmail: subscription.payer_email,
      dateCreated: subscription.date_created,
      lastModified: subscription.last_modified,
      amount: subscription.auto_recurring?.transaction_amount,
      currency: subscription.auto_recurring?.currency_id,
    };
  } catch (error) {
    logger.error({ mpSubscriptionId, error: error.message }, 'Error fetching subscription status from Mercado Pago');
    throw error;
  }
}

/**
 * Get plan configuration
 * @param {string} plan - Plan name: 'trial', 'basic'/'inicial', or 'pro'/'profesional'
 * @returns {object} Plan configuration
 */
function getPlanConfig(plan) {
  // DB stores 'basic'/'pro'; frontend/MP uses 'inicial'/'profesional' — normalize both
  const aliases = { basic: 'inicial', pro: 'profesional' };
  return PLANS[plan] || PLANS[aliases[plan]] || null;
}

module.exports = {
  createSubscription,
  cancelSubscription,
  getSubscriptionStatus,
  getPlanConfig,
  PLANS,
};
