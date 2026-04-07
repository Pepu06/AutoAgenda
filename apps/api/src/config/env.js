require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../.env') });
const { z } = require('zod');

// Allow NEXT_PUBLIC_ prefix variants as fallback
process.env.GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET;

const envSchema = z.object({
  NODE_ENV:              z.enum(['development', 'production', 'test']).default('development'),
  PORT:                  z.coerce.number().default(3001),
  SUPABASE_URL:          z.string().url(),
  SUPABASE_SERVICE_KEY:  z.string().min(1),
  JWT_SECRET:            z.string().min(8),
  REDIS_URL:             z.string().optional().default(''),
  WHATSAPP_VERIFY_TOKEN:       z.string().optional().default('verify'),
  WHATSAPP_PHONE_NUMBER_ID:    z.string().min(1),
  WHATSAPP_ACCESS_TOKEN:       z.string().min(1),
  WHATSAPP_TEMPLATE_REMINDER:      z.string().optional().default('confirmacion_turnos'),
  WHATSAPP_TEMPLATE_CANCEL_ALERT:  z.string().optional().default('admin_cancelacion'),
  GOOGLE_CLIENT_ID:      z.string().min(1),
  GOOGLE_CLIENT_SECRET:  z.string().min(1),
  BASE_URL:              z.string().url().optional().default('http://localhost:3001'),
  CORS_ORIGIN:           z.string().optional().default('http://localhost:3000'),
  WASENDER_API_KEY:      z.string().optional().default(''),
  WASENDER_TEST_EMAIL:   z.string().optional().default('pedrogonzalezsoro@gmail.com'),
  MERCADOPAGO_ACCESS_TOKEN:    z.string().optional().default(''),
  MERCADOPAGO_WEBHOOK_SECRET:  z.string().optional().default(''),
  GOOGLE_DRIVE_REFRESH_TOKEN:  z.string().optional().default(''),
  GOOGLE_DRIVE_FOLDER_ID:      z.string().optional().default(''),
  ADMIN_PANEL_PASSWORD:        z.string().optional().default('autoagenda2026'),
  PAYMENT_CBU:                 z.string().optional().default(''),
  PAYMENT_ALIAS:               z.string().optional().default(''),
  GMAIL_USER:                  z.string().optional().default(''),
  GMAIL_APP_PASSWORD:          z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

module.exports = parsed.data;
