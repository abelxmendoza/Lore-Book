import { createClient } from '@supabase/supabase-js';
import { config } from '../apps/server/src/config.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  console.log('🚀 Running terms_acceptance migration...\n');

  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    console.error('❌ Supabase credentials not configured!');
    process.exit(1);
  }

  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false },
    db: { schema: 'public' }
  });

  // Read the migration file
  const migrationPath = join(__dirname, '../migrations/20250120_terms_acceptance.sql');
  const migrationSQL = readFileSync(migrationPath, 'utf-8');

  console.log('📝 Executing migration SQL...\n');

  // Execute SQL using Supabase REST API
  try {
    const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.supabaseServiceRoleKey,
        'Authorization': `Bearer ${config.supabaseServiceRoleKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ query: migrationSQL })
    });

    if (response.ok) {
      console.log('✅ Migration executed successfully via RPC!');
      return;
    }
  } catch (error) {
    console.log('⚠️  RPC method not available, trying direct execution...');
  }

  // Alternative: Execute statements one by one using raw SQL
  // Split SQL into individual statements
  const statements = migrationSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--') && !s.match(/^\s*$/));

  console.log(`Found ${statements.length} SQL statements to execute\n`);

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    if (!statement || statement.trim().length === 0) continue;

    try {
      // Use Supabase REST API to execute raw SQL
      const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/exec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.supabaseServiceRoleKey,
          'Authorization': `Bearer ${config.supabaseServiceRoleKey}`,
        },
        body: JSON.stringify({ sql: statement })
      });

      if (!response.ok) {
        const errorText = await response.text();
        // Some errors are expected (like "already exists")
        if (!errorText.includes('already exists') && !errorText.includes('duplicate')) {
          console.log(`⚠️  Statement ${i + 1} warning: ${errorText.substring(0, 100)}`);
        }
      } else {
        console.log(`✅ Statement ${i + 1}/${statements.length} executed`);
      }
    } catch (error: any) {
      console.log(`⚠️  Statement ${i + 1} error: ${error.message}`);
    }
  }

  // Verify the table was created
  const { data, error } = await supabase
    .from('terms_acceptance')
    .select('*')
    .limit(1);

  if (error && error.code === '42P01') {
    console.log('\n❌ Table was not created. Using psql method...');
    console.log('\n📋 Please run this manually:');
    console.log(`   psql "postgresql://postgres.jawzxiiwfagliloxnnkc:[YOUR_PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres" -f migrations/20250120_terms_acceptance.sql`);
    console.log('\nOr use the Supabase SQL Editor:');
    console.log('   https://supabase.com/dashboard/project/jawzxiiwfagliloxnnkc/sql');
    process.exit(1);
  } else if (error) {
    console.log(`\n⚠️  Verification check: ${error.message}`);
  } else {
    console.log('\n✅ Migration completed! Table exists and is accessible.');
  }
}

runMigration().catch(console.error);
