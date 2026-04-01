const { prisma, supabase } = require('@recordai/db');
const { getCalendarEvent, updateEventTitleAndColor, refreshAccessToken } = require('../services/google');
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

    if (body.object !== 'whatsapp_business_account') {
      return res.sendStatus(404);
    }

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

async function processMessage(message, _metadata) {
  const from = message.from;
  let rawText = null;

  if (message.type === 'interactive' && message.interactive?.button_reply) {
    rawText = message.interactive.button_reply.id;
  } else if (message.type === 'text') {
    rawText = message.text?.body?.trim();
  }

  const intent = parseIntent(rawText);
  if (!intent) return;

  // Meta sends phone without '+'; DB stores E.164 with '+'
  const phone = from.startsWith('+') ? from : `+${from}`;

  logger.info({ phone, intent }, '[Webhook] Processing intent');

  // Find contact by phone
  const contact = await prisma.contact.findFirst({
    where: { phone },
    include: {
      appointments: {
        where: { status: 'pending' },
        orderBy: { scheduledAt: 'asc' },
        take: 1,
        include: { tenant: true },
      },
    },
  });

  if (!contact) {
    logger.warn({ phone }, '[Webhook] Contact not found');
    return;
  }
  if (contact.appointments.length === 0) {
    logger.warn({ phone, contactId: contact.id }, '[Webhook] No pending appointments for contact');
    return;
  }

  const appointment = contact.appointments[0];
  const newStatus = intent === 'confirm' ? 'confirmed' : 'cancelled';

  // Update appointment status in DB
  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: newStatus },
  });

  await prisma.messageLog.create({
    data: {
      tenantId:      appointment.tenantId,
      appointmentId: appointment.id,
      type:          'reply',
      direction:     'inbound',
      status:        'delivered',
      waMessageId:   message.id,
    },
  });

  logger.info({ appointmentId: appointment.id, status: newStatus }, 'Appointment status updated via WhatsApp');

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
