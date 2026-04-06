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

const SELECT_COLS = ['id', 'name', 'slug', ...ALLOWED_FIELDS].join(', ');

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

module.exports = { getSettings, updateSettings };
