// Run: node apps/api/src/services/baileys-assumptions.test.js
//
// Pins the assumptions baileys-session.js makes about Baileys.
//
// === 1. A disconnect `reason` of 500 does not mean badSession ===
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

// === 2. Socket liveness is the WebSocket, not `.user` ===
//
// Baileys leaves `.user` set after the underlying WebSocket dies and only notices
// a silent drop on its next keep-alive sweep (30s interval, >35s of silence), so
// `.user` alone hands a zombie socket to sendMessage — the 428 Connection Closed
// seen in production. isSocketOpen/isSocketUsable must read the transport instead.
process.env.NODE_ENV ||= 'test'; // skips the production-only env requirements
process.env.SUPABASE_URL ||= 'http://localhost';
process.env.SUPABASE_SERVICE_KEY ||= 'test';
process.env.JWT_SECRET ||= 'x'.repeat(32);
process.env.WHATSAPP_PHONE_NUMBER_ID ||= 'test';
process.env.WHATSAPP_ACCESS_TOKEN ||= 'test';
process.env.GOOGLE_CLIENT_ID ||= 'test';
process.env.GOOGLE_CLIENT_SECRET ||= 'test';

const { isSocketOpen, isSocketUsable } = require('./baileys-session');

const socketWith = (ws) => ({ user: { id: '123' }, ws });
const OPEN = { isOpen: true, isClosed: false, isClosing: false };
const CLOSED = { isOpen: false, isClosed: true, isClosing: false };
const CLOSING = { isOpen: false, isClosed: false, isClosing: true };
const CONNECTING = { isOpen: false, isClosed: false, isClosing: false };

// The zombie: authenticated identity, dead transport. This is the whole bug.
assert.strictEqual(isSocketOpen(socketWith(CLOSED)), false, 'closed ws is not open despite .user');
assert.strictEqual(isSocketOpen(socketWith(CLOSING)), false, 'closing ws is not open');
assert.strictEqual(isSocketOpen(socketWith(OPEN)), true, 'open ws is open');
assert.strictEqual(isSocketOpen(null), false, 'no socket is not open');

// Usable keeps a still-connecting socket (awaiting QR) so pairing is not churned.
assert.strictEqual(isSocketUsable(socketWith(CONNECTING)), true, 'connecting ws stays reusable');
assert.strictEqual(isSocketUsable(socketWith(CLOSED)), false, 'closed ws is not reusable');
assert.strictEqual(isSocketUsable(socketWith(CLOSING)), false, 'closing ws is not reusable');
assert.strictEqual(isSocketUsable(null), false, 'no socket is not reusable');

// Fail-safe: a Baileys upgrade that renames the getters must degrade to the old
// identity-only behaviour, never mark every live socket dead and respawn on loop.
assert.strictEqual(isSocketOpen(socketWith({})), true, 'unknown ws shape assumed alive');
assert.strictEqual(isSocketOpen(socketWith(undefined)), true, 'missing ws assumed alive');
assert.strictEqual(isSocketUsable(socketWith({})), true, 'unknown ws shape assumed reusable');

console.log('OK — reason 500 is ambiguous, and socket liveness reads the WebSocket');
