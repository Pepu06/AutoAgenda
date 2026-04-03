const { supabase } = require('@recordai/db');
const { sendTemplate } = require('../services/whatsapp');
const logger = require('../config/logger');
const { formatTime } = require('../utils/datetime');

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

  if (appointment.status === 'notified') {
    logger.info({ appointmentId, status: appointment.status }, 'Skipping confirmation, already processed');
    return;
  }

  const tz = appointment.tenant?.timezone || 'America/Argentina/Buenos_Aires';
  const dateObj = new Date(appointment.scheduled_at);
  
  // Formato día: "viernes, 3 de abril de 2026"
  const diaLabel = dateObj.toLocaleDateString('es-AR', {
    timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  
  // Formato hora: "10:00"
  const horaLabel = formatTime(dateObj, { timeZone: tz, timeFormat: appointment.tenant?.time_format });

  // Determinar texto del recordatorio basado en reminder_type
  const reminderType = appointment.tenant?.reminder_type || 'day_before';
  const recordatorioTexto = reminderType === 'same_day' ? 'el mismo día' : 'el día anterior';

  
  await sendTemplate(appointment.contact.phone, 'confirmacion_turno', {
    body: [
      appointment.contact.name,        // {{1}} nombre del paciente
      recordatorioTexto,               // {{2}} cuando se manda recordatorio
      diaLabel,                        // {{3}} día de la cita
      horaLabel,                       // {{4}} hora de la cita
      appointment.service.name,        // {{5}} servicio
    ],
  });

  const { error: updateError } = await supabase
    .from('appointments')
    .update({
      confirmation_sent_at: new Date().toISOString(),
      status: 'notified',
    })
    .eq('id', appointmentId)
    .eq('tenant_id', appointment.tenant_id);

  if (updateError) {
    logger.error({ appointmentId, updateError }, 'Failed to mark appointment as notified after confirmation');
    throw updateError;
  }

  const { error: logError } = await supabase.from('message_logs').insert({
    tenant_id:      appointment.tenant_id,
    appointment_id: appointmentId,
    type:           'confirmation',
    direction:      'outbound',
    status:         'sent',
  });

  if (logError) {
    logger.error({ appointmentId, logError }, 'Failed to insert confirmation message log');
    throw logError;
  }

  logger.info({ appointmentId }, 'Confirmation sent via confirmacion_turno template, status changed to notified');
}

module.exports = { sendConfirmation };
