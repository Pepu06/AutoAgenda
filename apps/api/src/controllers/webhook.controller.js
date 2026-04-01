const { supabase } = require('@recordai/db');
const { getCalendarEvent, updateEventTitleAndColor, refreshAccessToken } = require('../services/google');
const { sendTemplate } = require('../services/whatsapp');
const env = require('../config/env');
const logger = require('../config/logger');

function verify(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('WhatsApp webhook verified');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

async function receive(req, res) {
  try {
    const body = req.body;
    logger.info({ object: body?.object }, '[Webhook] Incoming payload');

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value.messages) continue;

        for (const message of value.messages) {
          await processMessage(message, value.metadata);
        }
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    logger.error({ err }, 'Webhook processing error');
    return res.sendStatus(200); // Always 200 to Meta
  }
}

function parseIntent(text) {
  if (!text) return null;
  const t = text.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (t === 'confirm' || t === '1' || t === 'confirmar' || t === 'si' || t === 'sí') return 'confirm';
  if (t === 'cancel' || t === '2' || t === 'cancelar' || t === 'no') return 'cancel';
  return null;
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

async function findPendingAppointmentByPhone(phone) {
  const phoneDigits = onlyDigits(phone);
  const phoneLast10 = phoneDigits.slice(-10);

  // Match contacts by last 10 digits to avoid format issues (+54, 549, spaces, etc.)
  const { data: contacts, error: contactsError } = await supabase
    .from('contacts')
    .select('id, phone')
    .ilike('phone', `%${phoneLast10}`)
    .limit(50);

  console.log(contacts);
  if (contactsError) throw contactsError;

  if (!contacts?.length) return null;

  const matchedContact = contacts.find((c) => onlyDigits(c.phone).endsWith(phoneLast10));
  if (!matchedContact) return null;

  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .select('id, tenant_id, google_event_id, user_id, contact_id')
    .eq('contact_id', matchedContact.id)
    .in('status', ['pending', 'confirmed', 'cancelled']) // Consider all non-final statuses
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (appointmentError) throw appointmentError;

  return appointment || null;
}

async function processMessage(message, _metadata) {
  const from = message.from;
  let rawText = null;

  if (message.type === 'interactive' && message.interactive?.button_reply) {
    rawText = message.interactive.button_reply.id
      || message.interactive.button_reply.title
      || null;
  } else if (message.type === 'button') {
    rawText = message.button?.payload
      || message.button?.text
      || null;
  } else if (message.type === 'text') {
    rawText = message.text?.body?.trim();
  }

  logger.info({ from, type: message.type, rawText }, '[Webhook] Parsed inbound message');

  if (!rawText) {
    logger.info({ from, type: message.type }, '[Webhook] Ignored message without text/button payload');
    return;
  }

  const intent = parseIntent(rawText);
  if (!intent) {
    logger.info({ from, rawText }, '[Webhook] Ignored message without valid intent');
    return;
  }

  // Meta sends phone without '+'; DB stores E.164 with '+'
  const phone = from.startsWith('+') ? from : `+${from}`;
  logger.info({ phone, intent }, '[Webhook] Processing intent');

  const appointment = await findPendingAppointmentByPhone(phone);
  if (!appointment) {
    logger.warn({ phone }, '[Webhook] Contact not found');
    return;
  }
  const newStatus = intent === 'confirm' ? 'confirmed' : 'cancelled';

  // Update appointment status in DB
  const { error: updateError } = await supabase
    .from('appointments')
    .update({ status: newStatus })
    .eq('id', appointment.id);
  if (updateError) throw updateError;

  const { error: logError } = await supabase
    .from('message_logs')
    .insert({
      tenant_id: appointment.tenant_id,
      appointment_id: appointment.id,
      type: 'reply',
      direction: 'inbound',
      status: 'delivered',
      wa_message_id: message.id,
    });
  if (logError) throw logError;

  logger.info({ appointmentId: appointment.id, status: newStatus }, 'Appointment status updated via WhatsApp');

  // Notify admin on cancellation (best effort)
  if (newStatus === 'cancelled') {
    try {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('admin_whatsapp, admin_alerts_enabled, admin_cancel_template, timezone')
        .eq('id', appointment.tenant_id)
        .single();

      if (tenant?.admin_alerts_enabled && tenant?.admin_whatsapp) {
        const { data: fullAppt } = await supabase
          .from('appointments')
          .select('scheduled_at, contact:contacts(name, phone), service:services(name)')
          .eq('id', appointment.id)
          .single();

        const tz = tenant.timezone || 'America/Argentina/Buenos_Aires';
        const apptDate = new Date(fullAppt.scheduled_at);
        const dateStr = apptDate.toLocaleDateString('es-AR', { timeZone: tz, weekday: 'long', day: '2-digit', month: '2-digit' });
        const timeStr = apptDate.toLocaleTimeString('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });

        // Strip +549 prefix so template can prepend it: "+549{{2}}"
        const rawPhone = fullAppt.contact.phone.replace(/^\+?549?/, '');

        const templateName = tenant.admin_cancel_template || env.WHATSAPP_TEMPLATE_CANCEL_ALERT;
        const adminNumbers = tenant.admin_whatsapp.split(',').map(n => n.trim()).filter(Boolean);

        for (const adminPhone of adminNumbers) {
          await sendTemplate(adminPhone, templateName, [
            fullAppt.contact.name,
            rawPhone,
            dateStr,
            timeStr,
            fullAppt.service.name,
          ]).catch(() => {});
        }

        logger.info({ appointmentId: appointment.id, adminNumbers }, 'Admin cancellation alert sent');
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to send admin cancellation alert');
    }
  }

  // Update Google Calendar event (best effort)
  try {
    const { data: apptData } = await supabase
      .from('appointments')
      .select('google_event_id, user_id')
      .eq('id', appointment.id)
      .single();

    if (!apptData?.google_event_id || !apptData?.user_id) return;

    const { data: userData } = await supabase
      .from('users')
      .select('google_access_token, google_refresh_token')
      .eq('id', apptData.user_id)
      .single();

    if (!userData?.google_access_token) return;

    let accessToken = userData.google_access_token;

    const event = await getCalendarEvent(accessToken, apptData.google_event_id);
    if (!event && userData.google_refresh_token) {
      // Token expired — refresh and retry
      accessToken = await refreshAccessToken(userData.google_refresh_token);
      await supabase.from('users').update({ google_access_token: accessToken }).eq('id', apptData.user_id);
    }

    const calEvent = event || await getCalendarEvent(accessToken, apptData.google_event_id);
    if (!calEvent) return;

    const STATUS_SUFFIX = { confirmed: 'CONFIRMADO', cancelled: 'CANCELADO' };
    const baseTitle = (calEvent.summary || '').replace(/\s*-\s*(CONFIRMADO|CANCELADO)$/i, '').trim();
    const newTitle = `${baseTitle} - ${STATUS_SUFFIX[newStatus]}`;

    await updateEventTitleAndColor(accessToken, apptData.google_event_id, newTitle, newStatus, {
      sendUpdates: 'none',
    });

    logger.info({ appointmentId: appointment.id, googleEventId: apptData.google_event_id }, 'Calendar updated from webhook');
  } catch (err) {
    logger.warn({ err }, 'Failed to update Calendar from webhook');
  }
}

module.exports = { verify, receive };
