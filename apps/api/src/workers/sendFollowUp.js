const { supabase } = require('@autoagenda/db');
const { sendTemplate } = require('../services/whatsapp');
const logger = require('../config/logger');
const { formatTemplateHour } = require('../utils/datetime');
const { checkUsageLimit } = require('../middleware/checkUsage');

function hasReminderConfig(tenant) {
  const businessName = String(tenant?.business_name || '').trim();
  const messageTemplate = String(tenant?.message_template || '').trim();
  return Boolean(businessName && messageTemplate);
}

async function sendFollowUp({ appointmentId }) {
  const { data: appointment } = await supabase
    .from('appointments')
    .select('*, contact:contacts(*), service:services(*), tenant:tenants(timezone, time_format, business_name, message_template, messaging_enabled, location, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, wasender_api_key)')
    .eq('id', appointmentId)
    .maybeSingle();

  if (!appointment) {
    logger.warn({ appointmentId }, 'Appointment not found for follow-up');
    return;
  }

  if (appointment.tenant?.messaging_enabled !== true) {
    logger.info({ appointmentId }, 'Skipping follow-up, messaging disabled');
    return;
  }

  const usageCheck = await checkUsageLimit(appointment.tenant_id);
  if (!usageCheck.allowed) {
    logger.warn({ appointmentId, reason: usageCheck.reason }, 'Skipping follow-up, usage limit reached');
    return;
  }

  // Send follow-up only for pending appointments
  if (appointment.status !== 'pending') {
    logger.info({ appointmentId, status: appointment.status }, 'Skipping follow-up, status is not pending');
    return;
  }

  if (!hasReminderConfig(appointment.tenant)) {
    logger.warn({ appointmentId, tenantId: appointment.tenant_id }, 'Skipping recordatorio_turno follow-up: missing business_name or message_template');
    return;
  }

  const tz = appointment.tenant?.timezone || 'America/Argentina/Buenos_Aires';
  const dateObj = new Date(appointment.scheduled_at);
  const date = dateObj.toLocaleDateString('es-AR', {
    timeZone: tz,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  });
  const time = formatTemplateHour(dateObj, { timeZone: tz, timeFormat: appointment.tenant?.time_format });

  const encabezado = appointment.tenant?.business_name;
  const mensajeEditable = `Aún no confirmaste tu cita del ${date} ${time}.`;
  const ubicacion = appointment.tenant?.location || '';

  const tenantConfig = {
    provider: appointment.tenant?.whatsapp_provider || 'meta',
    whatsappPhoneNumberId: appointment.tenant?.whatsapp_phone_number_id,
    whatsappAccessToken: appointment.tenant?.whatsapp_access_token,
    wasender_api_key: appointment.tenant?.wasender_api_key,
  };

  const whatsappResponse = await sendTemplate(appointment.contact.phone, 'recordatorio_turno', {
    header: [{ name: 'encabezado', value: encabezado }],
    body: [
      { name: 'nombre_cliente', value: appointment.contact.name || 'Cliente' },
      { name: 'mensaje_editable', value: mensajeEditable },
      { name: 'fecha', value: date },
      { name: 'hora', value: time },
      { name: 'ubicacion', value: ubicacion },
    ],
    buttons: [
      { index: 0, payload: `confirm_${appointmentId}` },
      { index: 1, payload: `cancel_${appointmentId}` },
    ],
  }, tenantConfig);

  const waMessageId = whatsappResponse?.messages?.[0]?.id || null;

  const { error: updateError } = await supabase
    .from('appointments')
    .update({ status: 'pending' })
    .eq('id', appointmentId)
    .eq('tenant_id', appointment.tenant_id);

  if (updateError) {
    logger.error({ appointmentId, updateError }, 'Failed to mark appointment as pending after follow-up');
    throw updateError;
  }

  const { error: logError } = await supabase.from('message_logs').insert({
    tenant_id:      appointment.tenant_id,
    appointment_id: appointmentId,
    type:           'follow_up',
    direction:      'outbound',
    status:         'sent',
    wa_message_id:  waMessageId,
  });

  if (logError) {
    logger.error({ appointmentId, logError }, 'Failed to insert follow-up message log');
  }

  logger.info({ appointmentId, waMessageId }, 'Follow-up sent');
}

module.exports = { sendFollowUp };
