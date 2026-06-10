-- Set all existing tenants to use Baileys and enable messaging
UPDATE tenants
SET
  whatsapp_provider = 'baileys',
  messaging_enabled = true
WHERE whatsapp_provider IS NULL OR whatsapp_provider != 'baileys';
