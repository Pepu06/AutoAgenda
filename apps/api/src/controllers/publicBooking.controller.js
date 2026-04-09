const { supabase, convertKeys } = require('@autoagenda/db');
const { AppError, NotFoundError, ValidationError } = require('../errors');
const { computeAvailableSlots } = require('../utils/availability');
const { appointmentsQueue } = require('../workers/queue');
const { JobName } = require('@autoagenda/shared');
const { createCalendarEventInCalendar } = require('../services/google');
const { decrypt } = require('../utils/crypto');

const PHONE_RE = /^\+?[1-9]\d{7,14}$/;

async function _getTenantBySlug(slug) {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, timezone, business_name, message_template, autoagenda_title, autoagenda_description, autoagenda_profile_image, autoagenda_enabled')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.autoagenda_enabled) return null;
  return data;
}

// GET /public/book/:slug
async function getPublicProfile(req, res, next) {
  try {
    const tenant = await _getTenantBySlug(req.params.slug);
    if (!tenant) return res.status(404).json({ success: false, error: 'Página no encontrada.' });

    const { data: types, error } = await supabase
      .from('autoagenda_types')
      .select('id, title, description, duration_minutes, schedule:schedules(name)')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: true });
    if (error) throw error;

    return res.json({
      success: true,
      data: {
        profile: {
          title:        tenant.autoagenda_title || tenant.name,
          description:  tenant.autoagenda_description,
          profileImage: tenant.autoagenda_profile_image,
        },
        types: (types || []).map(t => ({
          id:              t.id,
          title:           t.title,
          description:     t.description,
          durationMinutes: t.duration_minutes,
          scheduleName:    t.schedule?.name,
        })),
      },
    });
  } catch (err) { return next(err); }
}

// GET /public/book/:slug/types/:typeId
async function getPublicType(req, res, next) {
  try {
    const tenant = await _getTenantBySlug(req.params.slug);
    if (!tenant) return res.status(404).json({ success: false, error: 'Página no encontrada.' });

    const { data: type, error } = await supabase
      .from('autoagenda_types')
      .select('*')
      .eq('id', req.params.typeId)
      .eq('tenant_id', tenant.id)
      .maybeSingle();
    if (error) throw error;
    if (!type) return res.status(404).json({ success: false, error: 'Tipo de cita no encontrado.' });

    return res.json({
      success: true,
      data: {
        ...convertKeys(type),
        profile: {
          title:        tenant.autoagenda_title || tenant.name,
          profileImage: tenant.autoagenda_profile_image,
        },
      },
    });
  } catch (err) { return next(err); }
}

