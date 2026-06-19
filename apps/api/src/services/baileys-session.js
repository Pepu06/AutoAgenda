// apps/api/src/services/baileys-session.js
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { supabase } = require('@autoagenda/db');
const { useSupabaseAuthState } = require('./baileys-auth-state');
const logger = require('../config/logger');

// tenantId -> entry. Only ONE socket per tenant may be live at a time; the
// `epoch` token guarantees stale sockets can neither persist creds nor schedule
// reconnects (prevents WA 440 conflicts and auth-state corruption).
const sessions = new Map();
const stoppedIntentionally = new Set();
// Tenants being put to sleep: close without reconnect and without clearing DB creds.
const sleepingTenants = new Set();

// After this many ms of no inbound/outbound activity the session is slept to free RAM.
const INACTIVITY_MS = 15 * 60 * 1000; // 15 minutes

const MAX_RECONNECT_DELAY = 60_000;

function getEntry(tenantId) {
  let entry = sessions.get(tenantId);
  if (!entry) {
    entry = {
      socket: null,
      epoch: 0,            // bumps each socket generation; stale handlers self-cancel
      starting: null,      // in-flight start promise (single-flight guard)
      reconnectTimer: null,
      inactivityTimer: null, // cleared on any message activity, triggers sleepSession on expiry
      retries: 0,
      qrCallbacks: new Set(),
      statusCallbacks: new Set(),
      lastQR: null,
    };
    sessions.set(tenantId, entry);
  }
  return entry;
}

async function startSession(tenantId) {
  const entry = getEntry(tenantId);

  if (entry.socket?.user) return entry.socket; // already connected
  if (entry.starting) return entry.starting;   // a start is already running — await it
  if (entry.socket) return entry.socket;        // connecting (awaiting QR scan) — reuse, don't churn

  entry.starting = _spawnSocket(tenantId, entry).finally(() => {
    entry.starting = null;
  });
  return entry.starting;
}

