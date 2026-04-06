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
    name: 'Plan Inicial',
    subtitle: 'Ideal para profesionales independientes',
    price: 25000, // $25.000 ARS/mes
    messageLimit: 100,
    calendarsLimit: 1,
    extraMessagePrice: 150, // $150 ARS por mensaje adicional
    currency: 'ARS',
    description: '1 agenda de Google Calendar, 100 recordatorios de WhatsApp al mes',
    valueProposition: 'Si un paciente falta a una consulta de $40.000 ARS, perdiste esa plata. Si invertís $25.000 en AutoAgenda, con que salves un solo turno que se iba a perder, la app ya se pagó sola y te dio ganancia.',
  },
  profesional: {
    name: 'Plan Profesional',
    subtitle: 'Para consultorios médicos e inmobiliarias',
    price: 55000, // $55.000 ARS/mes
    messageLimit: 500,
    calendarsLimit: 3,
    extraMessagePrice: 120, // $120 ARS por mensaje adicional
    currency: 'ARS',
    description: 'Hasta 3 agendas, 500 recordatorios de WhatsApp al mes, soporte técnico',
    valueProposition: 'Reducí las ausencias hasta un 80%. Con 2 turnos salvados al mes ya recuperaste la inversión.',
  },
  custom: {
    name: 'Plan Custom',
    subtitle: 'B2B Corporativo',
    price: 120000, // Desde $120.000 ARS
    messageLimit: null, // unlimited
    calendarsLimit: null, // unlimited
    extraMessagePrice: 0,
    currency: 'ARS',
    description: 'Agendas ilimitadas, mensajes masivos, integración con CRM propio',
    customPricing: true,
    contactRequired: true,
    valueProposition: 'Solución enterprise a medida. Integramos con tu CRM y procesos internos. Precio personalizado según volumen.',
  },
};

/**
 * Create a Mercado Pago subscription for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {string} plan - Plan type: 'inicial', 'profesional', or 'custom'
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
    // Create pre-approval (subscription) in Mercado Pago
    const preApproval = await preApprovalApi.create({
      body: {
        reason: `AutoAgenda - ${planConfig.name}`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: planConfig.price,
          currency_id: planConfig.currency,
          free_trial: {
            frequency: 0,
            frequency_type: 'months',
          },
        },
        back_url: backUrl,
        payer_email: payer.email,
        external_reference: tenantId,
        status: 'pending',
      },
    });

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
 * @param {string} plan - Plan name: 'trial', 'basic', or 'pro'
 * @returns {object} Plan configuration
 */
function getPlanConfig(plan) {
  return PLANS[plan] || null;
}

module.exports = {
  createSubscription,
  cancelSubscription,
  getSubscriptionStatus,
  getPlanConfig,
  PLANS,
};
