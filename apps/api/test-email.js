/**
 * Test email sending functionality
 * Usage: node test-email.js <recipient-email>
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { sendEmail } = require('./src/services/email');

const recipientEmail = process.argv[2] || process.env.WASENDER_TEST_EMAIL;

if (!recipientEmail) {
  console.error('❌ Usage: node test-email.js <recipient-email>');
  process.exit(1);
}

console.log('📧 Testing email sending...');
console.log(`   From: ${process.env.GMAIL_USER}`);
console.log(`   To:   ${recipientEmail}`);
console.log('');

sendEmail({
  to: recipientEmail,
  subject: 'Test Email — AutoAgenda',
  text: 'Este es un email de prueba desde AutoAgenda.',
  html: '<p>Este es un <strong>email de prueba</strong> desde AutoAgenda.</p>',
})
  .then(info => {
    console.log('✅ Email sent successfully!');
    console.log('   Message ID:', info.messageId);
    console.log('   Response:', info.response);
    console.log('');
    console.log('📬 Check your inbox at:', recipientEmail);
    console.log('   (Also check spam/junk folder)');
  })
  .catch(err => {
    console.error('❌ Failed to send email:');
    console.error('   Error:', err.message);
    console.error('');
    
    if (err.message.includes('Invalid login')) {
      console.error('🔍 Possible issues:');
      console.error('   1. GMAIL_APP_PASSWORD is incorrect');
      console.error('   2. App passwords not enabled in Google Account');
      console.error('   3. 2FA not enabled (required for app passwords)');
      console.error('');
      console.error('📝 How to fix:');
      console.error('   1. Go to: https://myaccount.google.com/apppasswords');
      console.error('   2. Create new app password');
      console.error('   3. Update GMAIL_APP_PASSWORD in .env (remove spaces)');
    }
    
    if (err.code === 'EAUTH') {
      console.error('🔍 Authentication failed. Check:');
      console.error('   - GMAIL_USER:', process.env.GMAIL_USER);
      console.error('   - GMAIL_APP_PASSWORD: ' + (process.env.GMAIL_APP_PASSWORD ? '[SET]' : '[MISSING]'));
    }
    
    process.exit(1);
  });
