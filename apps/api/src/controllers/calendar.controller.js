const { supabase, convertKeys } = require('@autoagenda/db');
const logger = require('../config/logger');
const { getCalendarEvents, getCalendarEvent, refreshAccessToken, exchangeCodeForTokens, getUserInfo, updateEventColor, updateEventTitleAndColor, createCalendarEvent, listCalendars } = require('../services/google');
const { sendTemplate } = require('../services/whatsapp');
const { appointmentsQueue } = require('../workers/queue');
const { trackMessageSent } = require('../workers/usageTracking');
const { checkUsageLimit } = require('../middleware/checkUsage');
const { JobName } = require('@autoagenda/shared');
const { AppError, ValidationError } = require('../errors');
const { formatTime, formatTemplateHour } = require('../utils/datetime');

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Normaliza un número de teléfono argentino.
 * Reglas (de mayor a menor completitud):
 *   +5491140962011  (13 dígitos con código de área 11) → tal cual
 *   +54922XXXXXXXX  (completo con otra área)           → tal cual
 *   541140962011    (sin +, 12 dígitos)                → agrega '+'
 *   5491140962011   (sin +, 13 dígitos p/área 11)      → agrega '+'
 *   1140962011      (10 dígitos, área sin 9)           → +549 + número
 *   40962011        (8 dígitos, sólo abonado)          → +54911 + número
 */
function normalizePhone(raw = '') {
  const digits = onlyDigits(String(raw));
  if (!digits) return null;

  // Completo: +54 9 <área> <abonado> → 13 dígitos empezando con 549
  if (digits.startsWith('549') && digits.length >= 12) {
    return `+${digits}`;
  }

  // Tiene 54 pero le falta el 9 móvil: 54 + área + abonado (ej: 541140962011, 12 dígitos)
  if (digits.startsWith('54') && digits.length >= 11) {
    return `+549${digits.slice(2)}`;
  }

  // Tiene código de área argentino sin el 54: empieza con 9 + área + abonado (≥11 dígitos)
  // ej: 91140962011 (11 dígitos) → +54 + digits
  if (digits.startsWith('9') && digits.length >= 11) {
    return `+54${digits}`;
  }

  // Tiene código de área sin el 9 móvil: 10 dígitos (ej: 1140962011)
  // Insertamos el 9 entre 54 y el área
  if (digits.length === 10) {
    return `+549${digits}`;
  }

  // Solo abonado: 8 dígitos → asumimos área 11 (Buenos Aires)
  if (digits.length === 8) {
    return `+54911${digits}`;
  }

  // Cualquier otro largo: intento genérico tomando los últimos 8 con área 11
  const last8 = digits.slice(-8);
  return last8.length === 8 ? `+54911${last8}` : null;
}

function extractDataFromDescription(description = '') {
  const desc = description || '';

  const phoneMatch = desc.match(/\[\s*(\+?[\d\s\-(). ]{6,})\s*\]/);
  const phone = phoneMatch ? normalizePhone(phoneMatch[1]) : null;

  const dniLabelMatch = desc.match(/DNI\s*[:\s]\s*([\d.]{8,11})/i);
  const dniBarMatch   = desc.match(/\b(\d{2}\.?\d{3}\.?\d{3})\b/);
  const rawDni = dniLabelMatch ? dniLabelMatch[1] : (dniBarMatch ? dniBarMatch[1] : null);
  const dni = rawDni ? rawDni.replace(/\./g, '') : null;

  const dobMatch = desc.match(/(?:nacimiento|nac|fecha)[^:]*[:\s]\s*(\d{2}[\/.]?\d{2}[\/.]?\d{4})/i)
    || desc.match(/\b(\d{2})[\/.](\d{2})[\/.](\d{4})\b/);
  let birthDate = null;
  if (dobMatch) {
    birthDate = dobMatch[3]
      ? `${dobMatch[1]}/${dobMatch[2]}/${dobMatch[3]}`
      : dobMatch[1].replace(/\./g, '/');
  }

  const emailMatch = desc.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0] : null;

  return { phone, dni, birthDate, email };
}

