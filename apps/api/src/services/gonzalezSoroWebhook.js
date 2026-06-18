const https = require('https');
const http = require('http');

/**
 * Fire-and-forget POST to GonzalezSoro webhook.
 * Never throws — logs on failure.
 */
async function notifyAppointment({ appointment, contact, service }) {
  const url = process.env.GONZALEZ_SORO_WEBHOOK_URL;
  const secret = process.env.AUTOAGENDA_WEBHOOK_SECRET;
  if (!url) return;

  const body = JSON.stringify({ appointment, contact, service });

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
          res.resume();
          res.on('end', resolve);
        }
      );
      req.on('error', reject);
      req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
      req.write(body);
      req.end();
    });
  } catch (err) {
    console.warn('[gonzalezSoroWebhook] failed:', err.message);
  }
}

module.exports = { notifyAppointment };
