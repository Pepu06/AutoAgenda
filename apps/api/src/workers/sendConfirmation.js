const { supabase } = require('@recordai/db');
const { sendTemplate } = require('../services/whatsapp');
const logger = require('../config/logger');

async function sendConfirmation({ appointmentId }) {
  const { data: appointment } = await supabase
    .from('appointments')
    .select('*, contact:contacts(*), service:services(*), tenant:tenants(*)')
    .eq('id', appointmentId)
    .maybeSingle();

  if (!appointment) {
    logger.warn({ appointmentId }, 'Appointment not found for confirmation');
    return;
  }

  if (appointment.status !== 'pending') {
    logger.info({ appointmentId, status: appointment.status }, 'Skipping confirmation, not pending');
    return;
  }

  const tz = appointment.tenant?.timezone || 'America/Argentina/Buenos_Aires';
  const dateObj = new Date(appointment.scheduled_at);
  const fechaLabel = dateObj.toLocaleDateString('es-AR', {
    timeZone: tz,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  });
  const horaLabel = dateObj.toLocaleTimeString('es-AR', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  await sendTemplate(appointment.contact.phone, 'recordatorio_turno', {
    header: [{ name: 'encabezado', value: appointment.tenant?.business_name || 'RecordAI' }],
    body: [
      { name: 'nombre_cliente', value: appointment.contact.name },
      { name: 'mensaje_editable', value: appointment.tenant?.message_template || '' },
      { name: 'fecha', value: fechaLabel },
      { name: 'hora', value: horaLabel },
    ],
  });

  await supabase.from('appointments').update({ confirmation_sent_at: new Date().toISOString() }).eq('id', appointmentId);

  await supabase.from('message_logs').insert({
    tenant_id:      appointment.tenant_id,
    appointment_id: appointmentId,
    type:           'confirmation',
    direction:      'outbound',
    status:         'sent',
  });

  logger.info({ appointmentId }, 'Confirmation sent');
}

module.exports = { sendConfirmation };
