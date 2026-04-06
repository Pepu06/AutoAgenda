const { supabase } = require('@autoagenda/db');
const { sendTemplate } = require('../services/whatsapp');
const logger = require('../config/logger');
const { appointmentsQueue } = require('./queue');
const { JobName } = require('@autoagenda/shared');
const { formatTemplateHour } = require('../utils/datetime');
const { trackMessageSent } = require('./usageTracking');

function hasReminderConfig(tenant) {
  const businessName = String(tenant?.business_name || '').trim();
  const messageTemplate = String(tenant?.message_template || '').trim();
  return Boolean(businessName && messageTemplate);
}

async function sendReminder({ appointmentId }) {
  const { data: appointment } = await supabase
    .from('appointments')
    .select('*, contact:contacts(*), service:services(*), tenant:tenants(*)')
    .eq('id', appointmentId)
    .maybeSingle();

  if (!appointment) {
    logger.warn({ appointmentId }, 'Appointment not found for reminder');
    return;
  }

  if (appointment.tenant?.messaging_enabled === false) {
    logger.info({ appointmentId }, 'Skipping reminder, messaging disabled');
    return;
  }

  if (appointment.status === 'cancelled') {
    logger.info({ appointmentId }, 'Skipping reminder, appointment cancelled');
    return;
  }

  if (!hasReminderConfig(appointment.tenant)) {
    logger.warn({ appointmentId, tenantId: appointment.tenant_id }, 'Skipping recordatorio_turno: missing business_name or message_template');
    return;
  }

  const tz = appointment.tenant?.timezone || 'America/Argentina/Buenos_Aires';
  const dateObj = new Date(appointment.scheduled_at);
  
  const fechaLabel = dateObj.toLocaleDateString('es-AR', {
    timeZone: tz, weekday: 'long', day: '2-digit', month: '2-digit',
  });
  const horaLabel = formatTemplateHour(dateObj, {
    timeZone: tz,
    timeFormat: appointment.tenant?.time_format,
  });

  const encabezado  = (appointment.tenant?.business_name || 'AutoAgenda').slice(0, 40);
  const mensajeEdit = (appointment.tenant?.message_template || '').replace(/[\n\r\t]/g, ' ').replace(/ {5,}/g, '    ');
  const ubicacion   = appointment.tenant?.location || '';

  const tenantConfig = {
    provider: appointment.tenant?.whatsapp_provider || 'meta',
    whatsappPhoneNumberId: appointment.tenant?.whatsapp_phone_number_id,
    whatsappAccessToken: appointment.tenant?.whatsapp_access_token,
    wasender_api_key: appointment.tenant?.wasender_api_key,
  };

  // Enviar plantilla recordatorio_turno con botones
  await sendTemplate(appointment.contact.phone, 'recordatorio_turno', {
    header: [{ name: 'encabezado', value: encabezado }],
    body: [
      { name: 'nombre_cliente',   value: appointment.contact.name },
      { name: 'mensaje_editable', value: mensajeEdit },
      { name: 'fecha',            value: fechaLabel },
      { name: 'hora',             value: horaLabel },
      { name: 'ubicacion',        value: ubicacion },
    ],
    // Embed appointmentId in button payloads so webhook knows exactly which appointment
    buttons: [
      { index: 0, payload: `confirm_${appointmentId}` },
      { index: 1, payload: `cancel_${appointmentId}` },
    ],
  }, tenantConfig);

  const { error: updateError } = await supabase
    .from('appointments')
    .update({ status: 'pending' })
    .eq('id', appointmentId)
    .eq('tenant_id', appointment.tenant_id);

  if (updateError) {
    logger.error({ appointmentId, updateError }, 'Failed to mark appointment as pending after reminder');
    throw updateError;
  }

  await trackMessageSent(appointment.tenant_id, 'reminder');

  appointmentsQueue
    .add(JobName.SEND_FOLLOW_UP, { appointmentId }, { delay: 2 * 60 * 60 * 1000 })
    .catch(() => { });

  logger.info({ appointmentId }, 'Reminder sent via recordatorio_turno template');
}

module.exports = { sendReminder };
