const cron = require('node-cron');
const { supabase } = require('@recordai/db');
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
  const localTime = now.toLocaleTimeString('en-US', { 
    timeZone: timezone, 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });
  
  return localTime === reportTime;
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

  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, timezone, report_days, report_type, admin_daily_report_time, admin_whatsapp')
    .not('admin_whatsapp', 'is', null);

  if (error) {
    logger.error({ err: error.message }, 'Failed to fetch tenants for daily reports');
    return;
  }

  for (const tenant of tenants || []) {
    const tz = tenant.timezone || 'America/Argentina/Buenos_Aires';
    const reportType = tenant.report_type || 'morning';
    const reportTime = tenant.admin_daily_report_time;

    if (!reportTime) continue;
    if (!isTodayInReportDays(tenant.report_days)) continue;
    if (!isValidReportTime(reportTime, reportType)) continue;
    if (!isTimeMatch(reportTime, tz)) continue;

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
  // Run at minute 0 of every hour
  cron.schedule('0 * * * *', checkDailyReports, { timezone: 'UTC' });
  logger.info('Daily report cron scheduled (hourly at :00)');
}

module.exports = { startDailyReportCron, checkDailyReports };
