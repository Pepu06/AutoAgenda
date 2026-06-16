const { supabase } = require('@autoagenda/db');
const { sendMessage } = require('../services/whatsapp');
const env = require('../config/env');
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
    .select('*, contact:contacts(*), service:services(*), tenant:tenants(timezone, time_format, business_name, message_template, messaging_enabled, location)')
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

  if (appointment.status !== 'pending') {
    logger.info({ appointmentId, status: appointment.status }, 'Skipping follow-up, status is not pending');
    return;
  }

  if (!hasReminderConfig(appointment.tenant)) {
    logger.warn({ appointmentId, tenantId: appointment.tenant_id }, 'Skipping follow-up: missing business_name or message_template');
    return;
  }

  const tz = appointment.tenant?.timezone || 'America/Argentina/Buenos_Aires';
  const dateObj = new Date(appointment.scheduled_at);
  const date = dateObj.toLocaleDateString('es-AR', {
    timeZone: tz, weekday: 'long', day: '2-digit', month: '2-digit',
  });
  const time = formatTemplateHour(dateObj, { timeZone: tz, timeFormat: appointment.tenant?.time_format });

  const nombre = appointment.contact.name || 'Cliente';
  const negocio = (appointment.tenant?.business_name || 'AutoAgenda').slice(0, 40);
  const ubicacion = appointment.tenant?.location || '';

  let text = `📅 Recordatorio de turno con ${negocio}\n\n`;
  text += `Hola ${nombre}, ¿cómo estás? 👋\n\n`;
  text += `Aún no confirmaste tu cita del ${date} a las ${time}.`;
  if (ubicacion) text += `\n\n📌 Ubicación: ${ubicacion}`;
  text += `\n\n👉 Confirmá o cancelá tu turno aquí:\n${env.BASE_URL}/c/${appointmentId}`;

  const whatsappResponse = await sendMessage(appointment.tenant_id, appointment.contact.phone, text);

  const waMessageId = whatsappResponse?.key?.id || null;

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
