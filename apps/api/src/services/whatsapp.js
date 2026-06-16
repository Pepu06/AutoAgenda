const logger = require('../config/logger');
const { getSocket } = require('./baileys-session');

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
  const sock = getSocket(tenantId);
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
  logger.info({ tenantId, jid, textLength: text?.length }, '[Baileys] Enviando mensaje...');
  let timeoutId;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Baileys sendMessage timeout after ${BAILEYS_SEND_TIMEOUT_MS}ms`));
      }, BAILEYS_SEND_TIMEOUT_MS);
    });

    const result = await Promise.race([
      sock.sendMessage(jid, { text, linkPreview: null }),
      timeoutPromise,
    ]);
    logger.info({ tenantId, jid, messageId: result?.key?.id }, '[Baileys] Mensaje enviado');
    return result;
  } catch (err) {
    logger.error({ tenantId, jid, err: err?.message }, '[Baileys] Error en sendMessage');
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

module.exports = { sendMessage, renderTemplate, DEFAULT_REMINDER_TEMPLATE, DEFAULT_CONFIRMATION_TEMPLATE };
