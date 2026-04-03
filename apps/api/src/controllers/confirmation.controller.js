const { supabase } = require('@recordai/db');
const { getCalendarEvent, updateEventTitleAndColor, refreshAccessToken } = require('../services/google');
const { sendTextMessage } = require('../services/whatsapp');
const logger = require('../config/logger');

async function getValidToken(userId, eventId) {
  const { data: user } = await supabase
    .from('users')
    .select('google_access_token, google_refresh_token')
    .eq('id', userId)
    .single();

  if (!user?.google_access_token) return null;

  let { google_access_token: accessToken, google_refresh_token: refreshToken } = user;

  const testEvent = await getCalendarEvent(accessToken, eventId);
  if (testEvent === null && refreshToken) {
    try {
      accessToken = await refreshAccessToken(refreshToken);
      await supabase.from('users').update({ google_access_token: accessToken }).eq('id', userId);
    } catch {
      return null;
    }
  }

  return accessToken;
}

async function notifyAdmin(userId, isConfirmed, clientTitle, eventDate) {
  try {
    const { data: user } = await supabase
      .from('users').select('tenant_id').eq('id', userId).single();
    if (!user?.tenant_id) return;

    const { data: tenant } = await supabase
      .from('tenants')
      .select('admin_whatsapp, admin_alerts_enabled')
      .eq('id', user.tenant_id)
      .single();

    if (!tenant?.admin_alerts_enabled || !tenant?.admin_whatsapp) return;

    const icon = isConfirmed ? '✅' : '❌';
    const action = isConfirmed ? 'confirmó' : 'canceló';
    await sendTextMessage(
      tenant.admin_whatsapp,
      `${icon} *${clientTitle}* ${action} su cita del *${eventDate}*`
    );
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to send admin notification');
  }
}

function decodeToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [userId, ...rest] = decoded.split(':');
    const eventId = rest.join(':');
    if (!userId || !eventId) return null;
    return { userId, eventId };
  } catch {
    return null;
  }
}