function extractFromTitle(summary = '') {
  const clean = (summary || '')
    .replace(/\s*-\s*(CONFIRMADO|CANCELADO)$/i, '')
    .trim();
  const dashIdx = clean.indexOf(' - ');
  if (dashIdx === -1) return { name: clean || 'Cliente', service: null };
  return {
    name:    clean.slice(0, dashIdx).trim() || 'Cliente',
    service: clean.slice(dashIdx + 3).trim() || null,
  };
}

function hasReminderConfig(tenant) {
  const businessName = String(tenant?.business_name || '').trim();
  const messageTemplate = String(tenant?.message_template || '').trim();
  return Boolean(businessName && messageTemplate);
}

const REMINDER_CONFIG_ERROR = 'Completá Nombre del negocio y Mensaje personalizable en Configuración para poder crear citas y enviar recordatorios.';

/**
 * Returns the owner's chosen default calendar ID for a tenant.
 */
async function getOwnerCalendarId(tenantId) {
  const { data } = await supabase
    .from('users')
    .select('default_google_calendar_id')
    .eq('tenant_id', tenantId)
    .eq('role', 'owner')
    .maybeSingle();
  return data?.default_google_calendar_id || 'primary';
}

async function getValidToken(userId, calendarId = 'primary') {
  const { data: user } = await supabase
    .from('users').select('google_access_token, google_refresh_token').eq('id', userId).single();

  if (!user?.google_access_token) return null;

  let { google_access_token: accessToken, google_refresh_token: refreshToken } = user;

  // Test with primary calendar (token validation doesn't depend on calendarId)
  const test = await getCalendarEvents(accessToken, { days: 1 });
  if (test === null && refreshToken) {
    try {
      accessToken = await refreshAccessToken(refreshToken);
      await supabase.from('users').update({ google_access_token: accessToken }).eq('id', userId);
    } catch {
      await supabase.from('users').update({
        google_access_token: null,
        google_reconnect_required: true,
      }).eq('id', userId);
      return null;
    }
  }

  return accessToken;
}

async function calendarStatus(req, res, next) {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('google_access_token, google_reconnect_required')
      .eq('id', req.userId)
      .single();
    return res.json({
      success: true,
      data: {
        connected: !!user?.google_access_token,
        needsReconnect: user?.google_reconnect_required === true,
      },
    });
  } catch (err) { return next(err); }
}

async function connect(req, res, next) {
  try {
    const { code } = req.body;
    if (!code) throw new AppError('code is required', 400);

    const { access_token, refresh_token } = await exchangeCodeForTokens(code);

    await supabase.from('users').update({
      google_access_token: access_token,
      google_refresh_token: refresh_token || undefined,
      google_reconnect_required: false,
    }).eq('id', req.userId);

    return res.json({ success: true });
  } catch (err) { return next(err); }
}

async function disconnect(req, res, next) {
  try {
    await supabase.from('users').update({
      google_access_token: null,
      google_refresh_token: null,
    }).eq('id', req.userId);
    return res.json({ success: true });
  } catch (err) { return next(err); }
}

// GET /calendar/default — returns the owner's default calendar ID
async function getDefaultCalendar(req, res, next) {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('default_google_calendar_id')
      .eq('id', req.userId)
      .single();
    return res.json({ success: true, data: { calendarId: user?.default_google_calendar_id || 'primary' } });
  } catch (err) { return next(err); }
}

// PUT /calendar/default — sets the owner's default calendar ID
async function setDefaultCalendar(req, res, next) {
  try {
    const { calendarId } = req.body;
    if (!calendarId) throw new ValidationError('calendarId es requerido.');

    // Validate the calendar exists for this user
    const { data: user } = await supabase
      .from('users').select('google_access_token').eq('id', req.userId).single();

    if (user?.google_access_token) {
      const calendars = await listCalendars(user.google_access_token);
      const valid = calendarId === 'primary' || calendars.some(c => c.id === calendarId);
      if (!valid) throw new ValidationError('Calendario no encontrado en tu cuenta de Google.');
    }

    await supabase.from('users').update({ default_google_calendar_id: calendarId }).eq('id', req.userId);
    return res.json({ success: true, data: { calendarId } });
  } catch (err) { return next(err); }
}

