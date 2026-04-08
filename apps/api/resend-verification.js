/**
 * Manually resend verification email
 * Usage: node resend-verification.js <email>
 */

// Load env FIRST before any imports
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { sendEmail } = require('./src/services/email');
const env = require('./src/config/env');

// Create supabase client directly here
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

const email = process.argv[2];

if (!email) {
  console.error('❌ Usage: node resend-verification.js <email>');
  process.exit(1);
}

async function resendVerification() {
  try {
    // Find user
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, email_verified')
      .eq('email', email)
      .maybeSingle();

    if (error) throw error;
    if (!user) {
      console.error(`❌ User not found: ${email}`);
      process.exit(1);
    }

    if (user.email_verified) {
      console.log(`✅ User ${email} is already verified!`);
      process.exit(0);
    }

    console.log(`📧 Generating verification token for: ${email}`);

    // Generate new token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Update user
    const { error: updateError } = await supabase.from('users').update({
      email_verification_token_hash: tokenHash,
      email_verification_expires_at: expiresAt,
    }).eq('id', user.id);

    if (updateError) throw updateError;

    const verifyUrl = `${env.CORS_ORIGIN}/verify-email?token=${rawToken}`;

    console.log('🔗 Verification URL:');
    console.log(`   ${verifyUrl}`);
    console.log('');

    // Send email
    console.log('📬 Sending email...');
    const info = await sendEmail({
      to: email,
      subject: 'Verificá tu email — AutoAgenda',
      text: `Bienvenido a AutoAgenda. Para verificar tu email hacé clic en el siguiente enlace (válido por 24 horas):\n\n${verifyUrl}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Bienvenido a AutoAgenda</h2>
          <p>Para verificar tu email hacé clic en el siguiente botón:</p>
          <p style="margin: 30px 0;">
            <a href="${verifyUrl}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Verificar Email
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">
            O copiá y pegá este enlace en tu navegador:<br>
            <a href="${verifyUrl}">${verifyUrl}</a>
          </p>
          <p style="color: #999; font-size: 12px; margin-top: 40px;">
            Este enlace es válido por 24 horas.
          </p>
        </div>
      `,
    });

    console.log('✅ Email sent successfully!');
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Response: ${info.response}`);
    console.log('');
    console.log('📬 Check your inbox (and spam folder!)');
    console.log('');
    console.log('⚠️  IMPORTANT CHECKS:');
    console.log('   1. Check SPAM/JUNK folder');
    console.log('   2. Look for sender: infoautoagenda@gmail.com');
    console.log('   3. Check "Promotions" or "Updates" tab (Gmail)');
    console.log('   4. Add infoautoagenda@gmail.com to contacts');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

resendVerification();
