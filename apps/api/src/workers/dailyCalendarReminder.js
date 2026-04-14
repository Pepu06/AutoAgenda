const cron = require('node-cron');
const { supabase } = require('@autoagenda/db');
const { sendTemplate } = require('../services/whatsapp');
const { getCalendarEvent } = require('../services/google');
const { getValidToken } = require('../controllers/calendar.controller');
const logger = require('../config/logger');
const { formatTemplateHour } = require('../utils/datetime');
const { appointmentsQueue } = require('./queue');
const { trackMessageSent } = require('./usageTracking');
const { checkUsageLimit } = require('../middleware/checkUsage');
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



// Cache owner tokens per tenant per cron run to avoid redundant DB/API calls
async function getOwnerTokenForTenant(tenantId, cache) {
  if (cache.has(tenantId)) return cache.get(tenantId);

  const { data: owner } = await supabase
    .from('users')
    .select('id, default_google_calendar_id')
    .eq('tenant_id', tenantId)
    .eq('role', 'owner')
    .maybeSingle();

  if (!owner) { cache.set(tenantId, null); return null; }

  const accessToken = await getValidToken(owner.id);
  const result = accessToken
    ? { accessToken, calendarId: owner.default_google_calendar_id || 'primary' }
    : null;
  cache.set(tenantId, result);
  return result;
}

/**
 * Syncs scheduled_at for all future appointments that have a google_event_id.
 * Runs before the reminder loop so rescheduled events get their date updated
 * before the reminder timing check happens.
 */
async function syncGCalDates(ownerTokenCache) {
  const now = new Date();

  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('id, tenant_id, scheduled_at, google_event_id')
    .not('google_event_id', 'is', null)
    .is('reminder_sent_at', null)
    .in('status', ['pending', 'notified', 'sin_enviar'])
    .gte('scheduled_at', now.toISOString());

  if (error) {
    logger.error({ err: error.message }, 'syncGCalDates: failed to fetch appointments');
    return;
  }

  for (const appt of appointments || []) {
    const ownerData = await getOwnerTokenForTenant(appt.tenant_id, ownerTokenCache);
    if (!ownerData) continue;

    let gcalEvent;
    try {
      gcalEvent = await getCalendarEvent(ownerData.accessToken, appt.google_event_id, ownerData.calendarId);
    } catch {
      continue; // skip on API error, don't block reminder loop
    }

    // Only mark cancelled if status is explicitly 'cancelled' in Google Calendar
    // Don't touch DB if event not found or API failed
    if (!gcalEvent) {
      continue;
    }

    if (gcalEvent.status === 'cancelled') {
      await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appt.id);
      logger.info({ appointmentId: appt.id }, 'syncGCalDates: event cancelled in GCal, appointment marked cancelled');
      continue;
    }

    const gcalStart = gcalEvent.start?.dateTime || gcalEvent.start?.date;
    if (!gcalStart) continue;

    const gcalMs = new Date(gcalStart).getTime();
    const dbMs = new Date(appt.scheduled_at).getTime();
    if (Math.abs(gcalMs - dbMs) > 60_000) {
      await supabase.from('appointments')
        .update({ scheduled_at: new Date(gcalStart).toISOString() })
        .eq('id', appt.id);
      logger.info({ appointmentId: appt.id, oldDate: appt.scheduled_at, newDate: gcalStart }, 'syncGCalDates: scheduled_at updated from GCal');
    }
  }
}

async function runDailyReminders() {
  logger.info('Running daily calendar reminders...');

  const now = new Date();
  const ownerTokenCache = new Map();

  await syncGCalDates(ownerTokenCache);

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
    .in('status', ['pending', 'notified', 'sin_enviar'])
    .is('reminder_sent_at', null)
    .gte('scheduled_at', windowStart)
    .lte('scheduled_at', windowEnd);

  if (error) {
    logger.error({ err: error.message }, 'Failed to fetch appointments for daily reminders');
    return;
  }

  for (const appt of appointments || []) {
    if (!appt?.contact?.phone) continue;
    if (appt?.tenant?.messaging_enabled !== true) {
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
      const usageCheck = await checkUsageLimit(appt.tenant_id);
      if (!usageCheck.allowed) {
        logger.warn({
          appointmentId: appt.id,
          tenantId: appt.tenant_id,
          reason: usageCheck.reason,
          current: usageCheck.current,
          limit: usageCheck.limit,
        }, 'Skipping daily reminder, usage limit reached');
        continue;
      }

      // Final GCal check just before sending: catch cancellations that happened
      // after syncGCalDates ran at the top of this cron tick.
      if (appt.google_event_id) {
        const ownerData = await getOwnerTokenForTenant(appt.tenant_id, ownerTokenCache);
        if (ownerData) {
          let gcalEvent;
          try { gcalEvent = await getCalendarEvent(ownerData.accessToken, appt.google_event_id, ownerData.calendarId); } catch { /* skip */ }
          // Only skip if event is explicitly cancelled; don't mark as cancelled if not found
          if (gcalEvent && gcalEvent.status === 'cancelled') {
            await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appt.id);
            logger.info({ appointmentId: appt.id }, 'Reminder skipped: GCal event cancelled');
            continue;
          }
        }
      }

      // Calculate date/time labels after sync so they reflect any same-day time update
      const dateObj = new Date(appt.scheduled_at);
      const fechaLabel = dateObj.toLocaleDateString('es-AR', {
        timeZone: tz,
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
      });
      const horaLabel = formatTemplateHour(dateObj, { timeZone: tz, timeFormat });

      // Claim atomically first — only succeeds if reminder_sent_at is still null
      // This prevents duplicate sends when multiple instances run in parallel
      const reminderTime = new Date().toISOString();
      const { data: claimed } = await supabase
        .from('appointments')
        .update({ reminder_sent_at: reminderTime, status: 'pending' })
        .eq('id', appt.id)
        .is('reminder_sent_at', null)
        .select('id');

      if (!claimed || claimed.length === 0) {
        logger.info({ appointmentId: appt.id }, 'Reminder already claimed by another instance, skipping');
        continue;
      }

      // Now send the reminder
      const whatsappResponse = await sendTemplate(appt.contact.phone, 'recordatorio_turno', {
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

      const waMessageId = whatsappResponse?.messages?.[0]?.id || null;

      await trackMessageSent(appt.tenant_id, 'reminder');

      await supabase.from('message_logs').insert({
        tenant_id: appt.tenant_id,
        appointment_id: appt.id,
        type: 'reminder',
        direction: 'outbound',
        status: 'sent',
        wa_message_id: waMessageId,
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