async function events(req, res, next) {
  try {
    const accessToken = await getValidToken(req.userId);
    if (!accessToken) return res.json({ success: true, data: [], connected: false });

    const { data: tenantSettings, error: tenantSettingsError } = await supabase
      .from('tenants')
      .select('business_name, message_template')
      .eq('id', req.tenantId)
      .single();
    if (tenantSettingsError) throw tenantSettingsError;

    const canCreateAppointments = hasReminderConfig(tenantSettings);

    const defaultCalendarId = await getOwnerCalendarId(req.tenantId);
    const items = await getCalendarEvents(accessToken, defaultCalendarId, { days: 30 }) || [];

    // Fetch DB appointments to use as authoritative status + transfer source
    const { data: synced } = await supabase
      .from('appointments')
      .select('google_event_id, status, id, transfer_confirmed, autoagenda_type:autoagenda_types(requires_transfer)')
      .eq('tenant_id', req.tenantId)
      .not('google_event_id', 'is', null);

    const syncedIds = new Set((synced || []).map(a => a.google_event_id)); // eslint-disable-line no-unused-vars
    const dbStatusMap = Object.fromEntries((synced || []).map(a => [a.google_event_id, a.status]));
    const dbAppointmentId = Object.fromEntries((synced || []).map(a => [a.google_event_id, a.id]));
    const dbTransferConfirmed = Object.fromEntries((synced || []).map(a => [a.google_event_id, a.transfer_confirmed]));
    const dbRequiresTransfer = Object.fromEntries((synced || []).map(a => [a.google_event_id, a.autoagenda_type?.requires_transfer ?? false]));

    const COLOR_STATUS = { '5': 'pending', '2': 'confirmed', '11': 'cancelled' };

    const data = items
      .filter(e => e.start?.dateTime || e.start?.date)
      .map(e => {
        const isAllDay = !e.start?.dateTime;
        const start = e.start?.dateTime || `${e.start.date}T12:00:00`;
        const colorId = e.colorId || null;
        const phone = extractDataFromDescription(e.description || '').phone;
        const displayTitle = (e.summary || '(Sin título)').replace(/\s*-\s*(CONFIRMADO|CANCELADO)$/i, '').trim();
        const status = dbStatusMap[e.id] || COLOR_STATUS[colorId] || null;
        return {
          id: e.id,
          title: displayTitle,
          phone,
          start,
          end: e.end?.dateTime || e.end?.date,
          isAllDay,
          attendees: (e.attendees || []).filter(a => !a.self).map(a => ({ name: a.displayName || a.email, email: a.email })),
          colorId,
          status,
          description: e.description || '',
          appointmentId: dbAppointmentId[e.id] || null,
          transferConfirmed: dbTransferConfirmed[e.id] ?? false,
          requiresTransfer: dbRequiresTransfer[e.id] ?? false,
        };
      })
      .filter(e => !!e.phone);

    // Sync GCal color+title for events whose DB status differs from GCal color (best effort)
    const STATUS_SUFFIX = { confirmed: 'CONFIRMADO', cancelled: 'CANCELADO' };
    for (const ev of data) {
      const dbStatus = dbStatusMap[ev.id];
      const gcalStatus = COLOR_STATUS[ev.colorId] || null;
      if (dbStatus && dbStatus !== gcalStatus) {
        const baseTitle = ev.title.replace(/\s*-\s*(CONFIRMADO|CANCELADO)$/i, '').trim();
        const newTitle = STATUS_SUFFIX[dbStatus] ? `${baseTitle} - ${STATUS_SUFFIX[dbStatus]}` : baseTitle;
        updateEventTitleAndColor(accessToken, ev.id, newTitle, dbStatus, { sendUpdates: 'none', calendarId: defaultCalendarId }).catch(() => { });
      }
    }

    let contacts = [];

    if (data.length && canCreateAppointments) {
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

        const { name: contactName } = extractFromTitle(event.title);
        const { dni, birthDate, email: descEmail } = extractDataFromDescription(event.description || '');

        const { data: createdContact, error: createContactError } = await supabase
          .from('contacts')
          .insert({
            tenant_id: req.tenantId,
            name: contactName,
            phone: event.phone,
            ...(descEmail   && { email:      descEmail }),
            ...(dni         && { dni }),
            ...(birthDate   && { birth_date: birthDate }),
          })
          .select('id, name, phone')
          .single();

        if (createContactError) throw createContactError;
        contacts.push(createdContact);
      }

      let { data: allServices } = await supabase
        .from('services')
        .select('id, name')
        .eq('tenant_id', req.tenantId)
        .order('created_at', { ascending: true });

      if (!allServices?.length) {
        const { data: createdService, error: createServiceError } = await supabase
          .from('services')
          .insert({ tenant_id: req.tenantId, name: 'Consulta general', duration_minutes: 30, price: 0 })
          .select('id, name')
          .single();
        if (createServiceError) throw createServiceError;
        allServices = [createdService];
      }

      async function matchService(titleService, durationMinutes = 30) {
        if (!titleService) return allServices[0];

        const serviceName = titleService.trim();
        const matched = allServices.find(s => s.name.toLowerCase() === serviceName.toLowerCase());
        if (matched) return matched;

        const { data: created, error: createErr } = await supabase
          .from('services')
          .insert({ tenant_id: req.tenantId, name: serviceName, duration_minutes: durationMinutes, price: 0 })
          .select('id, name')
          .single();
        if (createErr) {
          logger.warn({ createErr, serviceName }, 'Failed to create service from description, using default');
          return allServices[0];
        }
        allServices.push(created);
        return created;
      }

      for (const event of data) {
        if (syncedIds.has(event.id)) continue;

        const phoneDigits = onlyDigits(event.phone);
        const phoneLast10 = phoneDigits.slice(-10);

        const contact = contacts.find((c) => {
          const cDigits = onlyDigits(c.phone);
          return cDigits === phoneDigits || (phoneLast10 && cDigits.endsWith(phoneLast10));
        });
        if (!contact) continue;

        const eventDuration = event.end && event.start
          ? Math.round((new Date(event.end) - new Date(event.start)) / 60000)
          : 30;
        const { service: titleService } = extractFromTitle(event.title);
        const service = await matchService(titleService, eventDuration);

        const { data: newAppointment, error: createAppointmentError } = await supabase
          .from('appointments')
          .insert({
            tenant_id: req.tenantId,
            contact_id: contact.id,
            service_id: service.id,
            user_id: req.userId,
            scheduled_at: new Date(event.start).toISOString(),
            status: 'sin_enviar',
            google_event_id: event.id,
          })
          .select('id, scheduled_at')
          .single();

        if (createAppointmentError) throw createAppointmentError;
        syncedIds.add(event.id);

        if (newAppointment) {
          const queueJob = (name, opts = {}) =>
            appointmentsQueue.add(name, { appointmentId: newAppointment.id }, opts).catch(() => { });
          queueJob(JobName.SEND_CONFIRMATION);
        }
      }
    }

    if (!canCreateAppointments) {
      logger.warn({ tenantId: req.tenantId }, 'Skipping calendar sync appointment creation: missing business_name or message_template');
    }

    return res.json({
      success: true,
      data,
      connected: true,
      ...(canCreateAppointments ? {} : { warning: REMINDER_CONFIG_ERROR }),
    });
  } catch (err) { return next(err); }
}

