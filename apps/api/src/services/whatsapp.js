const axios = require('axios');
const logger = require('../config/logger');
const env = require('../config/env');

const MESSAGES_URL = `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

async function sendTextMessage(phone, text) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:   phone,
    type: 'text',
    text: { body: text },
  };

  const response = await axios.post(MESSAGES_URL, payload, {
    headers: {
      Authorization:  `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  const messageId = response.data.messages?.[0]?.id;
  logger.info({ phone, messageId }, '[WhatsApp] Mensaje enviado');
  return response.data;
}

async function sendInteractiveButtons(phone, body, buttons) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:   phone,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: buttons.map((btn) => ({
          type: 'reply',
          reply: { id: btn.id, title: btn.title },
        })),
      },
    },
  };

  const response = await axios.post(MESSAGES_URL, payload, {
    headers: {
      Authorization:  `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  const messageId = response.data.messages?.[0]?.id;
  logger.info({ phone, messageId }, '[WhatsApp] Interactive enviado');
  return response.data;
}

// Builds a single component parameter.
// Accepts either a plain value or { name, value } for named params (required by API v25+).
function toParam(p) {
  if (p !== null && typeof p === 'object' && 'value' in p) {
    return { type: 'text', parameter_name: p.name, text: String(p.value) };
  }
  return { type: 'text', text: String(p) };
}

async function sendTemplate(phone, templateName, params = []) {
  let headerParams = [];
  let bodyParams = [];

  // - Array        => body params only (backward compat)
  // - { header, body } => separate header and body params
  let buttonParams = [];

  if (Array.isArray(params)) {
    bodyParams = params;
  } else {
    headerParams = params?.header  || [];
    bodyParams   = params?.body    || [];
    buttonParams = params?.buttons || [];
  }

  const components = [];
  if (headerParams.length) {
    components.push({ type: 'header', parameters: headerParams.map(toParam) });
  }
  if (bodyParams.length) {
    components.push({ type: 'body', parameters: bodyParams.map(toParam) });
  }
  // Quick-reply buttons with custom payload (embeds appointmentId)
  for (const btn of buttonParams) {
    components.push({
      type:       'button',
      sub_type:   'quick_reply',
      index:      String(btn.index),
      parameters: [{ type: 'payload', payload: btn.payload }],
    });
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to: phone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en', policy: 'deterministic' },
      components,
    },
  };

  const response = await axios.post(MESSAGES_URL, payload, {
    headers: {
      Authorization:  `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  const messageId = response.data.messages?.[0]?.id;
  logger.info({ phone, templateName, messageId }, '[WhatsApp] Template enviado');
  return response.data;
}

module.exports = { sendTextMessage, sendInteractiveButtons, sendTemplate };
