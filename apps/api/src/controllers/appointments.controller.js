const { supabase, convertKeys } = require('@autoagenda/db');
const { AppError, NotFoundError, ValidationError } = require('../errors');
const logger = require('../config/logger');
const { appointmentsQueue } = require('../workers/queue');
const { JobName } = require('@autoagenda/shared');
const { updateEventColor, updateCalendarEventDateTime, refreshAccessToken, getCalendarEvents, deleteCalendarEvent } = require('../services/google');
const { getValidToken, getOwnerCalendarId } = require('./calendar.controller');
const { notifyAppointment } = require('../services/gonzalezSoroWebhook');

const APPOINTMENT_SELECT = '*, contact:contacts(*), service:services(*), user:users(*)';
const REMINDER_CONFIG_ERROR = 'Completá el Nombre del negocio en Configuración para poder crear citas y enviar recordatorios.';

function hasReminderConfig(tenant) {
  return Boolean(String(tenant?.business_name || '').trim());
}

// Reject contact/service ids that don't belong to the caller's tenant, so a
// tenant can't attach another tenant's contact/service to an appointment.
async function assertOwnedRefs(tenantId, { contactId, serviceId }) {
  if (contactId) {
    const { data } = await supabase
      .from('contacts').select('id').eq('id', contactId).eq('tenant_id', tenantId).maybeSingle();
    if (!data) throw new ValidationError('Contacto inválido');
  }
  if (serviceId) {
    const { data } = await supabase
      .from('services').select('id').eq('id', serviceId).eq('tenant_id', tenantId).maybeSingle();
    if (!data) throw new ValidationError('Servicio inválido');
  }
}

