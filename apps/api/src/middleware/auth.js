const jwt = require('jsonwebtoken');
const env = require('../config/env');
const logger = require('../config/logger');
const { UnauthorizedError } = require('../errors');

function authenticate(req, _res, next) {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  // Query-string tokens leak into logs/Referer; only allow them on the SSE
  // QR stream, where EventSource cannot set an Authorization header.
  const isSseQr = req.originalUrl.startsWith('/baileys/qr');
  const token = bearer || (isSseQr ? req.query.token : null);

  if (!token) {
    return next(new UnauthorizedError('Missing or invalid authorization header'));
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    req.tenantId = payload.tenantId;
    req.userId = payload.userId;
    req.role = payload.role;
    return next();
  } catch {
    logger.warn({ ip: req.ip, path: req.originalUrl }, 'authentication_failed');
    return next(new UnauthorizedError('Invalid or expired token'));
  }
}

module.exports = authenticate;
