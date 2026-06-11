// apps/api/src/controllers/baileys.controller.js
const QRCode = require('qrcode');
const { startSession, stopSession, isConnected, onQR, onStatus } = require('../services/baileys-session');
const { supabase } = require('@autoagenda/db');
const logger = require('../config/logger');
const env = require('../config/env');

async function getStatus(req, res, next) {
  try {
    const connected = isConnected(req.tenantId);
    return res.json({ success: true, data: { connected } });
  } catch (err) { return next(err); }
}

async function connect(req, res, next) {
  try {
    if (!env.BAILEYS_ENABLED) {
      return res.status(503).json({ success: false, error: 'Baileys disabled in this environment' });
    }
    await startSession(req.tenantId);
    return res.json({ success: true });
  } catch (err) { return next(err); }
}

async function disconnect(req, res, next) {
  try {
    stopSession(req.tenantId);
    await supabase.from('baileys_sessions').delete().eq('tenant_id', req.tenantId);
    return res.json({ success: true });
  } catch (err) { return next(err); }
}

// SSE endpoint — streams QR codes and connection events
async function qrStream(req, res) {
  const tenantId = req.tenantId;

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  if (!env.BAILEYS_ENABLED) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: 'Baileys disabled in this environment' })}\n\n`);
    return res.end();
  }

  if (isConnected(tenantId)) {
    res.write('event: connected\ndata: {}\n\n');
    return res.end();
  }

  // Start session and wait for it to be added to the Map before subscribing
  try {
    await startSession(tenantId);
  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: 'Failed to start session' })}\n\n`);
    return res.end();
  }

  const removeQR = onQR(tenantId, async (qrRaw) => {
    try {
      const dataUrl = await QRCode.toDataURL(qrRaw);
      res.write(`event: qr\ndata: ${JSON.stringify({ qr: dataUrl })}\n\n`);
    } catch (qrErr) { logger.warn({ qrErr }, '[Baileys] QR encode failed'); }
  });

  const removeStatus = onStatus(tenantId, (status) => {
    res.write(`event: ${status}\ndata: {}\n\n`);
    if (status === 'connected' || status === 'disconnected') {
      cleanup();
      res.end();
    }
  });

  function cleanup() {
    removeQR();
    removeStatus();
  }

  req.on('close', cleanup);
}

module.exports = { getStatus, connect, disconnect, qrStream };