// GET /public/book/:slug/types/:typeId/slots?from=YYYY-MM-DD&to=YYYY-MM-DD
async function getAvailableSlots(req, res, next) {
  try {
    const tenant = await _getTenantBySlug(req.params.slug);
    if (!tenant) return res.status(404).json({ success: false, error: 'Página no encontrada.' });

    const { data: type } = await supabase
      .from('autoagenda_types').select('*').eq('id', req.params.typeId).eq('tenant_id', tenant.id).maybeSingle();
    if (!type) return res.status(404).json({ success: false, error: 'Tipo de cita no encontrado.' });

    let { from, to } = req.query;
    if (!from) from = new Date().toISOString().slice(0, 10);
    if (!to) to = from;

    // Enforce max_days_in_future
    if (type.max_days_in_future) {
      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() + type.max_days_in_future);
      const maxStr = maxDate.toISOString().slice(0, 10);
      if (to > maxStr) to = maxStr;
      if (from > maxStr) return res.json({ success: true, data: { slots: [] } });
    }

    // Load schedule rules and exceptions
    const [{ data: rules }, { data: exceptions }] = await Promise.all([
      supabase.from('schedule_rules').select('*').eq('schedule_id', type.schedule_id),
      supabase.from('schedule_exceptions').select('*').eq('schedule_id', type.schedule_id),
    ]);

    // Load existing appointments for this tenant in the date range (±1 day buffer for TZ)
    const rangeStart = new Date(from + 'T00:00:00Z');
    rangeStart.setDate(rangeStart.getDate() - 1);
    const rangeEnd = new Date(to + 'T23:59:59Z');
    rangeEnd.setDate(rangeEnd.getDate() + 1);

    const { data: appointments } = await supabase
      .from('appointments')
      .select('scheduled_at, service:services(duration_minutes)')
      .eq('tenant_id', tenant.id)
      .neq('status', 'cancelled')
      .gte('scheduled_at', rangeStart.toISOString())
      .lte('scheduled_at', rangeEnd.toISOString());

    const slots = computeAvailableSlots({
      rules: (rules || []).map(r => ({ dayOfWeek: r.day_of_week, startTime: r.start_time, endTime: r.end_time })),
      exceptions: (exceptions || []).map(e => ({
        date: typeof e.date === 'string' ? e.date.slice(0, 10) : new Date(e.date).toISOString().slice(0, 10),
        isBlocked: e.is_blocked,
        startTime: e.start_time,
        endTime: e.end_time,
      })),
      appointments: (appointments || []).map(a => ({
        scheduledAt: a.scheduled_at,
        durationMinutes: a.service?.duration_minutes || type.duration_minutes,
      })),
      durationMinutes: type.duration_minutes,
      from,
      to,
      timezone: tenant.timezone || 'America/Argentina/Buenos_Aires',
      minHoursBeforeBooking: type.min_hours_before_booking || 0,
      maxConcurrentBookings: type.max_concurrent_bookings || 1,
    });

    return res.json({ success: true, data: { slots } });
  } catch (err) { return next(err); }
}

