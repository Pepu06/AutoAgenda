const { supabase, convertKeys } = require('@recordai/db');
const { AppError } = require('../errors');

const ALLOWED_FIELDS = [
  'business_name', 'contact_whatsapp', 'timezone', 'time_format',
  'messaging_enabled', 'message_template',
  'admin_whatsapp', 'admin_alerts_enabled', 'admin_daily_report_time',
  'reminder_type', 'reminder_time', 'admin_cancel_template',
  'report_days', 'report_morning_time', 'report_evening_time',
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
