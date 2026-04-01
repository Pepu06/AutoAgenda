const { supabase, convertKeys } = require('@recordai/db');
const { getCalendarEvents, getCalendarEvent, refreshAccessToken, exchangeCodeForTokens, getUserInfo, updateEventColor, updateEventTitleAndColor } = require('../services/google');
const { sendTemplate } = require('../services/whatsapp');
const { AppError } = require('../errors');

const PHONE_REGEX = /\+?\d[\d\s()-]{7,}/;

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizePhone(rawPhone = '') {
  const raw = String(rawPhone || '').trim();
  const digits = onlyDigits(raw);
  if (!digits) return null;

  // Already international with country code
  if (raw.startsWith('+') || digits.startsWith('54') || digits.startsWith('549')) {
    return `+${digits}`;
  }

  // Argentina local mobile format without country code, e.g. 11XXXXXXXX
  if (digits.length === 10 && digits.startsWith('11')) {
    return `+549${digits}`;
  }

  // Generic fallback
  return `+${digits}`;
}

function extractPhoneFromSummary(summary = '') {
  // Prefer bracketed number: [ +54911... ] or [11...]
  const bracketMatch = summary.match(/\[\s*(\+?\d[\d\s()-]{7,})\s*\]/);
  const source = bracketMatch?.[1] || summary.match(PHONE_REGEX)?.[0] || null;
  return normalizePhone(source);
}

function extractClientName(summary = '') {
  const phoneMatch = summary.match(PHONE_REGEX);
  const beforePhone = phoneMatch
    ? summary.slice(0, phoneMatch.index)
    : summary.replace(PHONE_REGEX, '');

  const cleaned = beforePhone
    .replace(/\s*-\s*(CONFIRMADO|CANCELADO)$/i, '')
    .trim();

  const conMatch = cleaned.match(/\bcon\b\s*(.+)$/i);
  const fromCon = conMatch ? conMatch[1] : cleaned;

  return fromCon
    .replace(/[\[\](){},:;\-\s]+$/g, '')
    .trim() || 'Cliente';
}

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
        const phone = extractPhoneFromSummary(e.summary || '');
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

    let contacts = [];

    // Ensure contacts exist for calendar events with phone
    if (data.length) {
      const { data: existingContacts, error: contactsError } = await supabase
        .from('contacts')
        .select('id, name, phone')
        .eq('tenant_id', req.tenantId);
      if (contactsError) throw contactsError;

      contacts = [...(existingContacts || [])];

      for (const event of data) {
        const phoneDigits = onlyDigits(event.phone);
        const phoneLast10 = phoneDigits.slice(-10);

        const alreadyExists = contacts.some((c) => {
          const cDigits = onlyDigits(c.phone);
          return cDigits === phoneDigits || (phoneLast10 && cDigits.endsWith(phoneLast10));
        });

        if (alreadyExists) continue;

        const { data: createdContact, error: createContactError } = await supabase
          .from('contacts')
          .insert({
            tenant_id: req.tenantId,
            name: extractClientName(event.title),
            phone: event.phone,
          })
          .select('id, name, phone')
          .single();

        if (createContactError) throw createContactError;
        contacts.push(createdContact);
      }

      // Ensure there is at least one service for imported appointments
      let { data: firstService } = await supabase
        .from('services')
        .select('id')
        .eq('tenant_id', req.tenantId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!firstService?.id) {
        const { data: createdService, error: createServiceError } = await supabase
          .from('services')
          .insert({
            tenant_id: req.tenantId,
            name: 'Consulta general',
            duration_minutes: 30,
            price: 0,
          })
          .select('id')
          .single();
        if (createServiceError) throw createServiceError;
        firstService = createdService;
      }

      // Ensure appointments exist for calendar events with phone
      for (const event of data) {
        if (syncedIds.has(event.id)) continue;

        const phoneDigits = onlyDigits(event.phone);
        const phoneLast10 = phoneDigits.slice(-10);

        const contact = contacts.find((c) => {
          const cDigits = onlyDigits(c.phone);
          return cDigits === phoneDigits || (phoneLast10 && cDigits.endsWith(phoneLast10));
        });
        if (!contact) continue;

        const { error: createAppointmentError } = await supabase
          .from('appointments')
          .insert({
            tenant_id: req.tenantId,
            contact_id: contact.id,
            service_id: firstService.id,
            user_id: req.userId,
            scheduled_at: new Date(event.start).toISOString(),
            status: event.status || 'pending',
            google_event_id: event.id,
          });

        if (createAppointmentError) throw createAppointmentError;
        syncedIds.add(event.id);
      }
    }

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

    const phone = extractPhoneFromSummary(event.summary || '');
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
      // Fallback: take only text before phone number in event title
      clientName = extractClientName(event.summary || '');
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
