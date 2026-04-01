const { supabase } = require('@recordai/db');
const { sendInteractiveButtons } = require('../services/whatsapp');
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

  const date = new Date(appointment.scheduled_at).toLocaleString('es-AR', {
    dateStyle: 'full',
    timeStyle: 'short',
  });

  const body =
    `Hola ${appointment.contact.name}! 👋\n\n` +
    `Tienes una cita programada:\n` +
    `📅 ${date}\n` +
    `💼 ${appointment.service.name}\n\n` +
    `¿Podés confirmar tu asistencia?`;

  await sendInteractiveButtons(appointment.contact.phone, body, [
    { id: 'confirm', title: '✅ Confirmar' },
    { id: 'cancel',  title: '❌ Cancelar'  },
  ]);

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
