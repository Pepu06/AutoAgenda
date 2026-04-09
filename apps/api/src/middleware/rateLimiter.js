const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  message: { error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const confirmationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limit for public booking POST to prevent spam
const bookingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 5,
  message: { error: 'Demasiados intentos de reserva. Intenta de nuevo en un minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authLimiter, webhookLimiter, confirmationLimiter, bookingLimiter };
