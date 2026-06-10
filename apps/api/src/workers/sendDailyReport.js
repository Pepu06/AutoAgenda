const { supabase } = require('@autoagenda/db');
const { sendTemplate } = require('../services/whatsapp');
const logger = require('../config/logger');

/**
 * Sends daily report template to admin
 * @param {string} tenantId - Tenant ID
 * @param {string} reportType - 'morning' or 'evening'
 */
async function sendDailyReport({ tenantId, reportType }) {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('admin_whatsapp, business_name, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, wasender_api_key')
    .eq('id', tenantId)
    .maybeSingle();

  if (!tenant?.admin_whatsapp) {
    logger.warn({ tenantId }, 'No admin WhatsApp configured for daily report');
    return;
  }

  const tenantConfig = {
    provider: tenant.whatsapp_provider || 'baileys',
    tenantId,
    whatsappPhoneNumberId: tenant.whatsapp_phone_number_id,
    whatsappAccessToken: tenant.whatsapp_access_token,
    wasender_api_key: tenant.wasender_api_key,
  };

  // Send reporte_diario template (no variables, just button)
  await sendTemplate(tenant.admin_whatsapp, 'reporte_diario', {
    buttons: [
      { index: 0, payload: `daily_report_${tenantId}_${reportType}` },
    ],
  }, tenantConfig);

  logger.info({ tenantId, reportType, adminPhone: tenant.admin_whatsapp }, 'Daily report template sent to admin');
}

module.exports = { sendDailyReport };
