const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { UnauthorizedError } = require('../errors');

function authenticate(req, _res, next) {
  const token =
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null) || req.query.token;

  if (!token) {
    return next(new UnauthorizedError('Missing or invalid authorization header'));
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    req.tenantId = payload.tenantId;
    req.userId = payload.userId;
    req.role = payload.role;
    return next();
  } catch {
    return next(new UnauthorizedError('Invalid or expired token'));
  }
}

module.exports = authenticate;
