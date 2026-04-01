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
  WHATSAPP_TEMPLATE_REMINDER:  z.string().optional().default('confirmacion_turnos'),
  GOOGLE_CLIENT_ID:      z.string().min(1),
  GOOGLE_CLIENT_SECRET:  z.string().min(1),
  BASE_URL:              z.string().url().optional().default('http://localhost:3001'),
  CORS_ORIGIN:           z.string().optional().default('http://localhost:3000'),
  WASENDER_API_KEY:      z.string().optional().default(''),
  WASENDER_TEST_EMAIL:   z.string().optional().default('pedrogonzalezsoro@gmail.com'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

module.exports = parsed.data;
