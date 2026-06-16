const { supabase } = require('@autoagenda/db');
const { sendMessage } = require('../services/whatsapp');
const logger = require('../config/logger');

const STATUS_EMOJI = {
  sin_enviar: '🟡',
  pending:    '⏳',
  notified:   '📬',
  confirmed:  '✅',
  cancelled:  '❌',
};

const STATUS_LABEL = {
  sin_enviar: 'Sin enviar',
  pending:    'Pendiente',
  notified:   'Notificado',
  confirmed:  'Confirmado',
  cancelled:  'Cancelado',
};

async function sendDailyReport({ tenantId, reportType }) {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('admin_whatsapp, business_name, timezone, time_format')
    .eq('id', tenantId)
    .maybeSingle();

  if (!tenant?.admin_whatsapp) {
    logger.warn({ tenantId }, '[DailyReport] No admin WhatsApp configured');
    return;
  }

  const tz = tenant.timezone || 'America/Argentina/Buenos_Aires';
  const now = new Date();

  // Morning → today's agenda. Evening → tomorrow's preview.
  const localNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const targetDate = new Date(localNow);
  if (reportType === 'evening') targetDate.setDate(targetDate.getDate() + 1);

  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  // Convert local midnight boundaries to UTC for the query
  const startUTC = new Date(dayStart.toLocaleString('en-US', { timeZone: tz }));
  const endUTC   = new Date(dayEnd.toLocaleString('en-US', { timeZone: tz }));

  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('id, scheduled_at, status, notes, contact:contacts(name, phone), service:services(name)')
    .eq('tenant_id', tenantId)
    .not('status', 'eq', 'cancelled')
    .gte('scheduled_at', startUTC.toISOString())
    .lte('scheduled_at', endUTC.toISOString())
    .order('scheduled_at', { ascending: true });

  if (error) {
    logger.error({ tenantId, err: error.message }, '[DailyReport] Error al traer turnos');
    return;
  }

  const dateLabel = targetDate.toLocaleDateString('es-AR', {
    timeZone: tz, weekday: 'long', day: 'numeric', month: 'long',
  });

  const header = reportType === 'morning'
    ? `📋 *Agenda del día — ${dateLabel}*`
    : `🌙 *Agenda de mañana — ${dateLabel}*`;

  const adminPhones = tenant.admin_whatsapp.split(',').map(n => n.trim()).filter(Boolean);

  if (!appointments?.length) {
    const text = `${header}\n\nNo hay turnos agendados para este día. 🗓️`;
    for (const phone of adminPhones) {
      await sendMessage(tenantId, phone, text).catch(err =>
        logger.warn({ tenantId, phone, err: err.message }, '[DailyReport] Error al enviar reporte vacío')
      );
    }
    return;
  }

  let body = `${header}\n\n`;
  body += `Total: *${appointments.length} turno${appointments.length !== 1 ? 's' : ''}*\n\n`;

  appointments.forEach((appt, i) => {
    const hora = new Date(appt.scheduled_at).toLocaleTimeString('es-AR', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const emoji = STATUS_EMOJI[appt.status] || '•';
    const estado = STATUS_LABEL[appt.status] || appt.status;

    body += `*${i + 1}. ${hora} — ${appt.contact.name}*\n`;
    body += `   💼 ${appt.service.name}\n`;
    body += `   ${emoji} ${estado}\n`;
    if (appt.notes) body += `   📝 ${appt.notes}\n`;
    body += '\n';
  });

  // Summary counts
  const counts = {};
  for (const appt of appointments) counts[appt.status] = (counts[appt.status] || 0) + 1;
  const summaryParts = Object.entries(counts)
    .map(([s, n]) => `${STATUS_EMOJI[s] || '•'} ${STATUS_LABEL[s] || s}: ${n}`)
    .join('  ·  ');
  body += `📊 ${summaryParts}`;

  for (const phone of adminPhones) {
    await sendMessage(tenantId, phone, body).catch(err =>
      logger.warn({ tenantId, phone, err: err.message }, '[DailyReport] Error al enviar reporte')
    );
  }

  logger.info({ tenantId, reportType, count: appointments.length }, '[DailyReport] Reporte enviado');
}

module.exports = { sendDailyReport };
