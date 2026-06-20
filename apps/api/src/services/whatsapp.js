const logger = require('../config/logger');
const env = require('../config/env');
const { getOrConnectedSocket, resetInactivityTimer } = require('./baileys-session');

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
    const isConnectionClosed = err?.message?.includes('Connection Closed') ||
      err?.output?.payload?.message?.includes('Connection Closed');

    if (!isConnectionClosed) {
      logger.error({ tenantId, jid, err: err?.message }, '[Baileys] Error en sendMessage');
      throw err;
    }

    // Session reconnecting — wait and retry once with a fresh socket
    logger.warn({ tenantId, jid }, '[Baileys] Connection Closed al enviar — reintentando en 4s...');
    await new Promise(resolve => setTimeout(resolve, 4000));

    let freshSock;
    try {
      freshSock = await getOrConnectedSocket(tenantId);
    } catch (wakeErr) {
      logger.error({ tenantId, jid, err: wakeErr.message }, '[Baileys] Wake timeout en reintento');
      throw wakeErr;
    }

    if (!freshSock?.user) {
      logger.error({ tenantId, jid }, '[Baileys] Sin sesión activa en reintento');
      throw err;
    }

    try {
      return await trySend(freshSock);
    } catch (retryErr) {
      logger.error({ tenantId, jid, err: retryErr?.message }, '[Baileys] Error en sendMessage (reintento)');
      throw retryErr;
    }
  }
}

module.exports = { sendMessage, renderTemplate, DEFAULT_REMINDER_TEMPLATE, DEFAULT_CONFIRMATION_TEMPLATE };