async function _spawnSocket(tenantId, entry) {
  if (entry.reconnectTimer) {
    clearTimeout(entry.reconnectTimer);
    entry.reconnectTimer = null;
  }

  // Supersede any prior socket FIRST so its handlers/persists are ignored.
  const myEpoch = ++entry.epoch;
  const isActive = () => entry.epoch === myEpoch;

  if (entry.socket) {
    const old = entry.socket;
    entry.socket = null;
    try { old.ev.removeAllListeners('connection.update'); } catch (_) { /* already torn down */ }
    try { old.ev.removeAllListeners('creds.update'); } catch (_) { /* already torn down */ }
    try { old.end(undefined); } catch (_) { /* already closed */ }
  }
  entry.lastQR = null;

  const { state, saveCreds } = await useSupabaseAuthState(tenantId, isActive);
  const { version } = await fetchLatestBaileysVersion();

  // A newer start may have superseded us while awaiting — bail out.
  if (!isActive()) return null;

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    fireInitQueries: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    logger: logger.child({ baileys: tenantId }, { level: 'warn' }),
    browser: Browsers.ubuntu('Chrome'),
  });

  entry.socket = sock;

  sock.ev.on('creds.update', saveCreds);

  // Reset inactivity timer on any received message.
  sock.ev.on('messages.upsert', () => {
    if (!isActive()) return;
    resetInactivityTimer(tenantId);
  });

  sock.ev.on('connection.update', async (update) => {
    if (!isActive()) return; // stale socket generation — ignore everything
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      entry.lastQR = qr; // cache so late subscribers get it immediately
      for (const cb of entry.qrCallbacks) cb(qr);
    }

    if (connection === 'open') {
      entry.retries = 0; // healthy connection resets backoff
      resetInactivityTimer(tenantId);
      logger.info({ tenantId }, '[Baileys] Connected');
      const { error: upsertErr } = await supabase
        .from('baileys_sessions')
        .upsert({ tenant_id: tenantId, connected: true, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' });
      if (upsertErr) logger.error({ tenantId, err: upsertErr }, '[Baileys] Failed to update connected=true');
      for (const cb of entry.statusCallbacks) cb('connected');
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = reason === DisconnectReason.loggedOut;
      const wasConnected = Boolean(sock.user);
      logger.warn({ tenantId, reason, wasConnected }, '[Baileys] Disconnected');

      const { error: updateErr } = await supabase
        .from('baileys_sessions')
        .update({ connected: false, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId);
      if (updateErr) logger.error({ tenantId, err: updateErr }, '[Baileys] Failed to update connected=false');

      // Sleep path: free RAM without touching DB creds or notifying frontend.
      if (sleepingTenants.delete(tenantId)) {
        logger.info({ tenantId }, '[Baileys] Session asleep — RAM freed, creds intact');
        entry.epoch++;
        if (entry.reconnectTimer) { clearTimeout(entry.reconnectTimer); entry.reconnectTimer = null; }
        sessions.delete(tenantId);
        return;
      }

      const intentional = stoppedIntentionally.delete(tenantId);

      if (intentional || loggedOut) {
        // Truly done — notify frontend and clean up.
        entry.epoch++; // invalidate this generation
        if (entry.reconnectTimer) { clearTimeout(entry.reconnectTimer); entry.reconnectTimer = null; }
        for (const cb of entry.statusCallbacks) cb('disconnected');
        sessions.delete(tenantId);
        if (loggedOut) {
          await supabase.from('baileys_sessions').delete().eq('tenant_id', tenantId);
        }
        return;
      }

      // QR expired or transient drop — null the socket, keep callbacks, reconnect with backoff.
      entry.socket = null;
      entry.lastQR = null;
      if (wasConnected) {
        for (const cb of entry.statusCallbacks) cb('disconnected'); // was in use — tell frontend
      }

      // 515 = restartRequired (normal after pairing) — reconnect immediately so WA doesn't timeout.
      const delay = reason === DisconnectReason.restartRequired
        ? 0
        : Math.min(5000 * 2 ** entry.retries, MAX_RECONNECT_DELAY);
      entry.retries += 1;
      entry.reconnectTimer = setTimeout(() => {
        entry.reconnectTimer = null;
        startSession(tenantId).catch((err) =>
          logger.error({ tenantId, err }, '[Baileys] Reconnect failed')
        );
      }, delay);
    }
  });

  return sock;
}

// Resets (or starts) the inactivity countdown. Call after any send or receive.
function resetInactivityTimer(tenantId) {
  const entry = sessions.get(tenantId);
  if (!entry) return;
  if (entry.inactivityTimer) clearTimeout(entry.inactivityTimer);
  entry.inactivityTimer = setTimeout(() => {
    entry.inactivityTimer = null;
    sleepSession(tenantId);
  }, INACTIVITY_MS);
}

// Frees the socket from RAM without deleting credentials from the DB.
// The next sendMessage call will reconnect transparently (wake on demand).
function sleepSession(tenantId) {
  const entry = sessions.get(tenantId);
  if (!entry) return;

  logger.info({ tenantId }, '[Baileys] Sleeping session (inactivity timeout)');

  if (entry.inactivityTimer) { clearTimeout(entry.inactivityTimer); entry.inactivityTimer = null; }
  if (entry.reconnectTimer) { clearTimeout(entry.reconnectTimer); entry.reconnectTimer = null; }

  if (entry.socket) {
    sleepingTenants.add(tenantId);
    try { entry.socket.end(undefined); } catch (_) {}
  } else {
    // No live socket (e.g., mid-reconnect): invalidate and drop directly.
    entry.epoch++;
    sessions.delete(tenantId);
  }
}

// Ensures a connected socket exists, starting (or waking) the session if needed.
// Returns null if no credentials are stored or the tenant has never linked WhatsApp.
// Rejects on timeout so callers can fall through gracefully.
async function getOrConnectedSocket(tenantId, timeoutMs = 30_000) {
  // Fast path: already connected.
  if (isConnected(tenantId)) {
    resetInactivityTimer(tenantId);
    return getSocket(tenantId);
  }

  // Guard: don't spin up a socket that will just wait for a QR nobody will scan.
  const { data } = await supabase
    .from('baileys_sessions')
    .select('creds_json')
    .eq('tenant_id', tenantId)
    .single();

  if (!data?.creds_json) {
    logger.debug({ tenantId }, '[Baileys] No stored credentials — wake skipped');
    return null;
  }

  // Wake the session (or reuse an in-flight start).
  await startSession(tenantId);

  // Re-check: startSession may have connected synchronously from warm creds.
  if (isConnected(tenantId)) {
    resetInactivityTimer(tenantId);
    return getSocket(tenantId);
  }

  // Wait for the connection.update 'open' event with a hard timeout.
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      removeStatus();
      reject(new Error(`[Baileys] Wake timeout for tenant ${tenantId} after ${timeoutMs}ms`));
    }, timeoutMs);

    const removeStatus = onStatus(tenantId, (status) => {
      if (status === 'connected') {
        clearTimeout(timer);
        removeStatus();
        resetInactivityTimer(tenantId);
        resolve(getSocket(tenantId));
      } else if (status === 'disconnected') {
        clearTimeout(timer);
        removeStatus();
        resolve(null); // Creds invalid / logged out — caller will skip send.
      }
    });

    // The session may have died between startSession and onStatus (e.g. logged out
    // mid-wake), in which case onStatus registered on a now-deleted entry and no
    // event will ever fire. Bail out immediately instead of hanging until timeout.
    if (!sessions.has(tenantId)) {
      clearTimeout(timer);
      removeStatus();
      resolve(null);
    }
  });
}

