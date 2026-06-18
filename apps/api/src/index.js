require('./config/sentry'); // Must be first — instruments before anything else
require('./config/env'); // Validate env vars at startup
const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
require('./workers/queue'); // Start workers
const { startDailyReminderCron } = require('./workers/dailyCalendarReminder');
const { startDailyReportCron } = require('./workers/dailyReportCron');
const { startMonthlyBillingCron } = require('./workers/monthlyBillingCron');
const { startSubscriptionRenewalCron } = require('./workers/subscriptionRenewalCron');
const { startCalendarWatchRenewalCron } = require('./workers/calendarWatchRenewalCron');
const { startAppointmentCleanupCron } = require('./workers/appointmentCleanupCron');
require('./services/baileys-session'); // registers module; sessions start lazily

logger.info(`[Boot] Queue: ${env.REDIS_URL ? 'enabled' : 'disabled'}`);

if (!env.REDIS_URL) {
  logger.warn('⚠️  REDIS_URL is not set — BullMQ reminder queue is DISABLED. Appointment reminders will NOT be sent.');
}

app.listen(env.PORT, () => {
  logger.info(`AutoAgenda API running on port ${env.PORT}`);
  startDailyReminderCron();
  startDailyReportCron();
  startMonthlyBillingCron();
  startSubscriptionRenewalCron();
  startCalendarWatchRenewalCron();
  startAppointmentCleanupCron();
  if (!env.BAILEYS_ENABLED) {
    logger.info('[Baileys] Disabled in this environment (BAILEYS_ENABLED=false)');
  }
  // Sessions start lazily (wake on demand). No bulk restore on boot — keeps RAM low on Railway.
});
