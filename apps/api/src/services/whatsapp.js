const axios = require('axios');
const logger = require('../config/logger');
const env = require('../config/env');

const META_MESSAGES_URL = `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
const WASENDER_API_URL = 'https://wasenderapi.com/api/send-message';

/**
 * Send a message using the configured provider
 * @param {string} phone - Phone number
 * @param {string} text - Message text
 * @param {object} tenantConfig - Tenant configuration { provider, whatsappPhoneNumberId, whatsappAccessToken, wasender_api_key }
 */
async function sendTextMessage(phone, text, tenantConfig = {}) {
  const provider = tenantConfig.provider || 'meta';

  if (provider === 'wasender') {
    return sendWasenderMessage(phone, text, tenantConfig.wasender_api_key);
  }
  
  return sendMetaTextMessage(phone, text, tenantConfig);
}

async function sendWasenderMessage(phone, text, token) {
  // Wasender rate limit: 1 message per 5 seconds
  await new Promise(resolve => setTimeout(resolve, 5000));

  try {
    const response = await axios.post(WASENDER_API_URL, {
      to: phone,
      text: text
    }, {
      headers: {
        'Authorization': `Bearer ${token || env.WASENDER_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info({ phone }, '[WasenderAPI] Mensaje enviado');
    return response.data;
  } catch (error) {
    logger.error({ phone, error: error.response?.data || error.message }, '[WasenderAPI] Error enviando mensaje');
    throw error;
  }
}

async function sendMetaTextMessage(phone, text, tenantConfig = {}) {
  const phoneNumberId = tenantConfig.whatsappPhoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = tenantConfig.whatsappAccessToken || env.WHATSAPP_ACCESS_TOKEN;
  const messagesUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:   phone,
    type: 'text',
    text: { body: text },
  };

  const response = await axios.post(messagesUrl, payload, {
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const messageId = response.data.messages?.[0]?.id;
  logger.info({ phone, messageId }, '[Meta WhatsApp] Mensaje enviado');
  return response.data;
}

async function sendInteractiveButtons(phone, body, buttons, tenantConfig = {}) {
  const provider = tenantConfig.provider || 'meta';
  
  // Wasender doesn't support interactive buttons, fall back to text
  if (provider === 'wasender') {
    const buttonsText = buttons.map((btn, i) => `${i + 1}. ${btn.title}`).join('\n');
    const fullText = `${body}\n\n${buttonsText}`;
    return sendWasenderMessage(phone, fullText, tenantConfig.wasender_api_key);
  }

  const phoneNumberId = tenantConfig.whatsappPhoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = tenantConfig.whatsappAccessToken || env.WHATSAPP_ACCESS_TOKEN;
  const messagesUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

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

  const response = await axios.post(messagesUrl, payload, {
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const messageId = response.data.messages?.[0]?.id;
  logger.info({ phone, messageId }, '[Meta WhatsApp] Interactive enviado');
  return response.data;
}

// Builds a single component parameter.
// Accepts either a plain value or { name, value } for named params (required by API v25+).
function normalizeTemplateText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n');
}

function toParam(p) {
  if (p !== null && typeof p === 'object' && 'value' in p) {
    return { type: 'text', parameter_name: p.name, text: normalizeTemplateText(p.value) };
  }
  return { type: 'text', text: normalizeTemplateText(p) };
}

async function sendTemplate(phone, templateName, params = [], tenantConfig = {}) {
  const provider = tenantConfig.provider || 'meta';
  
  // Wasender doesn't use templates, convert to plain text + append confirmation link if available
  if (provider === 'wasender') {
    let text = buildTemplateText(templateName, params);
    // If buttons contain an appointmentId payload, append a confirmation link
    const buttons = Array.isArray(params) ? [] : (params?.buttons || []);
    const confirmBtn = buttons.find(b => b.payload?.startsWith('confirm_'));
    if (confirmBtn) {
      const appointmentId = confirmBtn.payload.replace('confirm_', '');
      const baseUrl = env.BASE_URL || 'http://localhost:3001';
      text += `\n\n👉 Confirmá o cancelá tu turno aquí:\n${baseUrl}/c/${appointmentId}`;
    }
    return sendWasenderMessage(phone, text, tenantConfig.wasender_api_key);
  }

  const phoneNumberId = tenantConfig.whatsappPhoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = tenantConfig.whatsappAccessToken || env.WHATSAPP_ACCESS_TOKEN;
  const messagesUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

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

  const response = await axios.post(messagesUrl, payload, {
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const messageId = response.data.messages?.[0]?.id;
  logger.info({ phone, templateName, messageId }, '[Meta WhatsApp] Template enviado');
  return response.data;
}

/**
 * Build plain text from template params for Wasender
 */
function buildTemplateText(templateName, params) {
  const rawBody = Array.isArray(params) ? params : (params?.body || []);
  // Normalize named params ({ name, value }) to plain strings
  const bodyParams = rawBody.map(p => (p !== null && typeof p === 'object' && 'value' in p ? p.value : p));

  // Map common templates to text format
  if (templateName === 'admin_cancelacion') {
    const [name, phone, date, time, service] = bodyParams;
    return `🚫 Cancelación de turno\n\nCliente: ${name}\nTeléfono: ${phone}\nFecha: ${date}\nHora: ${time}\nServicio: ${service}`;
  }

  if (templateName === 'recordatorio_turno') {
    // Named body params: nombre_cliente, mensaje_editable, fecha, hora
    const body = Array.isArray(params) ? {} : Object.fromEntries(
      (params?.body || []).filter(p => p?.name).map(p => [p.name, p.value])
    );
    const header = Array.isArray(params) ? '' : ((params?.header || []).find(p => p?.name === 'encabezado')?.value || '');
    const lines = [`📅 Recordatorio de turno${header ? ` con ${header}` : ''}`];
    if (body.nombre_cliente)   lines.push(`\nHola ${body.nombre_cliente},como estas? 👋`);
    if (body.mensaje_editable) lines.push(body.mensaje_editable);
    if (body.fecha)            lines.push(`📆 Fecha: ${body.fecha}`);
    if (body.hora)             lines.push(`🕐 Hora: ${body.hora}`);
    if (body.ubicacion)         lines.push(`📌 Ubicación: ${body.ubicacion}`);
    return lines.join('\n');
  }

  if (templateName === 'confirmacion_turno') {
    const [name, when, day, hour, service, businessName, location] = bodyParams;
    let text = `✅ Confirmación de turno\n\nHola ${name}, tu turno de ${service} fue agendado para el ${day} a las ${hour}.`;
    
    if (location) {
      text += `\n📌 Ubicación: ${location}`;
    }
    
    text += `\n\nTe enviaremos un recordatorio ${when}.`;
    
    if (businessName) {
      text += `\n\n ${businessName}`;
    }
    return text;
  }

  // Default: join params with newlines
  return bodyParams.join('\n');
}

module.exports = { sendTextMessage, sendInteractiveButtons, sendTemplate };