async function list(req, res, next) {
  try {
    const { date, status } = req.query;
    let query = supabase
      .from('appointments')
      .select(APPOINTMENT_SELECT)
      .eq('tenant_id', req.tenantId)
      .order('scheduled_at', { ascending: true });

    if (status) query = query.eq('status', status);
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      query = query.gte('scheduled_at', start.toISOString()).lt('scheduled_at', end.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;
    return res.json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}


async function create(req, res, next) {
  try {
    const { contactId, serviceId, scheduledAt, notes } = req.body;

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('business_name, message_template, gonzalez_soro_webhook_enabled')
      .eq('id', req.tenantId)
      .single();
    if (tenantError) throw tenantError;
    if (!hasReminderConfig(tenant)) throw new AppError(REMINDER_CONFIG_ERROR, 400);

    await assertOwnedRefs(req.tenantId, { contactId, serviceId });

    const { data, error } = await supabase
      .from('appointments')
      .insert({
        tenant_id:    req.tenantId,
        contact_id:   contactId,
        service_id:   serviceId,
        user_id:      req.userId,
        scheduled_at: new Date(scheduledAt).toISOString(),
        notes,
        status:       'sin_enviar',
      })
      .select(APPOINTMENT_SELECT)
      .single();
    if (error) throw error;

    // Fire-and-forget — no bloquea si Redis está caído
    const queueJob = (name, opts = {}) =>
      appointmentsQueue.add(name, { appointmentId: data.id }, opts).catch(() => {});

    queueJob(JobName.SEND_CONFIRMATION, { attempts: 5, backoff: { type: 'exponential', delay: 8000 } });

    console.log('[appointments] gonzalez_soro_webhook_enabled:', tenant.gonzalez_soro_webhook_enabled);
    if (tenant.gonzalez_soro_webhook_enabled) {
      notifyAppointment({
        appointment: { id: data.id, scheduledAt: data.scheduled_at, notes: data.notes },
        contact: { id: data.contact?.id, name: data.contact?.name, phone: data.contact?.phone, email: data.contact?.email, dni: data.contact?.dni },
        service: { id: data.service?.id, name: data.service?.name },
        tenant: { businessName: tenant.business_name },
      });
    }

    return res.status(201).json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}

async function getOne(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select(`${APPOINTMENT_SELECT}, message_logs:message_logs(*)`)
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundError('Appointment not found');
    return res.json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}

async function update(req, res, next) {
  try {
    const { data: existing } = await supabase
      .from('appointments').select('id').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!existing) throw new NotFoundError('Appointment not found');

    const { scheduledAt, status, notes, contactId, serviceId } = req.body;
    await assertOwnedRefs(req.tenantId, { contactId, serviceId });
    const updates = {
      ...(scheduledAt  && { scheduled_at: new Date(scheduledAt).toISOString() }),
      ...(status       && { status }),
      ...(notes !== undefined && { notes }),
      ...(contactId    && { contact_id: contactId }),
      ...(serviceId    && { service_id: serviceId }),
    };

    const { data, error } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', req.params.id)
      .select(APPOINTMENT_SELECT)
      .single();
    if (error) throw error;

    // Sync changes to Google Calendar if event is linked (best-effort, never blocks response)
    if (data.google_event_id && (updates.scheduled_at || updates.status)) {
      (async () => {
        try {
          const u = data.user;
          let token = u?.google_access_token;
          if (!token) return;
          const test = await getCalendarEvents(token, { days: 1 });
          if (test === null && u.google_refresh_token) {
            token = await refreshAccessToken(u.google_refresh_token);
            await supabase.from('users').update({ google_access_token: token }).eq('id', req.userId);
          }
          if (updates.scheduled_at) {
            const start = new Date(updates.scheduled_at);
            const durationMin = data.service?.duration_minutes ?? data.service?.duration ?? 60;
            const end = new Date(start.getTime() + durationMin * 60 * 1000);
            await updateCalendarEventDateTime(token, data.google_event_id, start.toISOString(), end.toISOString());
          }
          if (updates.status) {
            await updateEventColor(token, data.google_event_id, updates.status);
          }
        } catch (e) {
          logger.warn({ err: e }, '[GCal] Failed to sync appointment update');
        }
      })();
    }

    const { data: tenantData } = await supabase.from('tenants').select('business_name, gonzalez_soro_webhook_enabled').eq('id', req.tenantId).single();
    if (tenantData?.gonzalez_soro_webhook_enabled) {
      notifyAppointment({
        appointment: { id: data.id, scheduledAt: data.scheduled_at, notes: data.notes },
        contact: { id: data.contact?.id, name: data.contact?.name, phone: data.contact?.phone, email: data.contact?.email, dni: data.contact?.dni },
        service: { id: data.service?.id, name: data.service?.name },
        tenant: { businessName: tenantData.business_name },
      });
    }

    return res.json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}

async function remove(req, res, next) {
  try {
    const { data: existing } = await supabase
      .from('appointments').select('id, google_event_id, user_id').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!existing) throw new NotFoundError('Appointment not found');

    await supabase.from('message_logs').delete().eq('appointment_id', req.params.id).eq('tenant_id', req.tenantId);

    const { error } = await supabase.from('appointments').delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) throw error;

    if (existing.google_event_id) {
      (async () => {
        try {
          const accessToken = await getValidToken(existing.user_id);
          if (!accessToken) return;
          const calendarId = await getOwnerCalendarId(req.tenantId);
          await deleteCalendarEvent(accessToken, existing.google_event_id, calendarId);
        } catch (e) {
          logger.warn({ err: e }, '[GCal] Failed to delete calendar event on appointment remove');
        }
      })();
    }

    return res.json({ success: true, data: null });
  } catch (err) { return next(err); }
}

async function updateTransfer(req, res, next) {
  try {
    const { data: existing } = await supabase
      .from('appointments').select('id').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!existing) throw new NotFoundError('Cita no encontrada.');

    const { transferConfirmed } = req.body;
    const { data, error } = await supabase
      .from('appointments')
      .update({ transfer_confirmed: Boolean(transferConfirmed) })
      .eq('id', req.params.id)
      .select('id, transfer_confirmed')
      .single();
    if (error) throw error;
    return res.json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}

module.exports = { list, create, getOne, update, remove, updateTransfer };
