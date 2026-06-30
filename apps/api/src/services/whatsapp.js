const axios = require('axios');
const logger = require('../config/logger');
const env = require('../config/env');
const { getOrConnectedSocket, resetInactivityTimer } = require('./baileys-session');

const WASENDER_API_URL = 'https://wasenderapi.com/api/send-message';

const BAILEYS_SEND_TIMEOUT_MS = 20_000;

const DEFAULT_REMINDER_TEMPLATE =
`📅 Recordatorio de turno con {{negocio}}

Hola {{nombre}}, ¿cómo estás? 👋

📆 Fecha: {{fecha}}
🕐 Hora: {{hora}}
📌 Ubicación: {{ubicacion}}`;

const DEFAULT_CONFIRMATION_TEMPLATE =
`✅ Confirmación de turno

Hola {{nombre}}, tu turno de {{servicio}} fue agendado para el {{fecha}} a las {{hora}}.
📌 Ubicación: {{ubicacion}}

Te enviaremos un recordatorio {{recordatorio}}.

{{negocio}}`;

function renderTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

async function sendMessage(tenantId, phone, text) {
  if (!env.BAILEYS_ENABLED) {
    logger.info({ tenantId, phone }, '[Baileys] Disabled in this environment — message skipped');
    return null;
  }

  // Wake session on demand if it is sleeping or was never started.
  let sock;
  try {
    sock = await getOrConnectedSocket(tenantId);
  } catch (wakeErr) {
    logger.warn({ tenantId, phone, err: wakeErr.message }, '[Baileys] Wake timeout — message skipped');
    return null;
  }

  if (!sock?.user) {
    logger.warn({ tenantId, phone }, '[Baileys] No active session — message skipped');
    return null;
  }

  const normalizedPhone = String(phone || '')
    .trim()
    .replace(/^\+/, '')
    .replace(/^00/, '')
    .replace(/\D/g, '');

  if (!/^\d{10,15}$/.test(normalizedPhone)) {
    logger.warn({ tenantId, phone, normalizedPhone }, '[Baileys] Invalid phone format — message skipped');
    return null;
  }

  const jid = normalizedPhone + '@s.whatsapp.net';

  async function trySend(socket) {
    resetInactivityTimer(tenantId);
    logger.info({ tenantId, jid, textLength: text?.length }, '[Baileys] Enviando mensaje...');
    let timeoutId;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Baileys sendMessage timeout after ${BAILEYS_SEND_TIMEOUT_MS}ms`));
        }, BAILEYS_SEND_TIMEOUT_MS);
      });
      const result = await Promise.race([
        socket.sendMessage(jid, { text, linkPreview: null }),
        timeoutPromise,
      ]);
      logger.info({ tenantId, jid, messageId: result?.key?.id }, '[Baileys] Mensaje enviado');
      resetInactivityTimer(tenantId);
      return result;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  try {
    return await trySend(sock);
  } catch (err) {
    const isTransient = err?.message?.includes('Connection Closed') ||
      err?.output?.payload?.message?.includes('Connection Closed') ||
      err?.message?.includes('timed out');

    if (!isTransient) {
      logger.error({ tenantId, jid, err: err?.message }, '[Baileys] Error en sendMessage');
      throw err;
    }

    // Session reconnecting — wait longer than the minimum reconnect delay (5s) then retry once.
    logger.warn({ tenantId, jid }, '[Baileys] Transient send error — reintentando en 8s...');
    await new Promise(resolve => setTimeout(resolve, 8000));

    let freshSock;
    try {
      freshSock = await getOrConnectedSocket(tenantId);
    } catch (wakeErr) {
      logger.warn({ tenantId, jid, err: wakeErr.message }, '[Baileys] Wake timeout en reintento — mensaje omitido');
      return null;
    }

    if (!freshSock?.user) {
      logger.warn({ tenantId, jid }, '[Baileys] Sin sesión activa en reintento — mensaje omitido');
      return null;
    }

    try {
      return await trySend(freshSock);
    } catch (retryErr) {
      logger.error({ tenantId, jid, err: retryErr?.message }, '[Baileys] Error en sendMessage (reintento)');
      return null;
    }
  }
}

async function sendWasenderMessage(phone, text, apiKey) {
  // Wasender rate limit: 1 message per 5 seconds
  await new Promise(resolve => setTimeout(resolve, 5000));

  try {
    const response = await axios.post(WASENDER_API_URL, {
      to: phone,
      text,
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey || env.WASENDER_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    logger.info({ phone }, '[WasenderAPI] Mensaje enviado');
    return response.data;
  } catch (error) {
    logger.error({ phone, error: error.response?.data || error.message }, '[WasenderAPI] Error enviando mensaje');
    throw error;
  }
}

/**
 * Route a message by provider. Workers use this so they don't need to branch themselves.
 * - 'wasender'  → sendWasenderMessage
 * - 'baileys'   → sendMessage(tenantId, phone, text)  [default]
 */
async function dispatch(tenantId, phone, text, tenantConfig = {}) {
  const provider = tenantConfig.provider || 'baileys';
  if (provider === 'wasender') return sendWasenderMessage(phone, text, tenantConfig.wasender_api_key);
  return sendMessage(tenantId, phone, text);
}

module.exports = {
  sendMessage,
  dispatch,
  renderTemplate,
  DEFAULT_REMINDER_TEMPLATE,
  DEFAULT_CONFIRMATION_TEMPLATE,
};
