const { supabase, convertKeys } = require('@autoagenda/db');
const { AppError, NotFoundError, ValidationError } = require('../errors');
const { uploadPaymentProof } = require('../services/googleDrive');
const { listCalendars } = require('../services/google');
const { decrypt } = require('../utils/crypto');

const RESERVED_SLUGS = new Set([
  'admin', 'api', 'auth', 'dashboard', 'book', 'contact', 'privacy', 'terms',
  'public', 'health', 'webhook', 'appointments', 'services', 'contacts',
  'settings', 'subscription', 'calendar', 'confirmation', 'autoagenda',
]);

const SLUG_RE = /^[a-z0-9-]{3,40}$/;

function validateSlug(slug) {
  if (!SLUG_RE.test(slug)) throw new ValidationError('El slug debe tener 3-40 caracteres: solo minúsculas, números y guiones.');
  if (RESERVED_SLUGS.has(slug)) throw new ValidationError(`"${slug}" es una palabra reservada.`);
}

// ---------- PROFILE ----------

async function getProfile(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('slug, autoagenda_title, autoagenda_description, autoagenda_profile_image, autoagenda_enabled')
      .eq('id', req.tenantId)
      .single();
    if (error) throw error;
    return res.json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}

async function updateProfile(req, res, next) {
  try {
    const { slug, autoagendaTitle, autoagendaDescription, autoagendaEnabled } = req.body;
    const updates = {};

    if (slug !== undefined) {
      const clean = String(slug).trim().toLowerCase();
      validateSlug(clean);
      // Check uniqueness
      const { data: existing } = await supabase
        .from('tenants').select('id').eq('slug', clean).neq('id', req.tenantId).maybeSingle();
      if (existing) throw new ValidationError('Ese slug ya está en uso.');
      updates.slug = clean;
    }
    if (autoagendaTitle  !== undefined) updates.autoagenda_title       = autoagendaTitle;
    if (autoagendaDescription !== undefined) updates.autoagenda_description = autoagendaDescription;
    if (autoagendaEnabled !== undefined) updates.autoagenda_enabled    = Boolean(autoagendaEnabled);

    if (!Object.keys(updates).length) throw new AppError('No hay campos para actualizar.', 400);

    const { data, error } = await supabase
      .from('tenants').update(updates).eq('id', req.tenantId)
      .select('slug, autoagenda_title, autoagenda_description, autoagenda_profile_image, autoagenda_enabled')
      .single();
    if (error) throw error;
    return res.json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}

async function uploadProfileImage(req, res, next) {
  try {
    const { dataUrl } = req.body;
    if (!dataUrl) throw new ValidationError('dataUrl requerido.');

    const match = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) throw new ValidationError('Imagen inválida. Debe ser base64.');

    const base64Data = match[2];
    const fileSizeBytes = Math.floor((base64Data.length * 3) / 4);
    if (fileSizeBytes > 5 * 1024 * 1024) throw new ValidationError('La imagen supera 5MB.');

    const { data: tenant } = await supabase.from('tenants').select('name').eq('id', req.tenantId).single();

    const result = await uploadPaymentProof({
      tenantId:    req.tenantId,
      tenantName:  tenant?.name || req.tenantId,
      tenantEmail: '',
      plan:        'profile-image',
      mimeType:    match[1],
      base64Data,
    });

    const imageUrl = result.webViewLink || result.imageUrl;
    await supabase.from('tenants').update({ autoagenda_profile_image: imageUrl }).eq('id', req.tenantId);
    return res.json({ success: true, data: { imageUrl } });
  } catch (err) { return next(err); }
}

// ---------- SCHEDULES ----------

async function listSchedules(req, res, next) {
  try {
    const { data: schedules, error } = await supabase
      .from('schedules').select('*').eq('tenant_id', req.tenantId).order('created_at', { ascending: true });
    if (error) throw error;

    // Fetch rules + exceptions for each schedule
    const ids = schedules.map(s => s.id);
    const [{ data: rules }, { data: exceptions }] = await Promise.all([
      ids.length ? supabase.from('schedule_rules').select('*').in('schedule_id', ids) : { data: [] },
      ids.length ? supabase.from('schedule_exceptions').select('*').in('schedule_id', ids) : { data: [] },
    ]);

    const result = schedules.map(s => ({
      ...convertKeys(s),
      rules: convertKeys((rules || []).filter(r => r.schedule_id === s.id)),
      exceptions: convertKeys((exceptions || []).filter(e => e.schedule_id === s.id)),
    }));

    return res.json({ success: true, data: result });
  } catch (err) { return next(err); }
}

