const { supabase, convertKeys } = require('@recordai/db');
const { getCalendarEvents, getCalendarEvent, refreshAccessToken, exchangeCodeForTokens, getUserInfo, updateEventColor, updateEventTitleAndColor } = require('../services/google');
const { sendTemplate } = require('../services/whatsapp');
const { AppError } = require('../errors');

const PHONE_REGEX = /\+\d[\d\s()-]{7,}/;

async function getValidToken(userId) {
  const { data: user } = await supabase
    .from('users').select('google_access_token, google_refresh_token').eq('id', userId).single();

  if (!user?.google_access_token) return null;

  let { google_access_token: accessToken, google_refresh_token: refreshToken } = user;

  // Try to fetch events; if expired, refresh and retry
  const test = await getCalendarEvents(accessToken, { days: 1 });
  if (test === null && refreshToken) {
    accessToken = await refreshAccessToken(refreshToken);
    await supabase.from('users').update({ google_access_token: accessToken }).eq('id', userId);
  }

  return accessToken;
}

async function calendarStatus(req, res, next) {
  try {
    const { data: user } = await supabase
      .from('users').select('google_access_token').eq('id', req.userId).single();
    return res.json({ success: true, data: { connected: !!user?.google_access_token } });
  } catch (err) { return next(err); }
}

async function connect(req, res, next) {
  try {
    const { code } = req.body;
    if (!code) throw new AppError('code is required', 400);

    const { access_token, refresh_token } = await exchangeCodeForTokens(code);

    await supabase.from('users').update({
      google_access_token:  access_token,
      google_refresh_token: refresh_token || undefined,
    }).eq('id', req.userId);

    return res.json({ success: true });
  } catch (err) { return next(err); }
}

async function disconnect(req, res, next) {
  try {
    await supabase.from('users').update({
      google_access_token:  null,
      google_refresh_token: null,
    }).eq('id', req.userId);
    return res.json({ success: true });
  } catch (err) { return next(err); }
}

async function events(req, res, next) {
  try {
    const accessToken = await getValidToken(req.userId);
    if (!accessToken) return res.json({ success: true, data: [], connected: false });

    const items = await getCalendarEvents(accessToken, { days: 30 }) || [];

    // Mark which events are already imported
    const { data: synced } = await supabase
      .from('appointments').select('google_event_id')
      .eq('tenant_id', req.tenantId).not('google_event_id', 'is', null);

    const syncedIds = new Set((synced || []).map(a => a.google_event_id)); // eslint-disable-line no-unused-vars

    const COLOR_STATUS = { '5': 'pending', '2': 'confirmed', '11': 'cancelled', '10': 'completed', '8': 'no_show' };

    const data = items
      .filter(e => e.start?.dateTime || e.start?.date)
      .map(e => {
        const isAllDay = !e.start?.dateTime;
        const start = e.start?.dateTime || `${e.start.date}T12:00:00`;
        const colorId = e.colorId || null;
        const phoneMatch = (e.summary || '').match(PHONE_REGEX);
        const phone = phoneMatch?.[0]?.replace(/[\s()-]/g, '') || null;
        // Strip any status suffix from the display title
        const displayTitle = (e.summary || '(Sin título)').replace(/\s*-\s*(CONFIRMADO|CANCELADO)$/i, '').trim();
        return {
          id:          e.id,
          title:       displayTitle,
          phone,
          start,
          end:         e.end?.dateTime || e.end?.date,
          isAllDay,
          attendees:   (e.attendees || []).filter(a => !a.self).map(a => ({ name: a.displayName || a.email, email: a.email })),
          colorId,
          status:      COLOR_STATUS[colorId] || null,
        };
      })
      .filter(e => !!e.phone); // only events with a client phone number

    return res.json({ success: true, data, connected: true });
  } catch (err) { return next(err); }
}

