const cron = require('node-cron');
const { supabase } = require('@autoagenda/db');
const logger = require('../config/logger');

async function deleteOldAppointments() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 1);

  const { error, count } = await supabase
    .from('appointments')
    .delete({ count: 'exact' })
    .lt('scheduled_at', cutoff.toISOString());

  if (error) {
    logger.error({ err: error.message }, 'appointmentCleanup: delete failed');
    return;
  }

  logger.info({ deleted: count, before: cutoff.toISOString() }, 'appointmentCleanup: old appointments deleted');
}

function startAppointmentCleanupCron() {
  // Run daily at 03:00 UTC
  cron.schedule('0 3 * * *', deleteOldAppointments, { timezone: 'UTC' });
  logger.info('Appointment cleanup cron scheduled (daily at 03:00 UTC)');
}

module.exports = { startAppointmentCleanupCron, deleteOldAppointments };
