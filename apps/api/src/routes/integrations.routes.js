const express = require('express');
const crypto = require('crypto');
const { supabase } = require('@autoagenda/db');
const { sendMessage } = require('../services/whatsapp');

const router = express.Router();

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// POST /integrations/send-whatsapp
// Called by GonzalezSoro to send a WhatsApp message via this tenant's Baileys session.
// Auth: X-Autoagenda-Secret header (shared secret).
router.post('/send-whatsapp', async (req, res) => {
  const secret = process.env.AUTOAGENDA_WEBHOOK_SECRET;
  // Fail closed: reject if the secret is unconfigured or the header doesn't match.
  if (!secret || !timingSafeEqual(req.headers['x-autoagenda-secret'] || '', secret)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'phone y message requeridos' });
  }

  // Find the tenant that has gonzalez_soro_whatsapp_enabled
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id')
    .eq('gonzalez_soro_whatsapp_enabled', true)
    .limit(1)
    .single();

  if (error || !tenant) {
    return res.status(503).json({ error: 'No hay tenant con WhatsApp habilitado para inmobiliaria' });
  }

  try {
    await sendMessage(tenant.id, phone, message);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[integrations/send-whatsapp]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