function renderPage(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0B0C0F;
      color: #E8E9EC;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #161720;
      border: 1px solid #252630;
      border-radius: 20px;
      padding: 40px 32px;
      max-width: 420px;
      width: 100%;
      text-align: center;
    }
    .logo { font-size: 13px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #C9FF3D; margin-bottom: 28px; }
    h1 { font-size: 22px; font-weight: 700; color: #E8E9EC; margin-bottom: 8px; }
    .event-title { font-size: 18px; font-weight: 600; color: #E8E9EC; margin-bottom: 6px; }
    .event-time { font-size: 14px; color: #C9FF3D; margin-bottom: 24px; }
    p { font-size: 14px; color: #8B8FA8; line-height: 1.6; margin-bottom: 24px; }
    .actions { display: flex; gap: 12px; flex-direction: column; }
    .btn { display: block; width: 100%; padding: 14px; border-radius: 12px; font-size: 15px; font-weight: 700; cursor: pointer; border: none; text-decoration: none; transition: opacity 0.15s; }
    .btn:hover { opacity: 0.85; }
    .btn-confirm { background: #C9FF3D; color: #0B0C0F; }
    .btn-cancel  { background: transparent; color: #8B8FA8; border: 1px solid #252630; }
    .status-icon { font-size: 52px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">RecordAI</div>
    ${bodyHtml}
  </div>
</body>
</html>`;
}

async function confirmationPage(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).send(renderPage('Error', '<h1>Link inválido</h1>'));

  const decoded = decodeToken(token);
  if (!decoded) return res.status(400).send(renderPage('Error', '<h1>Link inválido</h1>'));

  const { userId, eventId } = decoded;
  let eventTitle = 'Tu cita';
  let eventTime = '';

  try {
    const accessToken = await getValidToken(userId, eventId);
    if (accessToken) {
      const event = await getCalendarEvent(accessToken, eventId);
      if (event) {
        eventTitle = (event.summary || 'Tu cita').replace(/\s*-\s*(CONFIRMADO|CANCELADO)$/i, '').trim();
        const start = event.start?.dateTime || (event.start?.date ? `${event.start.date}T12:00:00` : null);
        if (start) {
          eventTime = new Date(start).toLocaleString('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            dateStyle: 'full',
            timeStyle: 'short',
          });
        }
      }
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Could not fetch calendar event for confirmation page');
  }

  const body = `
    <div class="event-title">${escapeHtml(eventTitle)}</div>
    ${eventTime ? `<div class="event-time">📅 ${escapeHtml(eventTime)}</div>` : ''}
    <p>¿Podés confirmar tu asistencia?</p>
    <div class="actions">
      <a href="/accion?token=${encodeURIComponent(token)}&estado=CONFIRMADO" class="btn btn-confirm">✓ Confirmar asistencia</a>
      <a href="/accion?token=${encodeURIComponent(token)}&estado=CANCELADO" class="btn btn-cancel">✕ Cancelar turno</a>
    </div>
  `;

  res.send(renderPage('Confirmar cita', body));
}

async function processAction(req, res) {
  const { token, estado } = req.query;

  if (!token || !['CONFIRMADO', 'CANCELADO'].includes(estado)) {
    return res.status(400).send(renderPage('Error', '<h1>Parámetros inválidos</h1>'));
  }

  const decoded = decodeToken(token);
  if (!decoded) return res.status(400).send(renderPage('Error', '<h1>Link inválido</h1>'));

  const { userId, eventId } = decoded;
  const isConfirmed = estado === 'CONFIRMADO';
  const statusKey   = isConfirmed ? 'confirmed' : 'cancelled';
  const statusLabel = isConfirmed ? 'CONFIRMADO' : 'CANCELADO';

  let clientTitle = 'Cliente';
  let eventDate   = '';

  try {
    const accessToken = await getValidToken(userId, eventId);
    if (accessToken) {
      const event = await getCalendarEvent(accessToken, eventId);
      if (event) {
        const baseTitle = (event.summary || '').replace(/\s*-\s*(CONFIRMADO|CANCELADO)$/i, '').trim();
        clientTitle = baseTitle || 'Cliente';
        const newTitle = `${baseTitle} - ${statusLabel}`;
        await updateEventTitleAndColor(accessToken, eventId, newTitle, statusKey);

        const start = event.start?.dateTime || (event.start?.date ? `${event.start.date}T12:00:00` : null);
        if (start) {
          eventDate = new Date(start).toLocaleString('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            dateStyle: 'medium',
            timeStyle: 'short',
          });
        }
      }
    }

    await supabase
      .from('appointments')
      .update({ status: statusKey })
      .eq('google_event_id', eventId)
      .eq('user_id', userId);

  } catch (err) {
    logger.warn({ err: err.message, eventId }, 'Error processing confirmation action');
  }

  // Notify admin asynchronously — never blocks the response
  notifyAdmin(userId, isConfirmed, clientTitle, eventDate).catch(() => {});

  const icon    = isConfirmed ? '🎉' : '👋';
  const heading = isConfirmed ? '¡Cita confirmada!' : 'Turno cancelado';
  const message = isConfirmed
    ? 'Gracias por confirmar. Te esperamos en el turno.'
    : 'Lamentamos que no puedas asistir. Podés contactarnos para reprogramar.';

  res.send(renderPage(heading, `
    <div class="status-icon">${icon}</div>
    <h1>${heading}</h1>
    <p>${message}</p>
  `));
}

// ── Wasender confirmation page (by appointmentId, no Google token needed) ──

async function confirmByAppointmentId(req, res) {
  const { appointmentId } = req.params;
  if (!appointmentId) return res.status(400).send(renderPage('Error', '<h1>Link inválido</h1>'));

  const { data: appointment } = await supabase
    .from('appointments')
    .select('id, scheduled_at, status, contact:contacts(name), service:services(name), tenant:tenants(timezone, business_name)')
    .eq('id', appointmentId)
    .maybeSingle();

  if (!appointment) return res.status(404).send(renderPage('No encontrado', '<h1>Turno no encontrado</h1>'));

  const tz = appointment.tenant?.timezone || 'America/Argentina/Buenos_Aires';
  const dateObj = new Date(appointment.scheduled_at);
  const eventTime = dateObj.toLocaleString('es-AR', {
    timeZone: tz,
    dateStyle: 'full',
    timeStyle: 'short',
    hour12: false,
  });

  if (appointment.status === 'confirmed') {
    return res.send(renderPage('Turno confirmado', `
      <div class="status-icon">🎉</div>
      <h1>¡Ya confirmaste tu turno!</h1>
      <p>Tu cita con ${escapeHtml(appointment.service?.name || '')} el ${escapeHtml(eventTime)} ya fue confirmada. Te esperamos.</p>
    `));
  }

  if (appointment.status === 'cancelled') {
    return res.send(renderPage('Turno cancelado', `
      <div class="status-icon">👋</div>
      <h1>Turno cancelado</h1>
      <p>Este turno ya fue cancelado. Podés contactarnos para reprogramar.</p>
    `));
  }

  const body = `
    <div class="event-title">${escapeHtml(appointment.contact?.name || 'Tu turno')}</div>
    <div class="event-time">📅 ${escapeHtml(eventTime)}</div>
    <p>¿Podés confirmar tu asistencia al turno de <strong>${escapeHtml(appointment.service?.name || '')}</strong>?</p>
    <div class="actions">
      <a href="/c/${encodeURIComponent(appointmentId)}/action?estado=confirmed" class="btn btn-confirm">✓ Confirmar asistencia</a>
      <a href="/c/${encodeURIComponent(appointmentId)}/action?estado=cancelled" class="btn btn-cancel">✕ Cancelar turno</a>
    </div>
  `;

  res.send(renderPage('Confirmar turno', body));
}

async function processAppointmentAction(req, res) {
  const { appointmentId } = req.params;
  const { estado } = req.query;

  if (!appointmentId || !['confirmed', 'cancelled'].includes(estado)) {
    return res.status(400).send(renderPage('Error', '<h1>Parámetros inválidos</h1>'));
  }

  const { data: appointment } = await supabase
    .from('appointments')
    .select('id, scheduled_at, status, tenant_id, user_id, contact:contacts(name), service:services(name), tenant:tenants(timezone, admin_whatsapp, admin_alerts_enabled, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, wasender_api_key)')
    .eq('id', appointmentId)
    .maybeSingle();

  if (!appointment) return res.status(404).send(renderPage('No encontrado', '<h1>Turno no encontrado</h1>'));

  if (appointment.status === estado) {
    const icon    = estado === 'confirmed' ? '🎉' : '👋';
    const heading = estado === 'confirmed' ? '¡Turno confirmado!' : 'Turno cancelado';
    return res.send(renderPage(heading, `<div class="status-icon">${icon}</div><h1>${heading}</h1><p>Ya procesamos tu respuesta.</p>`));
  }

  await supabase
    .from('appointments')
    .update({ status: estado })
    .eq('id', appointmentId);

  // Notify admin
  try {
    const tenant = appointment.tenant;
    if (tenant?.admin_alerts_enabled && tenant?.admin_whatsapp) {
      const tz = tenant.timezone || 'America/Argentina/Buenos_Aires';
      const dateObj = new Date(appointment.scheduled_at);
      const eventDate = dateObj.toLocaleString('es-AR', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' });
      const icon = estado === 'confirmed' ? '✅' : '❌';
      const action = estado === 'confirmed' ? 'confirmó' : 'canceló';
      const tenantConfig = {
        provider: tenant.whatsapp_provider || 'meta',
        whatsappPhoneNumberId: tenant.whatsapp_phone_number_id,
        whatsappAccessToken: tenant.whatsapp_access_token,
        wasender_api_key: tenant.wasender_api_key,
      };
      sendTextMessage(
        tenant.admin_whatsapp,
        `${icon} *${appointment.contact?.name || 'Cliente'}* ${action} su cita del *${eventDate}*`,
        tenantConfig
      ).catch(() => {});
    }
  } catch { /* silent */ }

  const isConfirmed = estado === 'confirmed';
  const icon    = isConfirmed ? '🎉' : '👋';
  const heading = isConfirmed ? '¡Turno confirmado!' : 'Turno cancelado';
  const message = isConfirmed
    ? 'Gracias por confirmar. Te esperamos en el turno.'
    : 'Lamentamos que no puedas asistir. Podés contactarnos para reprogramar.';

  res.send(renderPage(heading, `
    <div class="status-icon">${icon}</div>
    <h1>${heading}</h1>
    <p>${message}</p>
  `));
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { confirmationPage, processAction, confirmByAppointmentId, processAppointmentAction };