async function updateEventStatus(req, res, next) {
  try {
    const { eventId } = req.params;
    const { status } = req.body;
    const VALID = ['pending', 'confirmed', 'cancelled', 'notified', 'sin_enviar'];
    if (!VALID.includes(status)) throw new AppError('Estado inválido', 400);

    const accessToken = await getValidToken(req.userId);
    if (!accessToken) throw new AppError('Google Calendar no conectado', 400);

    const defaultCalendarId = await getOwnerCalendarId(req.tenantId);
    const event = await getCalendarEvent(accessToken, eventId, defaultCalendarId);
    if (!event) throw new AppError('Evento no encontrado', 404);

    const STATUS_SUFFIX = { confirmed: 'CONFIRMADO', cancelled: 'CANCELADO' };
    const baseTitle = (event.summary || '').replace(/\s*-\s*(CONFIRMADO|CANCELADO)$/i, '').trim();
    const newTitle = STATUS_SUFFIX[status] ? `${baseTitle} - ${STATUS_SUFFIX[status]}` : baseTitle;

    const shouldNotifyByEmail = status === 'confirmed' || status === 'cancelled';

    await updateEventTitleAndColor(accessToken, eventId, newTitle, status, {
      sendUpdates: shouldNotifyByEmail ? 'all' : 'none',
      calendarId: defaultCalendarId,
    });

    await supabase
      .from('appointments')
      .update({ status })
      .eq('google_event_id', eventId)
      .eq('tenant_id', req.tenantId);

    return res.json({ success: true, status });
  } catch (err) { return next(err); }
}

