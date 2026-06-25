const { supabase } = require('@autoagenda/db');
const { getCalendarEvent, updateEventTitleAndColor, refreshAccessToken } = require('../services/google');
const { runCalendarSync } = require('./calendar.controller');
const { sendMessage } = require('../services/whatsapp');
const { getSubscriptionStatus } = require('../services/mercadopago');
const env = require('../config/env');
const logger = require('../config/logger');
const { formatTime } = require('../utils/datetime');
const crypto = require('crypto');

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

function validSignature(req) {
  // Verify Meta's X-Hub-Signature-256 over the raw request body.
  if (!env.META_APP_SECRET) return false;
  const header = req.get('x-hub-signature-256') || '';
  const expected = 'sha256=' + crypto
    .createHmac('sha256', env.META_APP_SECRET)
    .update(req.rawBody || Buffer.from(''))
    .digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function receive(req, res) {
  try {
    if (!validSignature(req)) {
      logger.warn('whatsapp_webhook_bad_signature');
      return res.sendStatus(403);
    }
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

  // Button payload must embed appointmentId: "confirm_<uuid>" / "cancel_<uuid>"
  const embedMatch = rawText.match(/^(confirm|cancel)_([0-9a-f-]{36})$/i);
  if (!embedMatch) {
    logger.info({ from, rawText }, '[Webhook] Ignored message without embedded appointmentId');
    return;
  }

  rawText = embedMatch[1];
  const directAppointmentId = embedMatch[2];

  const intent = parseIntent(rawText);
  if (!intent) {
    logger.info({ from, rawText }, '[Webhook] Ignored message without valid intent');
    return;
  }

  logger.info({ from, intent, directAppointmentId }, '[Webhook] Processing intent');

  const { data: appointment } = await supabase
    .from('appointments')
    .select('id, tenant_id, google_event_id, user_id, contact_id')
    .eq('id', directAppointmentId)
    .maybeSingle();

  if (!appointment) {
    logger.warn({ directAppointmentId }, '[Webhook] Appointment not found');
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

  // Send reply message to client (best effort)
  try {
    const { data: replyTenant } = await supabase
      .from('tenants')
      .select('confirm_reply_message, cancel_reply_message')
      .eq('id', appointment.tenant_id)
      .single();

    const DEFAULT_CONFIRM = '¡Listo! Tu turno quedó confirmado. Te esperamos.';
    const DEFAULT_CANCEL  = 'Recibimos tu cancelación. Si querés reprogramar, respondé a este mensaje.';

    const replyText = newStatus === 'confirmed'
      ? (replyTenant?.confirm_reply_message || DEFAULT_CONFIRM)
      : (replyTenant?.cancel_reply_message  || DEFAULT_CANCEL);

    const clientPhone = from.startsWith('+') ? from : `+${from}`;
    await sendMessage(appointment.tenant_id, clientPhone, replyText);
    logger.info({ appointmentId: appointment.id, newStatus }, 'Reply message sent to client');
  } catch (err) {
    logger.warn({ err }, 'Failed to send reply message to client');
  }

  // Notify admin on cancellation (best effort)
  if (newStatus === 'cancelled') {
    try {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('admin_whatsapp, admin_alerts_enabled, timezone, time_format')
        .eq('id', appointment.tenant_id)
        .single();

      if (tenant?.admin_whatsapp) {
        const { data: fullAppt } = await supabase
          .from('appointments')
          .select('scheduled_at, contact:contacts(name, phone), service:services(name)')
          .eq('id', appointment.id)
          .single();

        const tz = tenant.timezone || 'America/Argentina/Buenos_Aires';
        const apptDate = new Date(fullAppt.scheduled_at);
        const dateStr = apptDate.toLocaleDateString('es-AR', { timeZone: tz, weekday: 'long', day: '2-digit', month: '2-digit' });
        const timeStr = formatTime(apptDate, { timeZone: tz, timeFormat: tenant.time_format });

        const cancelText = `❌ *Cancelación de turno*\n\n👤 ${fullAppt.contact.name}\n📞 ${fullAppt.contact.phone}\n📅 ${dateStr} a las ${timeStr}\n💼 ${fullAppt.service.name}`;

        const adminNumbers = tenant.admin_whatsapp.split(',').map(n => n.trim()).filter(Boolean);
        for (const adminPhone of adminNumbers) {
          await sendMessage(appointment.tenant_id, adminPhone, cancelText).catch(() => {});
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

    if (!userData?.google_access_token && !userData?.google_refresh_token) return;

    let accessToken = userData.google_access_token;

    // Always refresh if we have a refresh token — access tokens expire in 1h
    if (userData.google_refresh_token) {
      try {
        accessToken = await refreshAccessToken(userData.google_refresh_token);
        await supabase.from('users').update({ google_access_token: accessToken }).eq('id', apptData.user_id);
      } catch (refreshErr) {
        logger.warn({ refreshErr }, 'Failed to refresh Google token, using stored access token');
      }
    }

    const calEvent = await getCalendarEvent(accessToken, apptData.google_event_id);
    if (!calEvent) {
      logger.warn({ appointmentId: appointment.id, googleEventId: apptData.google_event_id }, 'Calendar event not found for status update');
      return;
    }

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

/**
 * Handle Mercado Pago webhook notifications
 * POST /api/webhook/mercadopago
 */
async function handleMercadoPagoWebhook(req, res) {
  try {
    const signature = req.headers['x-signature'];
    const requestId = req.headers['x-request-id'];
    
    // Verify webhook signature if secret is configured
    if (env.MERCADOPAGO_WEBHOOK_SECRET && signature) {
      const parts = signature.split(',');
      const ts = parts.find(p => p.startsWith('ts='))?.split('=')[1];
      const hash = parts.find(p => p.startsWith('v1='))?.split('=')[1];
      
      if (ts && hash) {
        const manifest = `id:${requestId};request-id:${requestId};ts:${ts};`;
        const hmac = crypto.createHmac('sha256', env.MERCADOPAGO_WEBHOOK_SECRET);
        hmac.update(manifest);
        const expectedHash = hmac.digest('hex');
        
        if (hash !== expectedHash) {
          logger.warn({ requestId }, '[MP Webhook] Invalid signature');
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }
    }

    const { type, data, action } = req.body;
    
    logger.info({ type, action, dataId: data?.id }, '[MP Webhook] Received notification');

    // Handle different event types
    if (type === 'payment') {
      await handlePaymentEvent(data.id, action);
    } else if (type === 'subscription_preapproval') {
      await handleSubscriptionEvent(data.id, action);
    } else if (type === 'subscription_authorized_payment') {
      await handleAuthorizedPaymentEvent(data.id, action);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error({ error: error.message }, '[MP Webhook] Error processing webhook');
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Handle payment events from Mercado Pago
 */
async function handlePaymentEvent(paymentId, action) {
  logger.info({ paymentId, action }, '[MP Webhook] Processing payment event');

  // For now, we'll handle this when we get subscription events
  // Payments are tied to subscriptions, so we process them together
}

/**
 * Handle subscription events (preapproval)
 */
async function handleSubscriptionEvent(preapprovalId, action) {
  logger.info({ preapprovalId, action }, '[MP Webhook] Processing subscription event');

  try {
    // Fetch subscription details from Mercado Pago
    const mpSubscription = await getSubscriptionStatus(preapprovalId);
    
    // Find subscription in our database
    const { data: subscription, error: fetchError } = await supabase
      .from('subscriptions')
      .select('id, tenant_id')
      .eq('mp_subscription_id', preapprovalId)
      .maybeSingle();

    if (fetchError) {
      logger.error({ error: fetchError.message, preapprovalId }, '[MP Webhook] Error fetching subscription');
      return;
    }

    if (!subscription) {
      logger.warn({ preapprovalId }, '[MP Webhook] Subscription not found in database');
      return;
    }

    // Map MP status to our status
    const statusMap = {
      'authorized': 'active',
      'paused': 'cancelled',
      'cancelled': 'cancelled',
      'pending': 'active', // Keep active while payment is processing
    };

    const newStatus = statusMap[mpSubscription.status] || 'active';
    
    // Update subscription status
    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('mp_subscription_id', preapprovalId);

    if (updateError) {
      logger.error({ error: updateError.message, preapprovalId }, '[MP Webhook] Error updating subscription');
      return;
    }

    logger.info({ 
      preapprovalId, 
      tenantId: subscription.tenant_id, 
      status: newStatus 
    }, '[MP Webhook] Subscription updated');

  } catch (error) {
    logger.error({ error: error.message, preapprovalId }, '[MP Webhook] Error processing subscription event');
  }
}

/**
 * Handle authorized payment events (monthly charges)
 */
async function handleAuthorizedPaymentEvent(paymentId, action) {
  logger.info({ paymentId, action }, '[MP Webhook] Processing authorized payment event');

  // When a monthly payment is successful, reset the message counter
  // and extend the current period
  
  try {
    // Get payment details to find associated subscription
    // Note: In production, you'd call MP API to get payment details
    // For now, we'll handle period updates based on subscription events
    
    logger.info({ paymentId }, '[MP Webhook] Authorized payment processed');
  } catch (error) {
    logger.error({ error: error.message, paymentId }, '[MP Webhook] Error processing payment');
  }
}

async function handleGoogleCalendarWebhook(req, res) {
  // Always return 200 immediately — Google retries if it doesn't get 200
  res.sendStatus(200);

  const channelId = req.headers['x-goog-channel-id'];
  const resourceState = req.headers['x-goog-resource-state'];

  // 'sync' = initial ping after watch() registration, nothing to process
  if (!channelId || resourceState === 'sync') return;

  try {
    const { data: user } = await supabase
      .from('users')
      .select('id, tenant_id')
      .eq('google_channel_id', channelId)
      .maybeSingle();

    if (!user) {
      logger.warn({ channelId }, '[GCal Webhook] Unknown channel ID, ignoring');
      return;
    }

    logger.info({ userId: user.id, tenantId: user.tenant_id }, '[GCal Webhook] Triggering calendar sync');
    const result = await runCalendarSync(user.id, user.tenant_id);
    logger.info({ ...result, userId: user.id }, '[GCal Webhook] Sync complete');
  } catch (err) {
    logger.error({ err, channelId }, '[GCal Webhook] Sync failed');
  }
}

module.exports = { verify, receive, handleMercadoPagoWebhook, handleGoogleCalendarWebhook };