// Update appointment status on Google Calendar event (color + title suffix)
async function updateEventStatus(req, res, next) {
  try {
    const { eventId } = req.params;
    const { status } = req.body;
    const VALID = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'];
    if (!VALID.includes(status)) throw new AppError('Estado inválido', 400);

    const accessToken = await getValidToken(req.userId);
    if (!accessToken) throw new AppError('Google Calendar no conectado', 400);

    const event = await getCalendarEvent(accessToken, eventId);
    if (!event) throw new AppError('Evento no encontrado', 404);

    const STATUS_SUFFIX = { confirmed: 'CONFIRMADO', cancelled: 'CANCELADO' };
    const baseTitle = (event.summary || '').replace(/\s*-\s*(CONFIRMADO|CANCELADO)$/i, '').trim();
    const newTitle = STATUS_SUFFIX[status] ? `${baseTitle} - ${STATUS_SUFFIX[status]}` : baseTitle;

    const shouldNotifyByEmail = status === 'confirmed' || status === 'cancelled';

    await updateEventTitleAndColor(accessToken, eventId, newTitle, status, {
      sendUpdates: shouldNotifyByEmail ? 'all' : 'none',
    });

    return res.json({ success: true, status });
  } catch (err) { return next(err); }
}

// Send WhatsApp reminder for a specific calendar event using the approved Meta template
async function remindEvent(req, res, next) {
  try {
    const { eventId } = req.params;

    const accessToken = await getValidToken(req.userId);
    if (!accessToken) throw new AppError('Google Calendar no conectado', 400);

    const event = await getCalendarEvent(accessToken, eventId);
    if (!event) throw new AppError('Evento no encontrado', 404);

    const phone = (event.summary || '').match(PHONE_REGEX)?.[0]?.replace(/[\s()-]/g, '');
    if (!phone) throw new AppError('No se encontró número de teléfono en el título del evento', 400);

    const start = event.start?.dateTime || (event.start?.date ? `${event.start.date}T12:00:00` : null);

    // Try to get client name from the contact associated with this event's appointment in the DB
    let clientName = null;
    const { data: appointment } = await supabase
      .from('appointments')
      .select('contact:contacts(name)')
      .eq('google_event_id', eventId)
      .eq('tenant_id', req.tenantId)
      .maybeSingle();

    if (appointment?.contact?.name) {
      clientName = appointment.contact.name;
    } else {
      // Fallback: extract name from event title (strip phone and status suffix)
      clientName = (event.summary || 'Cliente')
        .replace(PHONE_REGEX, '')
        .replace(/\s*-\s*(CONFIRMADO|CANCELADO)$/i, '')
        .trim() || 'Cliente';
    }

    // Format date and time
    const dateObj = start ? new Date(start) : null;
    const fechaLabel = dateObj
      ? dateObj.toLocaleDateString('es-AR', {
          timeZone: 'America/Argentina/Buenos_Aires',
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
        })
      : '';
    const horaLabel = dateObj
      ? dateObj.toLocaleTimeString('es-AR', {
          timeZone: 'America/Argentina/Buenos_Aires',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : '';

    // Fetch tenant settings
    const { data: tenant } = await supabase
      .from('tenants')
      .select('business_name, message_template')
      .eq('id', req.tenantId)
      .single();

    const encabezado      = tenant?.business_name    || 'RecordAI';
    const mensajeEditable = tenant?.message_template || '';

    // Send approved Meta template: recordatorio_turno
    await sendTemplate(phone, 'recordatorio_turno', {
      header: [{ name: 'encabezado', value: encabezado }],
      body: [
        { name: 'nombre_cliente',   value: clientName },
        { name: 'mensaje_editable', value: mensajeEditable },
        { name: 'fecha',            value: fechaLabel },
        { name: 'hora',             value: horaLabel },
      ],
    });

    // Mark event as pending (yellow) in Calendar
    updateEventColor(accessToken, eventId, 'pending').catch(() => {});

    return res.json({ success: true, phone });
  } catch (err) { return next(err); }
}

module.exports = { calendarStatus, connect, disconnect, events, updateEventStatus, remindEvent };
