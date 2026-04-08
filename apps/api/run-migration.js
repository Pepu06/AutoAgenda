#!/usr/bin/env node
/**
 * Apply remove_slug migration using Supabase API
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

async function runMigration() {
  try {
    console.log('📦 Running migration: remove_slug.sql');
    console.log('');

    const migrationPath = path.join(__dirname, '../../packages/db/migrations/remove_slug.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('SQL to execute:');
    console.log('─'.repeat(60));
    console.log(sql);
    console.log('─'.repeat(60));
    console.log('');

    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // If exec_sql doesn't exist, provide manual instructions
      console.error('⚠️  Cannot execute SQL directly via Supabase client.');
      console.error('');
      console.error('Please run this migration manually:');
      console.error('');
      console.error('1. Go to: https://supabase.com/dashboard/project/yxrypsdybldauzwtkphq/sql/new');
      console.error('2. Copy and paste the SQL above');
      console.error('3. Click "Run"');
      console.error('');
      console.error('Original error:', error.message);
      process.exit(1);
    }

    console.log('✅ Migration executed successfully!');
    console.log('');
    console.log('Verifying...');

    // Verify the column was dropped
    const { data: columns } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'tenants');

    const hasSlug = columns?.some(c => c.column_name === 'slug');

    if (hasSlug) {
      console.error('❌ Slug column still exists!');
      process.exit(1);
    }

    console.log('✅ Verified: slug column removed from tenants table');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('');
    console.error('Please apply the migration manually via Supabase Dashboard:');
    console.error('https://supabase.com/dashboard/project/yxrypsdybldauzwtkphq/sql/new');
    process.exit(1);
  }
}

runMigration();
