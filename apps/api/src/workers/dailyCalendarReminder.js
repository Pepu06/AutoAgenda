const cron = require('node-cron');
const { supabase } = require('@autoagenda/db');
const { sendTemplate } = require('../services/whatsapp');
const logger = require('../config/logger');
const { formatTemplateHour } = require('../utils/datetime');
const { appointmentsQueue } = require('./queue');
const { JobName } = require('@autoagenda/shared');

function hasReminderConfig(tenant) {
  const businessName = String(tenant?.business_name || '').trim();
  const messageTemplate = String(tenant?.message_template || '').trim();
  return Boolean(businessName && messageTemplate);
}

function getReminderDateTimeUTC(scheduledAt, timezone, reminderType, reminderTime) {
  const [hh, mm] = (reminderTime || '10:00').split(':').map(Number);
  const appt = new Date(scheduledAt);
  const localDateStr = appt.toLocaleDateString('en-CA', { timeZone: timezone || 'UTC' });
  let [year, month, day] = localDateStr.split('-').map(Number);
  if (reminderType === 'day_before') day -= 1;

  const reminderAsUTC = new Date(Date.UTC(year, month - 1, day, hh, mm, 0));
  const localMs = new Date(reminderAsUTC.toLocaleString('en-US', { timeZone: timezone || 'UTC' })).getTime();
  const utcMs = new Date(reminderAsUTC.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(reminderAsUTC.getTime() + (utcMs - localMs));
}



async function runDailyReminders() {
  logger.info('Running daily calendar reminders...');

  const now = new Date();

  // Pull near-future and recent appointments; we'll pick exact due reminders in code
  const windowStart = new Date(now.getTime() - 26 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();

  const { data: appointments, error } = await supabase
    .from('appointments')
    .select(`
      id,
      tenant_id,
      contact_id,
      service_id,
      scheduled_at,
      status,
      reminder_sent_at,
      google_event_id,
      contact:contacts(name, phone),
      service:services(name),
      tenant:tenants(business_name, message_template, messaging_enabled, timezone, time_format, reminder_type, reminder_time, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, wasender_api_key, location, location_mode)
    `)
    .in('status', ['pending', 'notified', 'confirmed'])
    .is('reminder_sent_at', null)
    .gte('scheduled_at', windowStart)
    .lte('scheduled_at', windowEnd);

  if (error) {
    logger.error({ err: error.message }, 'Failed to fetch appointments for daily reminders');
    return;
  }

  for (const appt of appointments || []) {
    if (!appt?.contact?.phone) continue;
    if (appt?.tenant?.messaging_enabled === false) {
      logger.info({ appointmentId: appt?.id }, 'Skipping daily reminder, messaging disabled');
      continue;
    }
    if (!hasReminderConfig(appt?.tenant)) {
      logger.warn({ appointmentId: appt?.id, tenantId: appt?.tenant_id }, 'Skipping daily recordatorio_turno: missing business_name or message_template');
      continue;
    }

    const tz = appt.tenant?.timezone || 'America/Argentina/Buenos_Aires';
    const timeFormat = appt.tenant?.time_format || '24h';
    const reminderType = appt.tenant?.reminder_type || 'day_before';
    const reminderTime = appt.tenant?.reminder_time || '10:00';

    const target = getReminderDateTimeUTC(appt.scheduled_at, tz, reminderType, reminderTime);
    const deltaMs = Math.abs(now.getTime() - target.getTime());
    if (deltaMs > 60 * 1000) continue;

    const dateObj = new Date(appt.scheduled_at);
    const fechaLabel = dateObj.toLocaleDateString('es-AR', {
      timeZone: tz,
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
    });
    const horaLabel = formatTemplateHour(dateObj, { timeZone: tz, timeFormat });

    const encabezado = (appt.tenant?.business_name || 'AutoAgenda').slice(0, 40);
    const mensajeEditable = (appt.tenant?.message_template || '').replace(/[\n\r\t]/g, ' ').replace(/ {5,}/g, '    ');
    const ubicacion = appt.tenant?.location || '';

    const tenantConfig = {
      provider: appt.tenant?.whatsapp_provider || 'meta',
      whatsappPhoneNumberId: appt.tenant?.whatsapp_phone_number_id,
      whatsappAccessToken: appt.tenant?.whatsapp_access_token,
      wasender_api_key: appt.tenant?.wasender_api_key,
    };

    try {
      await sendTemplate(appt.contact.phone, 'recordatorio_turno', {
        header: [{ name: 'encabezado', value: encabezado }],
        body: [
          { name: 'nombre_cliente',   value: appt.contact.name || 'Cliente' },
          { name: 'mensaje_editable', value: mensajeEditable },
          { name: 'fecha',            value: fechaLabel },
          { name: 'hora',             value: horaLabel },
          { name: 'ubicacion',        value: ubicacion },
        ],
        buttons: [
          { index: 0, payload: `confirm_${appt.id}` },
          { index: 1, payload: `cancel_${appt.id}` },
        ],
      }, tenantConfig);

      await supabase
        .from('appointments')
        .update({ reminder_sent_at: new Date().toISOString(), status: 'pending' })
        .eq('id', appt.id);

      await supabase.from('message_logs').insert({
        tenant_id: appt.tenant_id,
        appointment_id: appt.id,
        type: 'reminder',
        direction: 'outbound',
        status: 'sent',
      });

      appointmentsQueue
        .add(JobName.SEND_FOLLOW_UP, { appointmentId: appt.id }, { delay: 2 * 60 * 60 * 1000 })
        .catch(() => { });

      logger.info({ appointmentId: appt.id }, 'Daily reminder sent via recordatorio_turno');
    } catch (err) {
      logger.warn({ appointmentId: appt.id, err: err.message }, 'Failed to send daily reminder');
    }
  }

  logger.info('Daily calendar reminders done.');
}

function startDailyReminderCron() {
  // Run at minute 0 of every hour; reminders use tenant-configured reminder_time
  cron.schedule('0 * * * *', runDailyReminders, { timezone: 'UTC' });
  logger.info('Daily calendar reminder cron scheduled (hourly)');
}

module.exports = { startDailyReminderCron, runDailyReminders };
