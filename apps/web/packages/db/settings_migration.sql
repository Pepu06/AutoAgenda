-- RecordAI Settings Migration — run this in Supabase SQL Editor

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_whatsapp TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS time_format TEXT NOT NULL DEFAULT '24h';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS messaging_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'confirmation';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS send_timing_type TEXT NOT NULL DEFAULT 'hours_before';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS send_hours_before INTEGER NOT NULL DEFAULT 24;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS send_fixed_time TEXT NOT NULL DEFAULT '08:00';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS message_template TEXT DEFAULT 'Hola {{nombre_cliente}}! Te recordamos tu cita: {{fecha}} a las {{hora}}. Confirmá o cancelá aquí: {{link}}';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS confirm_reply_message TEXT DEFAULT 'Perfecto! Gracias por confirmar. Te esperamos!';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cancel_reply_message TEXT DEFAULT 'Entendido. Lamentamos que no puedas asistir. Contactanos para reprogramar.';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS admin_whatsapp TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS admin_alerts_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS admin_daily_report_time TEXT DEFAULT '08:00';

-- WasenderAPI per-tenant config
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wasender_api_key TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wasender_template TEXT;

-- Users: ensure Google OAuth columns exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
