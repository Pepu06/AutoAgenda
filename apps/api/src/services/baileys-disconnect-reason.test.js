// Run: node apps/api/src/services/baileys-disconnect-reason.test.js
//
// Pins the trap that caused a bad fix: the `reason` computed in
// baileys-session.js's 'close' handler is NOT a reliable badSession signal.
// `new Boom(err)` maps any non-Boom error — including the plain Error that
// invalidateSocket() passes to sock.end(), and `undefined` from a bare end() —
// to statusCode 500, which is also DisconnectReason.badSession.
//
// Treating reason === 500 as badSession therefore deletes the tenant's stored
// WhatsApp credentials every time we cycle a socket ourselves, forcing a QR
// re-scan on every transient send error.
const assert = require('assert');
const { Boom } = require('@hapi/boom');
const { DisconnectReason } = require('@whiskeysockets/baileys');

const reasonOf = (err) => new Boom(err)?.output?.statusCode;

// What invalidateSocket() actually passes to sock.end().
assert.strictEqual(
  reasonOf(new Error('Stale socket invalidated after send timeout')),
  500,
  'plain Error must map to 500'
);

// What _spawnSocket()/stopSession() pass: sock.end(undefined).
assert.strictEqual(reasonOf(undefined), 500, 'bare end() must map to 500');

// The collision that makes reason===500 unusable as a badSession test.
assert.strictEqual(
  DisconnectReason.badSession,
  500,
  'badSession is 500 — indistinguishable from our own closes'
);

// A real Boom from Baileys keeps its own status, so those stay distinguishable.
assert.strictEqual(
  reasonOf(new Boom('Connection Closed', { statusCode: DisconnectReason.connectionClosed })),
  428,
  'genuine Baileys Boom must keep its statusCode'
);
assert.strictEqual(
  reasonOf(new Boom('Logged Out', { statusCode: DisconnectReason.loggedOut })),
  DisconnectReason.loggedOut,
  'loggedOut must stay distinguishable — it is the only safe creds-wipe trigger'
);

console.log('OK — reason 500 is ambiguous; do not treat it as badSession');
