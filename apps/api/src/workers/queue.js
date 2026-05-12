const env = require('../config/env');
const logger = require('../config/logger');

// Si no hay REDIS_URL configurada, exportar una queue mock que no hace nada
if (!env.REDIS_URL) {
  logger.warn('REDIS_URL not set — job queue disabled');
  module.exports = { appointmentsQueue: { add: async () => {} } };
  return;
}

const { Queue, Worker } = require('bullmq');
const { JobName } = require('@autoagenda/shared');

const connection = {
  url: env.REDIS_URL,
  maxRetriesPerRequest: null,
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 100, 3000),
  reconnectOnError: () => true,
};

const appointmentsQueue = new Queue('appointments', { connection });

// Verify Redis connectivity at startup
appointmentsQueue.waitUntilReady().then(() => {
  logger.info('[Queue] Redis connected');
}).catch((err) => {
  logger.error({ err }, '[Queue] Redis connection failed');
});

const worker = new Worker(
  'appointments',
  async (job) => {
    switch (job.name) {
      case JobName.SEND_CONFIRMATION: {
        const { sendConfirmation } = require('./sendConfirmation');
        await sendConfirmation(job.data);
        break;
      }
case JobName.SEND_FOLLOW_UP: {
        const { sendFollowUp } = require('./sendFollowUp');
        await sendFollowUp(job.data);
        break;
      }
      default:
        logger.warn({ jobName: job.name }, 'Unknown job type');
    }
  },
  { connection }
);

worker.on('completed', (job) => logger.info({ jobId: job.id, jobName: job.name }, 'Job completed'));
worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Job failed'));
worker.on('error', (err) => logger.error({ err }, '[Queue] Worker error'));

appointmentsQueue.on('error', (err) => logger.error({ err }, '[Queue] Queue error'));

module.exports = { appointmentsQueue };
