/**
 * Check email verification status for users
 * Usage: node check-verification.js [email]
 */

// Load env FIRST before any imports
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { createClient } = require('@supabase/supabase-js');

// Create supabase client directly here
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

const emailToCheck = process.argv[2];

async function checkVerification() {
  try {
    let query = supabase
      .from('users')
      .select('id, email, email_verified, email_verification_token_hash, email_verification_expires_at, created_at')
      .order('created_at', { ascending: false });

    if (emailToCheck) {
      query = query.eq('email', emailToCheck);
    } else {
      query = query.limit(5);
    }

    const { data: users, error } = await query;

    if (error) throw error;

    if (!users || users.length === 0) {
      console.log('❌ No users found');
      return;
    }

    console.log('\n📋 Email Verification Status:\n');

    users.forEach(user => {
      const hasToken = !!user.email_verification_token_hash;
      const isExpired = user.email_verification_expires_at 
        ? new Date(user.email_verification_expires_at) < new Date() 
        : false;

      console.log('─'.repeat(60));
      console.log(`📧 Email: ${user.email}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Verified: ${user.email_verified ? '✅ YES' : '❌ NO'}`);
      console.log(`   Has Token: ${hasToken ? 'YES' : 'NO'}`);
      
      if (hasToken) {
        console.log(`   Token Expires: ${user.email_verification_expires_at}`);
        console.log(`   Token Status: ${isExpired ? '⏰ EXPIRED' : '✅ Valid'}`);
      }
      
      console.log(`   Created: ${user.created_at}`);
    });

    console.log('─'.repeat(60));
    console.log('');

    if (!emailToCheck) {
      console.log('💡 Tip: Run with email to check specific user:');
      console.log('   node check-verification.js user@example.com');
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

checkVerification();
