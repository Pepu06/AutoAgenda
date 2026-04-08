const { supabase, convertKeys } = require('@autoagenda/db');
const { AppError } = require('../errors');

const ALLOWED_FIELDS = [
  'business_name', 'timezone', 'time_format',
  'messaging_enabled', 'message_template',
  'whatsapp_provider', 'whatsapp_phone_number_id', 'whatsapp_access_token', 'wasender_api_key',
  'admin_whatsapp', 'admin_alerts_enabled', 'admin_daily_report_time',
  'reminder_type', 'reminder_time',
  'report_days', 'report_type',
  'wasender_connected',
  'location_mode', 'location',
  'confirm_reply_message', 'cancel_reply_message',
];

const SELECT_COLS = ['id', 'name', ...ALLOWED_FIELDS].join(', ');

async function getSettings(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select(SELECT_COLS)
      .eq('id', req.tenantId)
      .single();

    if (error) throw error;
    return res.json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}

async function updateSettings(req, res, next) {
  try {
    const updates = {};
    for (const field of ALLOWED_FIELDS) {
      if (field in req.body) updates[field] = req.body[field];
    }

    if (!Object.keys(updates).length) throw new AppError('No valid fields provided', 400);

    // Auto-sync wasender_connected based on whatsapp_provider
    if ('whatsapp_provider' in updates) {
      updates.wasender_connected = updates.whatsapp_provider === 'wasender';
    }

    // Validar configuración completa antes de activar el motor de mensajes
    if (updates.messaging_enabled === true) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('business_name, message_template')
        .eq('id', req.tenantId)
        .single();

      const missing = [];
      const businessName = String(updates.business_name || tenant?.business_name || '').trim();
      const messageTemplate = String(updates.message_template || tenant?.message_template || '').trim();

      if (!businessName) missing.push('Nombre del negocio');
      if (!messageTemplate) missing.push('Mensaje personalizable');

      if (missing.length > 0) {
        throw new AppError(
          `Para activar el motor de mensajes, completá primero: ${missing.join(', ')}.`,
          400
        );
      }
    }

    const { data, error } = await supabase
      .from('tenants')
      .update(updates)
      .eq('id', req.tenantId)
      .select(SELECT_COLS)
      .single();

    if (error) throw error;
    return res.json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}

async function deleteAccount(req, res, next) {
  try {
    const tenantId = req.tenantId;

    // Delete in dependency order
    await supabase.from('message_logs').delete().eq('tenant_id', tenantId);
    await supabase.from('appointments').delete().eq('tenant_id', tenantId);
    await supabase.from('contacts').delete().eq('tenant_id', tenantId);
    await supabase.from('services').delete().eq('tenant_id', tenantId);
    await supabase.from('users').delete().eq('tenant_id', tenantId);
    await supabase.from('tenants').delete().eq('id', tenantId);

    return res.json({ success: true });
  } catch (err) { return next(err); }
}

async function getOnboarding(req, res, next) {
  try {
    const [tenantResult, userResult, servicesResult] = await Promise.all([
      supabase
        .from('tenants')
        .select('business_name, message_template, messaging_enabled, onboarding_completed, onboarding_step')
        .eq('id', req.tenantId)
        .single(),
      supabase
        .from('users')
        .select('google_refresh_token')
        .eq('id', req.userId)
        .single(),
      supabase
        .from('services')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', req.tenantId),
    ]);

    if (tenantResult.error) throw tenantResult.error;

    const tenant = tenantResult.data;
    const user = userResult.data;
    const serviceCount = servicesResult.count || 0;

    const steps = {
      business_info:    { done: Boolean(String(tenant.business_name || '').trim()) },
      google_calendar:  { done: Boolean(user?.google_refresh_token) },
      calendar_format:  { done: (tenant.onboarding_step || 0) >= 3 },
      first_service:    { done: serviceCount > 0 },
      message_template: { done: Boolean(String(tenant.message_template || '').trim()) },
      enable_messaging: { done: tenant.messaging_enabled === true },
    };

    const completedCount = Object.values(steps).filter(s => s.done).length;

    return res.json({
      success: true,
      data: {
        completed: tenant.onboarding_completed === true,
        currentStep: tenant.onboarding_step || 0,
        completedCount,
        totalSteps: 6,
        steps,
      },
    });
  } catch (err) { return next(err); }
}

async function updateOnboarding(req, res, next) {
  try {
    const updates = {};
    if (typeof req.body.step === 'number') updates.onboarding_step = req.body.step;
    if (req.body.completed === true) updates.onboarding_completed = true;

    if (!Object.keys(updates).length) throw new AppError('No valid fields provided', 400);

    const { error } = await supabase
      .from('tenants')
      .update(updates)
      .eq('id', req.tenantId);

    if (error) throw error;
    return res.json({ success: true });
  } catch (err) { return next(err); }
}

module.exports = { getSettings, updateSettings, deleteAccount, getOnboarding, updateOnboarding };
