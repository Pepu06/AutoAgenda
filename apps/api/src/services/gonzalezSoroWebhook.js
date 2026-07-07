const https = require('https');
const http = require('http');
const logger = require('../config/logger');

async function notifyAppointment({ appointment, contact, service, tenant }) {
  const url = process.env.GONZALEZ_SORO_WEBHOOK_URL;
  const secret = process.env.AUTOAGENDA_WEBHOOK_SECRET;

  if (!url) {
    logger.warn({ appointmentId: appointment?.id }, '[GonzalezSoro] GONZALEZ_SORO_WEBHOOK_URL not configured');
    return;
  }

  const body = JSON.stringify({ appointment, contact, service, tenant });
  logger.info({ appointmentId: appointment?.id, tenant: tenant?.businessName }, '[GonzalezSoro] Sending webhook notification');

  try {
    await new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const lib = parsed.protocol === 'https:' ? https : http;
      const req = lib.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            ...(secret ? { 'x-autoagenda-secret': secret } : {}),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
            } else {
              logger.info({ appointmentId: appointment?.id, statusCode: res.statusCode }, '[GonzalezSoro] Webhook sent successfully');
              resolve();
            }
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(8000, () => { req.destroy(); reject(new Error('webhook timeout after 8s')); });
      req.write(body);
      req.end();
    });
  } catch (err) {
    logger.error({ appointmentId: appointment?.id, err: err.message }, '[GonzalezSoro] Webhook failed');
    throw err;
  }
}

module.exports = { notifyAppointment };
