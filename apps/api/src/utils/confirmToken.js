const crypto = require('crypto');
const env = require('../config/env');

// Signed token bound to an appointment id, so confirm/cancel links can't be
// forged or replayed across appointments by guessing UUIDs. Derived from
// JWT_SECRET — rotating that secret invalidates outstanding links.
function confirmToken(appointmentId) {
  return crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(String(appointmentId))
    .digest('hex')
    .slice(0, 32);
}

function verifyConfirmToken(appointmentId, token) {
  const expected = confirmToken(appointmentId);
  const a = Buffer.from(String(token || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { confirmToken, verifyConfirmToken };

// ponytail: self-check — run `node src/utils/confirmToken.js` (needs JWT_SECRET).
if (require.main === module) {
  const assert = require('assert');
  const id = 'abc-123';
  const tok = confirmToken(id);
  assert(verifyConfirmToken(id, tok), 'valid token must verify');
  assert(!verifyConfirmToken(id, tok + 'x'), 'tampered token must fail');
  assert(!verifyConfirmToken('other-id', tok), 'token must not cross appointments');
  assert(!verifyConfirmToken(id, ''), 'empty token must fail');
  console.log('confirmToken self-check OK');
}