function stopSession(tenantId) {
  const entry = sessions.get(tenantId);
  if (!entry) return;

  if (entry.reconnectTimer) { clearTimeout(entry.reconnectTimer); entry.reconnectTimer = null; }

  if (entry.socket) {
    // Live socket: mark intentional and end it; the 'close' handler cleans up the entry.
    stoppedIntentionally.add(tenantId);
    try { entry.socket.end(undefined); } catch (stopErr) { logger.warn({ stopErr }, '[Baileys] Error ending socket'); }
  } else {
    // Nothing live — invalidate any in-flight start and drop the entry directly so the
    // intentional flag can never leak into a future session.
    entry.epoch++;
    for (const cb of entry.statusCallbacks) cb('disconnected');
    sessions.delete(tenantId);
  }
}

function getSocket(tenantId) {
  return sessions.get(tenantId)?.socket ?? null;
}

function isConnected(tenantId) {
  const entry = sessions.get(tenantId);
  return Boolean(entry?.socket?.user);
}

function onQR(tenantId, callback) {
  if (!sessions.has(tenantId)) return () => {};
  const entry = sessions.get(tenantId);
  entry.qrCallbacks.add(callback);
  // Replay last QR immediately if available (avoids race between startSession and onQR)
  if (entry.lastQR) callback(entry.lastQR);
  return () => sessions.get(tenantId)?.qrCallbacks.delete(callback);
}

function onStatus(tenantId, callback) {
  if (!sessions.has(tenantId)) return () => {};
  sessions.get(tenantId).statusCallbacks.add(callback);
  return () => sessions.get(tenantId)?.statusCallbacks.delete(callback);
}

async function restoreAllSessions() {
  const { data: rows } = await supabase
    .from('baileys_sessions')
    .select('tenant_id, creds_json')
    .not('creds_json', 'is', null);

  if (!rows?.length) return;
  logger.info({ count: rows.length }, '[Baileys] Restoring sessions on boot');
  for (const row of rows) {
    startSession(row.tenant_id).catch((err) =>
      logger.error({ tenantId: row.tenant_id, err }, '[Baileys] Failed to restore session')
    );
  }
}

module.exports = {
  startSession,
  stopSession,
  sleepSession,
  getSocket,
  getOrConnectedSocket,
  resetInactivityTimer,
  isConnected,
  onQR,
  onStatus,
  restoreAllSessions,
};
