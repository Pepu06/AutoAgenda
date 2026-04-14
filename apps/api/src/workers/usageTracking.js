const { supabase } = require('@autoagenda/db');
const { randomUUID } = require('crypto');
const logger = require('../config/logger');

/**
 * Track a message sent and increment usage counters
 * @param {string} tenantId - Tenant ID
 * @param {string} messageType - Type of message (confirmation, reminder, follow_up, etc.)
 * @returns {Promise<void>}
 */
async function trackMessageSent(tenantId, messageType = 'unknown') {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-12

    // 1. Increment tenant's monthly counter
    const { data: tenantData, error: tenantFetchError } = await supabase
      .from('tenants')
      .select('messages_sent_this_month')
      .eq('id', tenantId)
      .single();

    const tenantError = tenantFetchError;
    if (!tenantFetchError && tenantData) {
      await supabase
        .from('tenants')
        .update({ messages_sent_this_month: (tenantData.messages_sent_this_month || 0) + 1 })
        .eq('id', tenantId);
    }

    if (tenantError) {
      logger.error({ 
        tenantId, 
        error: tenantError.message 
      }, '[Usage Tracking] Error updating tenant message count');
    }

    // 2. Update or create UsageRecord for this month
    const { data: existing, error: fetchError } = await supabase
      .from('usage_records')
      .select('id, messages_sent')
      .eq('tenant_id', tenantId)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle();

    if (fetchError) {
      logger.error({ 
        tenantId, 
        year, 
        month, 
        error: fetchError.message 
      }, '[Usage Tracking] Error fetching usage record');
      return;
    }

    if (existing) {
      // Update existing record
      const { error: updateError } = await supabase
        .from('usage_records')
        .update({
          messages_sent: existing.messages_sent + 1,
          updated_at: now.toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) {
        logger.error({ 
          tenantId, 
          recordId: existing.id, 
          error: updateError.message 
        }, '[Usage Tracking] Error updating usage record');
      }
    } else {
      // Create new record
      const { error: insertError } = await supabase
        .from('usage_records')
        .insert({
          id: randomUUID(),
          tenant_id: tenantId,
          year: year,
          month: month,
          messages_sent: 1,
          appointments_created: 0,
        });

      if (insertError) {
        logger.error({ 
          tenantId, 
          year, 
          month, 
          error: insertError.message 
        }, '[Usage Tracking] Error creating usage record');
      }
    }

    logger.info({ 
      tenantId, 
      messageType, 
      year, 
      month 
    }, '[Usage Tracking] Message tracked successfully');

  } catch (error) {
    logger.error({ 
      tenantId, 
      messageType, 
      error: error.message 
    }, '[Usage Tracking] Unexpected error tracking message');
  }
}

/**
 * Reset counters for all tenants
 * Should be run on the 1st of each month via cron job
 * @returns {Promise<void>}
 */
async function resetAllMonthlyCounters() {
  try {
    const { error } = await supabase
      .from('tenants')
      .update({ messages_sent_this_month: 0 })
      .neq('id', ''); // Update all

    if (error) {
      logger.error({ error: error.message }, '[Usage Tracking] Error resetting all counters');
    } else {
      logger.info('[Usage Tracking] All monthly counters reset');
    }
  } catch (error) {
    logger.error({ error: error.message }, '[Usage Tracking] Unexpected error resetting all counters');
  }
}

module.exports = {
  trackMessageSent,
  resetAllMonthlyCounters,
};