async function getSchedule(req, res, next) {
  try {
    const { data: schedule, error } = await supabase
      .from('schedules').select('*').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (error) throw error;
    if (!schedule) throw new NotFoundError('Horario no encontrado.');

    const [{ data: rules }, { data: exceptions }] = await Promise.all([
      supabase.from('schedule_rules').select('*').eq('schedule_id', schedule.id),
      supabase.from('schedule_exceptions').select('*').eq('schedule_id', schedule.id),
    ]);

    return res.json({
      success: true,
      data: {
        ...convertKeys(schedule),
        rules: convertKeys(rules || []),
        exceptions: convertKeys(exceptions || []),
      },
    });
  } catch (err) { return next(err); }
}

async function createSchedule(req, res, next) {
  try {
    const { name, rules = [], exceptions = [] } = req.body;
    if (!name?.trim()) throw new ValidationError('El nombre del horario es requerido.');

    const { data: schedule, error } = await supabase
      .from('schedules').insert({ tenant_id: req.tenantId, name: name.trim() }).select().single();
    if (error) throw error;

    await _replaceRulesAndExceptions(schedule.id, rules, exceptions);

    return res.status(201).json({ success: true, data: { ...convertKeys(schedule), rules, exceptions } });
  } catch (err) { return next(err); }
}

async function updateSchedule(req, res, next) {
  try {
    const { name, rules, exceptions } = req.body;
    const { data: existing } = await supabase
      .from('schedules').select('id').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!existing) throw new NotFoundError('Horario no encontrado.');

    if (name?.trim()) {
      const { error } = await supabase.from('schedules').update({ name: name.trim() }).eq('id', req.params.id);
      if (error) throw error;
    }

    if (rules !== undefined || exceptions !== undefined) {
      await _replaceRulesAndExceptions(req.params.id, rules || [], exceptions || []);
    }

    const { data: updated } = await supabase.from('schedules').select('*').eq('id', req.params.id).single();
    const [{ data: updRules }, { data: updExc }] = await Promise.all([
      supabase.from('schedule_rules').select('*').eq('schedule_id', req.params.id),
      supabase.from('schedule_exceptions').select('*').eq('schedule_id', req.params.id),
    ]);

    return res.json({
      success: true,
      data: {
        ...convertKeys(updated),
        rules: convertKeys(updRules || []),
        exceptions: convertKeys(updExc || []),
      },
    });
  } catch (err) { return next(err); }
}

async function deleteSchedule(req, res, next) {
  try {
    const { data: existing } = await supabase
      .from('schedules').select('id').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!existing) throw new NotFoundError('Horario no encontrado.');

    // Check it's not in use by a type
    const { data: types } = await supabase
      .from('autoagenda_types').select('id').eq('schedule_id', req.params.id).limit(1);
    if (types?.length) throw new AppError('No se puede eliminar: el horario está en uso por un tipo de cita.', 400);

    await supabase.from('schedules').delete().eq('id', req.params.id);
    return res.json({ success: true, data: null });
  } catch (err) { return next(err); }
}

async function _replaceRulesAndExceptions(scheduleId, rules, exceptions) {
  await supabase.from('schedule_rules').delete().eq('schedule_id', scheduleId);
  await supabase.from('schedule_exceptions').delete().eq('schedule_id', scheduleId);

  if (rules.length) {
    const rows = rules.map(r => ({
      schedule_id: scheduleId,
      day_of_week: Number(r.dayOfWeek),
      start_time:  r.startTime,
      end_time:    r.endTime,
    }));
    const { error } = await supabase.from('schedule_rules').insert(rows);
    if (error) throw error;
  }

  if (exceptions.length) {
    const rows = exceptions.map(e => ({
      schedule_id: scheduleId,
      date:        e.date,
      is_blocked:  Boolean(e.isBlocked ?? true),
      start_time:  e.startTime || null,
      end_time:    e.endTime   || null,
    }));
    const { error } = await supabase.from('schedule_exceptions').insert(rows);
    if (error) throw error;
  }
}

// ---------- TYPES ----------

async function listTypes(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('autoagenda_types')
      .select('*, service:services(name), schedule:schedules(name)')
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return res.json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}

async function getType(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('autoagenda_types')
      .select('*, service:services(name), schedule:schedules(name)')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundError('Tipo de cita no encontrado.');
    return res.json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}

