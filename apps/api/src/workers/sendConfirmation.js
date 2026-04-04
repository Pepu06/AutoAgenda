const { supabase } = require('@recordai/db');
const { sendTemplate } = require('../services/whatsapp');
const { getCalendarEvent, refreshAccessToken } = require('../services/google');
const logger = require('../config/logger');
const { formatTime } = require('../utils/datetime');

async function sendConfirmation({ appointmentId }) {
  const { data: appointment } = await supabase
    .from('appointments')
    .select('*, contact:contacts(name, phone), service:services(name), tenant:tenants(timezone, time_format, business_name, reminder_type, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, wasender_api_key, location, location_mode)')
    .eq('id', appointmentId)
    .maybeSingle();

  if (!appointment) {
    logger.warn({ appointmentId }, 'Appointment not found for confirmation');
    return;
  }

  if (appointment.status !== 'sin_enviar') {
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

  // Resolver ubicación según location_mode
  let ubicacion = appointment.tenant?.location || '';
  if (appointment.tenant?.location_mode === 'calendar' && appointment.google_event_id && appointment.user_id) {
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('google_access_token, google_refresh_token')
        .eq('id', appointment.user_id)
        .single();

      if (userData?.google_access_token || userData?.google_refresh_token) {
        let accessToken = userData.google_access_token;
        if (userData.google_refresh_token) {
          try {
            accessToken = await refreshAccessToken(userData.google_refresh_token);
            await supabase.from('users').update({ google_access_token: accessToken }).eq('id', appointment.user_id);
          } catch { /* usar el token existente */ }
        }
        const event = await getCalendarEvent(accessToken, appointment.google_event_id);
        if (event?.location) ubicacion = event.location;
      }
    } catch (err) {
      logger.warn({ appointmentId, err: err.message }, 'Could not fetch calendar event location for confirmation');
    }
  }

  // Configuración del proveedor de WhatsApp
  const tenantConfig = {
    provider: appointment.tenant?.whatsapp_provider || 'meta',
    whatsappPhoneNumberId: appointment.tenant?.whatsapp_phone_number_id,
    whatsappAccessToken: appointment.tenant?.whatsapp_access_token,
    wasender_api_key: appointment.tenant?.wasender_api_key,
  };
  
  await sendTemplate(appointment.contact.phone, 'confirmacion_turno', {
    body: [
      appointment.contact.name,              // {{1}} nombre del paciente
      recordatorioTexto,                     // {{2}} cuando se manda recordatorio
      diaLabel,                              // {{3}} día de la cita
      horaLabel,                             // {{4}} hora de la cita
      appointment.service.name,              // {{5}} servicio
      appointment.tenant?.business_name || '',     // {{6}} nombre del negocio
      ubicacion,                                   // {{7}} ubicación
    ],
  }, tenantConfig);

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
