const cron = require('node-cron');
const { supabase } = require('@autoagenda/db');
const { sendDailyReport } = require('./sendDailyReport');
const logger = require('../config/logger');

/**
 * Checks if today is in the configured report days
 * @param {string} reportDaysStr - Comma-separated day numbers (0=Sunday, 1=Monday, etc.)
 * @returns {boolean}
 */
function isTodayInReportDays(reportDaysStr) {
  if (!reportDaysStr) return false;
  const today = new Date().getDay();
  const reportDays = reportDaysStr.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d));
  return reportDays.includes(today);
}

/**
 * Checks if current time matches the configured report time
 * Time format: "HH:00" (must end in :00)
 * @param {string} reportTime - Time in format "HH:00"
 * @param {string} timezone - Timezone for the tenant
 * @returns {boolean}
 */
function isTimeMatch(reportTime, timezone) {
  if (!reportTime) return false;

  // Time must end in :00
  if (!reportTime.endsWith(':00')) return false;

  const now = new Date();
  const localHour = now.toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
  });

  // Compare hour only: the cron fires a few minutes past the hour (see
  // startDailyReportCron), and reportTime's minute is always ':00' by
  // isValidReportTime, so matching the minute exactly would never fire.
  return localHour.split(':')[0] === reportTime.split(':')[0];
}

/**
 * Validates report time constraints
 * Morning: 06:00 - 10:00
 * Evening: 20:00 - 00:00 (12 AM midnight)
 * @param {string} time - Time in format "HH:00"
 * @param {string} type - 'morning' or 'evening'
 * @returns {boolean}
 */
function isValidReportTime(time, type) {
  if (!time || !time.endsWith(':00')) return false;
  
  const hour = parseInt(time.split(':')[0]);
  
  if (type === 'morning') {
    return hour >= 6 && hour <= 10;
  } else if (type === 'evening') {
    return hour >= 20 || hour === 0; // 20:00-23:00 or 00:00
  }
  
  return false;
}

/**
 * Runs hourly to check if any tenants should receive their daily report
 */
async function checkDailyReports() {
  logger.info('Checking for daily reports to send...');

  // admin_whatsapp can be stored as '' (cleared in settings) as well as null —
  // sendDailyReport treats both as "not configured", so this filter must match
  // or tenants with '' pass here and get silently dropped one level down.
  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, timezone, report_days, report_type, admin_daily_report_time, admin_whatsapp')
    .not('admin_whatsapp', 'is', null)
    .neq('admin_whatsapp', '');

  if (error) {
    logger.error({ err: error.message }, 'Failed to fetch tenants for daily reports');
    return;
  }

  for (const tenant of tenants || []) {
    const tz = tenant.timezone || 'America/Argentina/Buenos_Aires';
    const reportType = tenant.report_type || 'morning';
    const reportTime = tenant.admin_daily_report_time;

    if (!reportTime) {
      logger.debug({ tenantId: tenant.id }, '[DailyReport] Skip: no admin_daily_report_time');
      continue;
    }
    if (!isTodayInReportDays(tenant.report_days)) {
      logger.debug({ tenantId: tenant.id, report_days: tenant.report_days, today: new Date().getDay() }, '[DailyReport] Skip: today not in report_days');
      continue;
    }
    if (!isValidReportTime(reportTime, reportType)) {
      logger.warn({ tenantId: tenant.id, reportTime, reportType }, '[DailyReport] Skip: time not valid for report type');
      continue;
    }
    if (!isTimeMatch(reportTime, tz)) {
      logger.debug({ tenantId: tenant.id, reportTime, tz }, '[DailyReport] Skip: time mismatch');
      continue;
    }

    try {
      await sendDailyReport({ tenantId: tenant.id, reportType });
      logger.info({ tenantId: tenant.id, reportType, time: reportTime }, 'Daily report sent');
    } catch (err) {
      logger.error({ tenantId: tenant.id, err: err.message }, 'Failed to send daily report');
    }
  }

  logger.info('Daily report check completed.');
}

/**
 * Starts the cron job to check for daily reports every hour at minute 0
 */
function startDailyReportCron() {
  // Offset 5 min from dailyCalendarReminder's '0 * * * *' so the two hourly
  // crons don't burst Supabase queries in the same instant (root cause of a
  // transient tenant-fetch failure that got mislabeled as "not configured").
  cron.schedule('5 * * * *', checkDailyReports, { timezone: 'UTC' });
  logger.info('Daily report cron scheduled (hourly at :05)');
}

module.exports = { startDailyReportCron, checkDailyReports };