async function createType(req, res, next) {
  try {
    const {
      title, description, scheduleId, serviceId,
      durationMinutes = 30, googleCalendarId,
      minHoursBeforeBooking = 0, maxDaysInFuture,
      maxConcurrentBookings = 1, extraQuestions = [],
    } = req.body;

    if (!title?.trim()) throw new ValidationError('El título es requerido.');
    if (!scheduleId)    throw new ValidationError('El horario es requerido.');

    // Validate schedule belongs to this tenant
    const { data: schedule } = await supabase
      .from('schedules').select('id').eq('id', scheduleId).eq('tenant_id', req.tenantId).maybeSingle();
    if (!schedule) throw new ValidationError('Horario inválido.');

    // Resolve or auto-create service
    let resolvedServiceId = serviceId || null;
    if (!resolvedServiceId) {
      // Auto-create a matching service
      const { data: svc, error: svcErr } = await supabase
        .from('services')
        .insert({ tenant_id: req.tenantId, name: title.trim(), duration_minutes: Number(durationMinutes), price: 0 })
        .select().single();
      if (svcErr) throw svcErr;
      resolvedServiceId = svc.id;
    } else {
      const { data: svc } = await supabase
        .from('services').select('id').eq('id', resolvedServiceId).eq('tenant_id', req.tenantId).maybeSingle();
      if (!svc) throw new ValidationError('Servicio inválido.');
    }

    const { data, error } = await supabase.from('autoagenda_types').insert({
      tenant_id:                req.tenantId,
      service_id:               resolvedServiceId,
      schedule_id:              scheduleId,
      title:                    title.trim(),
      description:              description || null,
      duration_minutes:         Number(durationMinutes),
      google_calendar_id:       googleCalendarId || null,
      min_hours_before_booking: Number(minHoursBeforeBooking),
      max_days_in_future:       maxDaysInFuture ? Number(maxDaysInFuture) : null,
      max_concurrent_bookings:  Number(maxConcurrentBookings) || 1,
      extra_questions:          extraQuestions,
    }).select('*, service:services(name), schedule:schedules(name)').single();
    if (error) throw error;

    return res.status(201).json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}

async function updateType(req, res, next) {
  try {
    const { data: existing } = await supabase
      .from('autoagenda_types').select('id').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!existing) throw new NotFoundError('Tipo de cita no encontrado.');

    const ALLOWED = ['title', 'description', 'schedule_id', 'service_id', 'duration_minutes',
      'google_calendar_id', 'min_hours_before_booking', 'max_days_in_future',
      'max_concurrent_bookings', 'extra_questions'];

    const updates = {};
    const b = req.body;
    if (b.title !== undefined)                updates.title                    = b.title.trim();
    if (b.description !== undefined)           updates.description               = b.description;
    if (b.scheduleId !== undefined)            updates.schedule_id               = b.scheduleId;
    if (b.serviceId !== undefined)             updates.service_id                = b.serviceId;
    if (b.durationMinutes !== undefined)       updates.duration_minutes          = Number(b.durationMinutes);
    if (b.googleCalendarId !== undefined)      updates.google_calendar_id        = b.googleCalendarId || null;
    if (b.minHoursBeforeBooking !== undefined) updates.min_hours_before_booking  = Number(b.minHoursBeforeBooking);
    if (b.maxDaysInFuture !== undefined)       updates.max_days_in_future        = b.maxDaysInFuture ? Number(b.maxDaysInFuture) : null;
    if (b.maxConcurrentBookings !== undefined) updates.max_concurrent_bookings   = Number(b.maxConcurrentBookings) || 1;
    if (b.extraQuestions !== undefined)        updates.extra_questions           = b.extraQuestions;

    if (!Object.keys(updates).length) throw new AppError('No hay campos para actualizar.', 400);

    // Validate schedule if changed
    if (updates.schedule_id) {
      const { data: sched } = await supabase
        .from('schedules').select('id').eq('id', updates.schedule_id).eq('tenant_id', req.tenantId).maybeSingle();
      if (!sched) throw new ValidationError('Horario inválido.');
    }

    const { data, error } = await supabase
      .from('autoagenda_types').update(updates).eq('id', req.params.id)
      .select('*, service:services(name), schedule:schedules(name)').single();
    if (error) throw error;

    return res.json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}

async function deleteType(req, res, next) {
  try {
    const { data: existing } = await supabase
      .from('autoagenda_types').select('id').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!existing) throw new NotFoundError('Tipo de cita no encontrado.');
    await supabase.from('autoagenda_types').delete().eq('id', req.params.id);
    return res.json({ success: true, data: null });
  } catch (err) { return next(err); }
}

// ---------- GOOGLE CALENDARS ----------

async function getGoogleCalendars(req, res, next) {
  try {
    const { data: user } = await supabase
      .from('users').select('google_access_token').eq('id', req.userId).single();
    if (!user?.google_access_token) return res.json({ success: true, data: [] });

    const token = decrypt(user.google_access_token);
    const calendars = await listCalendars(token);
    return res.json({ success: true, data: calendars });
  } catch (err) { return next(err); }
}

module.exports = {
  getProfile, updateProfile, uploadProfileImage,
  listSchedules, getSchedule, createSchedule, updateSchedule, deleteSchedule,
  listTypes, getType, createType, updateType, deleteType,
  getGoogleCalendars,
};
