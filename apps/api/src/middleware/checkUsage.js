const { supabase } = require('@autoagenda/db');
const { getPlanConfig } = require('../services/mercadopago');
const logger = require('../config/logger');

/**
 * Middleware to check if tenant has exceeded their message limit
 * Should be called before sending any WhatsApp message
 */
async function checkUsageLimit(tenantId) {
  try {
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('messages_sent_this_month')
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      logger.error({ tenantId, error: tenantError?.message }, '[Usage] Error fetching tenant');
      throw new Error('Unable to verify usage limits');
    }

    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('tenant_id', tenantId)
      .single();

    if (subError || !subscription) {
      logger.error({ tenantId, error: subError?.message }, '[Usage] Error fetching subscription');
      throw new Error('No active subscription found');
    }

    const now = new Date();
    const trialEndsAt = subscription.plan === 'trial' && subscription.current_period_end
      ? new Date(subscription.current_period_end)
      : null;
    // NULL current_period_end on trial = no expiry set yet, treat as active
    const isInTrial = subscription.plan === 'trial' && (!trialEndsAt || trialEndsAt > now);

    // 1. Check if trial is active - allow unlimited messages during trial
    if (isInTrial) {
      logger.info({ tenantId, plan: 'trial' }, '[Usage] Trial active, allowing message');
      return { allowed: true, reason: 'trial' };
    }

    // 2. Check if trial expired but no paid subscription
    if (subscription.plan === 'trial' && trialEndsAt && trialEndsAt <= now) {
      logger.warn({ tenantId, trialEndsAt }, '[Usage] Trial expired, no paid subscription');
      return {
        allowed: false,
        reason: 'trial_expired',
        message: 'Tu período de prueba ha finalizado. Por favor, selecciona un plan para continuar usando AutoAgenda.'
      };
    }

    // 3. Check subscription status
    if (subscription.status !== 'active') {
      logger.warn({ tenantId, status: subscription.status }, '[Usage] Subscription not active');
      return { 
        allowed: false, 
        reason: 'subscription_inactive',
        message: 'Tu suscripción no está activa. Por favor, actualiza tu método de pago.'
      };
    }

    // 4. Check message limits based on plan
    const planConfig = getPlanConfig(subscription.plan);
    
    if (!planConfig) {
      logger.error({ tenantId, plan: subscription.plan }, '[Usage] Unknown plan');
      throw new Error('Unknown subscription plan');
    }

    // Plans with unlimited messages (custom)
    if (planConfig.messageLimit === null) {
      logger.info({ tenantId, plan: subscription.plan }, '[Usage] Unlimited plan, allowing message');
      return { allowed: true, reason: 'unlimited' };
    }

    // Check if limit exceeded
    const messagesSent = tenant.messages_sent_this_month || 0;
    const limit = planConfig.messageLimit;

    if (messagesSent >= limit) {
      logger.warn({ 
        tenantId, 
        plan: subscription.plan, 
        messagesSent, 
        limit 
      }, '[Usage] Message limit exceeded');
      
      return { 
        allowed: false, 
        reason: 'limit_exceeded',
        message: `Has alcanzado el límite de ${limit} mensajes de tu plan ${planConfig.name}. Mensajes enviados: ${messagesSent}/${limit}. Actualiza tu plan para enviar más mensajes.`,
        current: messagesSent,
        limit: limit,
        plan: subscription.plan
      };
    }

    // Allow message
    logger.info({ 
      tenantId, 
      plan: subscription.plan, 
      messagesSent, 
      limit 
    }, '[Usage] Within limits, allowing message');

    return { 
      allowed: true, 
      reason: 'within_limits',
      current: messagesSent,
      limit: limit
    };

  } catch (error) {
    logger.error({ tenantId, error: error.message }, '[Usage] Error checking usage limits');
    // In case of error, allow the message to avoid blocking service
    // but log for monitoring
    return { allowed: true, reason: 'error_fallback' };
  }
}

module.exports = {
  checkUsageLimit,
};