async function remindEvent(req, res, next) {
  try {
    const { eventId } = req.params;

    const accessToken = await getValidToken(req.userId);
    if (!accessToken) throw new AppError('Google Calendar no conectado', 400);

    const defaultCalendarId = await getOwnerCalendarId(req.tenantId);
    const event = await getCalendarEvent(accessToken, eventId, defaultCalendarId);
    if (!event) throw new AppError('Evento no encontrado', 404);

    const phone = extractDataFromDescription(event.description || '').phone;
    if (!phone) throw new AppError('No se encontró número de teléfono entre [ ] en la descripción del evento', 400);

    const usageCheck = await checkUsageLimit(req.tenantId);
    if (!usageCheck.allowed) {
      throw new AppError(usageCheck.message || 'Límite de mensajes alcanzado para tu plan actual.', 403);
    }

    const start = event.start?.dateTime || (event.start?.date ? `${event.start.date}T12:00:00` : null);

    let clientName = null;
    const { data: appointment } = await supabase
      .from('appointments')
      .select('id, contact:contacts(name)')
      .eq('google_event_id', eventId)
      .eq('tenant_id', req.tenantId)
      .maybeSingle();

    if (appointment?.contact?.name) {
      clientName = appointment.contact.name;
    } else {
      clientName = extractFromTitle(event.summary || '').name;
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('business_name, message_template, timezone, time_format, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, wasender_api_key, location, location_mode')
      .eq('id', req.tenantId)
      .single();

    if (!hasReminderConfig(tenant)) throw new AppError(REMINDER_CONFIG_ERROR, 400);

    const dateObj = start ? new Date(start) : null;
    const tenantTz = tenant?.timezone || 'America/Argentina/Buenos_Aires';
    const fechaLabel = dateObj
      ? dateObj.toLocaleDateString('es-AR', {
        timeZone: tenantTz,
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
      })
      : '';
    const horaLabel = dateObj
      ? formatTemplateHour(dateObj, {
        timeZone: tenantTz,
        timeFormat: tenant?.time_format,
      })
      : '';

    const encabezado = tenant?.business_name;
    const mensajeEditable = (tenant?.message_template || '').replace(/[\n\r\t]/g, ' ').replace(/ {5,}/g, '    ');
    const ubicacion = (tenant?.location_mode === 'calendar' && event?.location)
      ? event.location
      : (tenant?.location || '');

    const tenantConfig = {
      provider: tenant?.whatsapp_provider || 'meta',
      whatsappPhoneNumberId: tenant?.whatsapp_phone_number_id,
      whatsappAccessToken: tenant?.whatsapp_access_token,
      wasender_api_key: tenant?.wasender_api_key,
    };

    await sendTemplate(phone, 'recordatorio_turno', {
      header: [{ name: 'encabezado', value: encabezado }],
      body: [
        { name: 'nombre_cliente',   value: clientName },
        { name: 'mensaje_editable', value: mensajeEditable },
        { name: 'fecha',            value: fechaLabel },
        { name: 'hora',             value: horaLabel },
        { name: 'ubicacion',        value: ubicacion },
      ],
      ...(appointment?.id ? {
        buttons: [
          { index: 0, payload: `confirm_${appointment.id}` },
          { index: 1, payload: `cancel_${appointment.id}` },
        ],
      } : {}),
    }, tenantConfig);

    await trackMessageSent(req.tenantId, 'reminder');

    if (appointment?.id) {
      const { error: updateError } = await supabase
        .from('appointments')
        .update({ status: 'pending' })
        .eq('id', appointment.id)
        .eq('tenant_id', req.tenantId);

      if (updateError) throw updateError;

      appointmentsQueue
        .add(JobName.SEND_FOLLOW_UP, { appointmentId: appointment.id }, { delay: 2 * 60 * 60 * 1000 })
        .catch(() => { });
    }

    updateEventColor(accessToken, eventId, 'pending', defaultCalendarId).catch(() => { });

    return res.json({ success: true, phone });
  } catch (err) { return next(err); }
}

async function createEvent(req, res, next) {
  try {
    const { contactId, serviceId, scheduledAt, notes, location } = req.body;

    const { data: tenantSettings, error: tenantSettingsError } = await supabase
      .from('tenants')
      .select('business_name, message_template, timezone, reminder_type, reminder_time, location_mode')
      .eq('id', req.tenantId)
      .single();
    if (tenantSettingsError) throw tenantSettingsError;
    if (!hasReminderConfig(tenantSettings)) throw new AppError(REMINDER_CONFIG_ERROR, 400);

    const [{ data: contact }, { data: service }] = await Promise.all([
      supabase.from('contacts').select('id, name, phone, email').eq('id', contactId).eq('tenant_id', req.tenantId).single(),
      supabase.from('services').select('id, name, duration_minutes').eq('id', serviceId).eq('tenant_id', req.tenantId).single(),
    ]);
    if (!contact || !service) throw new AppError('Contacto o servicio no encontrado', 404);

    const { data: appointment, error } = await supabase
      .from('appointments')
      .insert({
        tenant_id: req.tenantId,
        contact_id: contactId,
        service_id: serviceId,
        user_id: req.userId,
        scheduled_at: new Date(scheduledAt).toISOString(),
        status: 'sin_enviar',
        notes,
      })
      .select('*')
      .single();
    if (error) throw error;

    const accessToken = await getValidToken(req.userId);
    if (accessToken) {
      const defaultCalendarId = await getOwnerCalendarId(req.tenantId);
      const startDate = new Date(scheduledAt);
      const endDate = new Date(startDate.getTime() + service.duration_minutes * 60000);
      const attendees = contact.email ? [contact.email] : [];

      const calEvent = await createCalendarEvent(accessToken, {
        summary: `${contact.name} - ${service.name}`,
        description: `Nombre: ${contact.name}\nTeléfono: [${contact.phone}]${contact.email ? `\nMail: ${contact.email}` : ''}`,
        startDateTime: startDate.toISOString(),
        endDateTime: endDate.toISOString(),
        attendees,
        location: tenantSettings.location_mode === 'calendar' ? (location || '') : undefined,
      }, defaultCalendarId).catch(() => null);

      if (calEvent?.id) {
        await supabase.from('appointments').update({ google_event_id: calEvent.id }).eq('id', appointment.id);
      }
    }

    const queueJob = (name, opts = {}) =>
      appointmentsQueue.add(name, { appointmentId: appointment.id }, opts).catch(() => { });

    queueJob(JobName.SEND_CONFIRMATION);

    return res.status(201).json({ success: true, data: convertKeys(appointment) });
  } catch (err) { return next(err); }
}


async function updateCalendarEvent(req, res, next) {
  try {
    const { eventId } = req.params;
    const { scheduledAt, contactId, serviceId, notes } = req.body;

    const accessToken = await getValidToken(req.userId);
    if (!accessToken) throw new AppError('Google Calendar no conectado', 400);

    const defaultCalendarId = await getOwnerCalendarId(req.tenantId);

    // Get service duration to compute end time
    let durationMinutes = 60;
    if (serviceId) {
      const { data: svc } = await supabase
        .from('services').select('duration_minutes, name').eq('id', serviceId).eq('tenant_id', req.tenantId).maybeSingle();
      if (svc?.duration_minutes) durationMinutes = svc.duration_minutes;
    }

    // Update GCal event time
    if (scheduledAt) {
      const start = new Date(scheduledAt);
      const end = new Date(start.getTime() + durationMinutes * 60000);
      const { updateCalendarEventDateTime } = require('../services/google');
      await updateCalendarEventDateTime(accessToken, eventId, start.toISOString(), end.toISOString(), defaultCalendarId);
    }

    // Update Supabase appointment
    const updates = {};
    if (scheduledAt)   updates.scheduled_at = new Date(scheduledAt).toISOString();
    if (contactId)     updates.contact_id   = contactId;
    if (serviceId)     updates.service_id   = serviceId;
    if (notes !== undefined) updates.notes  = notes;

    if (Object.keys(updates).length) {
      await supabase
        .from('appointments')
        .update(updates)
        .eq('google_event_id', eventId)
        .eq('tenant_id', req.tenantId);
    }

    return res.json({ success: true });
  } catch (err) { return next(err); }
}

module.exports = { calendarStatus, connect, disconnect, events, createEvent, updateEventStatus, remindEvent, getDefaultCalendar, setDefaultCalendar, updateCalendarEvent, getValidToken, getOwnerCalendarId };