// POST /public/book/:slug/types/:typeId/book
async function createBooking(req, res, next) {
  try {
    const tenant = await _getTenantBySlug(req.params.slug);
    if (!tenant) return res.status(404).json({ success: false, error: 'Página no encontrada.' });

    const { scheduledAt, name, phone, email, notes, answers = {} } = req.body;

    if (!scheduledAt) throw new ValidationError('scheduledAt es requerido.');
    if (!name?.trim())  throw new ValidationError('El nombre es requerido.');
    if (!phone?.trim()) throw new ValidationError('El teléfono es requerido.');
    if (!PHONE_RE.test(phone.trim())) throw new ValidationError('Teléfono inválido. Usa formato E.164 (ej: +5491112345678).');

    const { data: type } = await supabase
      .from('autoagenda_types').select('*').eq('id', req.params.typeId).eq('tenant_id', tenant.id).maybeSingle();
    if (!type) return res.status(404).json({ success: false, error: 'Tipo de cita no encontrado.' });

    // Check WhatsApp config
    const businessName   = String(tenant.business_name || '').trim();
    const msgTemplate    = String(tenant.message_template || '').trim();
    if (!businessName || !msgTemplate) {
      return res.status(400).json({ success: false, error: 'El negocio aún no tiene configurado el envío de mensajes. Contactá al administrador.' });
    }

    // Re-validate slot availability (anti-race)
    const slotDate = new Date(scheduledAt);
    const slotDateStr = slotDate.toISOString().slice(0, 10);

    const [{ data: rules }, { data: exceptions }, { data: conflictApts }] = await Promise.all([
      supabase.from('schedule_rules').select('*').eq('schedule_id', type.schedule_id),
      supabase.from('schedule_exceptions').select('*').eq('schedule_id', type.schedule_id),
      supabase.from('appointments')
        .select('scheduled_at, service:services(duration_minutes)')
        .eq('tenant_id', tenant.id)
        .neq('status', 'cancelled')
        .gte('scheduled_at', new Date(slotDateStr + 'T00:00:00Z').toISOString())
        .lte('scheduled_at', new Date(slotDateStr + 'T23:59:59Z').toISOString()),
    ]);

    const availableSlots = computeAvailableSlots({
      rules: (rules || []).map(r => ({ dayOfWeek: r.day_of_week, startTime: r.start_time, endTime: r.end_time })),
      exceptions: (exceptions || []).map(e => ({
        date: typeof e.date === 'string' ? e.date.slice(0, 10) : new Date(e.date).toISOString().slice(0, 10),
        isBlocked: e.is_blocked,
        startTime: e.start_time,
        endTime: e.end_time,
      })),
      appointments: (conflictApts || []).map(a => ({
        scheduledAt: a.scheduled_at,
        durationMinutes: a.service?.duration_minutes || type.duration_minutes,
      })),
      durationMinutes: type.duration_minutes,
      from: slotDateStr,
      to:   slotDateStr,
      timezone: tenant.timezone || 'America/Argentina/Buenos_Aires',
      minHoursBeforeBooking: type.min_hours_before_booking || 0,
      maxConcurrentBookings: type.max_concurrent_bookings || 1,
    });

    const slotISO = slotDate.toISOString();
    const isAvailable = availableSlots.some(s => new Date(s).getTime() === slotDate.getTime());
    if (!isAvailable) throw new ValidationError('El horario seleccionado ya no está disponible. Por favor elegí otro.');

    // Resolve owner userId
    const { data: owner } = await supabase
      .from('users').select('id, google_access_token').eq('tenant_id', tenant.id).eq('role', 'owner').limit(1).maybeSingle();
    if (!owner) throw new AppError('Error interno: no se encontró el profesional.', 500);

    // Find or create contact
    const cleanPhone = phone.trim();
    let { data: contact } = await supabase
      .from('contacts').select('id').eq('tenant_id', tenant.id).eq('phone', cleanPhone).maybeSingle();
    if (!contact) {
      const { data: newContact, error: contactErr } = await supabase
        .from('contacts')
        .insert({ tenant_id: tenant.id, name: name.trim(), phone: cleanPhone })
        .select().single();
      if (contactErr) throw contactErr;
      contact = newContact;
    }

    // Build appointment notes
    const noteParts = [];
    if (email?.trim()) noteParts.push(`Email: ${email.trim()}`);
    if (notes?.trim()) noteParts.push(notes.trim());
    if (type.extra_questions?.length && Object.keys(answers).length) {
      for (const q of type.extra_questions) {
        const answer = answers[q.id];
        if (answer !== undefined) noteParts.push(`${q.label}: ${answer}`);
      }
    }
    const appointmentNotes = noteParts.join('\n') || null;

    // Create appointment
    const { data: appointment, error: aptErr } = await supabase
      .from('appointments')
      .insert({
        tenant_id:    tenant.id,
        contact_id:   contact.id,
        service_id:   type.service_id,
        user_id:      owner.id,
        scheduled_at: slotISO,
        notes:        appointmentNotes,
      })
      .select('id, scheduled_at')
      .single();
    if (aptErr) throw aptErr;

    // Optional: create Google Calendar event
    if (type.google_calendar_id && owner.google_access_token) {
      try {
        const accessToken = decrypt(owner.google_access_token);
        const endTime = new Date(slotDate.getTime() + type.duration_minutes * 60 * 1000);
        await createCalendarEventInCalendar(accessToken, type.google_calendar_id, {
          summary:       `${type.title} - ${name.trim()}`,
          description:   appointmentNotes || '',
          startDateTime: slotISO,
          endDateTime:   endTime.toISOString(),
        });
      } catch {
        // Non-fatal — don't block the booking
      }
    }

    // Enqueue WhatsApp confirmation
    appointmentsQueue.add(JobName.SEND_CONFIRMATION, { appointmentId: appointment.id }).catch(() => {});

    return res.status(201).json({
      success: true,
      data: {
        appointmentId:   appointment.id,
        scheduledAt:     appointment.scheduled_at,
        title:           type.title,
        durationMinutes: type.duration_minutes,
        businessName:    tenant.autoagenda_title || tenant.name,
      },
    });
  } catch (err) { return next(err); }
}

module.exports = { getPublicProfile, getPublicType, getAvailableSlots, createBooking };
