// apps/api/src/services/baileys-session.js
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { supabase } = require('@autoagenda/db');
const { useSupabaseAuthState } = require('./baileys-auth-state');
const logger = require('../config/logger');

// tenantId -> { socket, qrCallbacks: Set<fn>, statusCallbacks: Set<fn>, lastQR: string|null }
const sessions = new Map();
const stoppedIntentionally = new Set();

async function startSession(tenantId) {
  // If already have an open socket, return it
  if (sessions.has(tenantId)) {
    const existing = sessions.get(tenantId);
    if (existing.socket?.user) return existing.socket; // already connected
    // If socket is null, a reconnect is already in progress — reuse the entry so callbacks survive
    if (existing.socket === null) return null;
    // Stale socket with no user — close it but keep callbacks
    try { existing.socket.end(undefined); } catch (_) {}
    existing.socket = null;
    existing.lastQR = null;
  }

  // Reuse existing entry (preserves qrCallbacks/statusCallbacks across reconnects) or create new
  const entry = sessions.get(tenantId) || { socket: null, qrCallbacks: new Set(), statusCallbacks: new Set(), lastQR: null };
  if (!sessions.has(tenantId)) sessions.set(tenantId, entry);

  const { state, saveCreds } = await useSupabaseAuthState(tenantId);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: logger.child({ baileys: tenantId, level: 'warn' }),
    browser: ['RecordAI', 'Chrome', '1.0'],
  });

  entry.socket = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      entry.lastQR = qr; // cache so late subscribers get it immediately
      for (const cb of entry.qrCallbacks) cb(qr);
    }

    if (connection === 'open') {
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
      const wasConnected = Boolean(entry.socket?.user);
      logger.warn({ tenantId, reason, wasConnected }, '[Baileys] Disconnected');

      const { error: updateErr } = await supabase
        .from('baileys_sessions')
        .update({ connected: false, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId);
      if (updateErr) logger.error({ tenantId, err: updateErr }, '[Baileys] Failed to update connected=false');

      const intentional = stoppedIntentionally.delete(tenantId);

      if (intentional || loggedOut) {
        // Truly done — notify frontend and clean up
        for (const cb of entry.statusCallbacks) cb('disconnected');
        sessions.delete(tenantId);
        if (loggedOut) {
          await supabase.from('baileys_sessions').delete().eq('tenant_id', tenantId);
        }
      } else {
        // QR expired or transient drop — null the socket, keep callbacks, reconnect silently
        entry.socket = null;
        entry.lastQR = null;
        if (wasConnected) {
          // Was actually in use — tell frontend it dropped
          for (const cb of entry.statusCallbacks) cb('disconnected');
        }
        setTimeout(() => startSession(tenantId), 5000);
      }
    }
  });

  return sock;
}

function stopSession(tenantId) {
  stoppedIntentionally.add(tenantId);
  const entry = sessions.get(tenantId);
  if (entry?.socket) {
    try { entry.socket.end(undefined); } catch (stopErr) { logger.warn({ stopErr }, '[Baileys] Error ending socket'); }
  }
  // Don't delete entry here — connection.update 'close' handler will clean up after firing 'disconnected'
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

module.exports = { startSession, stopSession, getSocket, isConnected, onQR, onStatus, restoreAllSessions };
