const express = require('express');
const crypto = require('crypto');
const { supabase } = require('@autoagenda/db');
const { dispatch } = require('../services/whatsapp');

const router = express.Router();

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// POST /integrations/send-whatsapp
// Called by GonzalezSoro to send a WhatsApp message via a tenant's Baileys session.
// Auth: X-Autoagenda-Secret header — matched per-tenant against tenants.gonzalez_soro_webhook_secret
// (each tenant that enables this integration has its own secret).
router.post('/send-whatsapp', async (req, res) => {
  const providedSecret = req.headers['x-autoagenda-secret'];
  if (!providedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'phone y message requeridos' });
  }

  const { data: candidates, error } = await supabase
    .from('tenants')
    .select('id, whatsapp_provider, wasender_api_key, gonzalez_soro_webhook_secret')
    .eq('gonzalez_soro_whatsapp_enabled', true)
    .not('gonzalez_soro_webhook_secret', 'is', null);

  if (error) {
    console.error('[integrations/send-whatsapp]', error.message);
    return res.status(500).json({ error: error.message });
  }

  const tenant = (candidates || []).find(t => timingSafeEqual(providedSecret, t.gonzalez_soro_webhook_secret));

  if (!tenant) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await dispatch(tenant.id, phone, message, {
      provider:         tenant.whatsapp_provider || 'baileys',
      wasender_api_key: tenant.wasender_api_key,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[integrations/send-whatsapp]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
