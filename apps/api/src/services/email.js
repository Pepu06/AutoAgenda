const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../config/logger');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
      throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD not configured');
    }
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: env.GMAIL_USER,
        pass: env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

/**
 * Send an email via Gmail.
 * @param {object} opts
 * @param {string} opts.to - Recipient email
 * @param {string} opts.subject - Subject line
 * @param {string} opts.text - Plain text body
 * @param {string} [opts.html] - Optional HTML body
 */
async function sendEmail({ to, subject, text, html }) {
  const t = getTransporter();

  const info = await t.sendMail({
    from: `AutoAgenda <${env.GMAIL_USER}>`,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
  });

  logger.info({ to, subject, messageId: info.messageId }, '[Email] Sent');
  return info;
}

module.exports = { sendEmail };
