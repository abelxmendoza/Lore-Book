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
    auth: { persistSession: false }
  });

  // Read the migration file
  const migrationPath = join(__dirname, '../migrations/20250120_terms_acceptance.sql');
  const migrationSQL = readFileSync(migrationPath, 'utf-8');

  console.log('📝 Creating table and policies...\n');

  // Execute SQL statements manually using Supabase client
  try {
    // Create the table
    const createTableSQL = `
      create table if not exists public.terms_acceptance (
        id uuid primary key default gen_random_uuid(),
        user_id uuid references auth.users(id) on delete cascade not null,
        version text not null default '1.0',
        accepted_at timestamptz not null default now(),
        ip_address text,
        user_agent text,
        metadata jsonb default '{}'::jsonb,
        created_at timestamptz default now(),
        unique(user_id, version)
      );
    `;

    // Use Supabase Management API to execute SQL
    const projectRef = config.supabaseUrl.split('//')[1].split('.')[0];
    const managementApiUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

    // Try using the Supabase Management API
    const response = await fetch(managementApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.supabaseServiceRoleKey}`,
      },
      body: JSON.stringify({
        query: migrationSQL
      })
    });

    if (response.ok) {
      console.log('✅ Migration executed successfully!');
      return;
    }

    const errorText = await response.text();
    console.log('⚠️  Management API response:', errorText.substring(0, 200));

  } catch (error: any) {
    console.log('⚠️  Error:', error.message);
  }

  // Fallback: Execute via direct database operations
  console.log('\n📝 Trying alternative method: Creating table via Supabase client...\n');

  // Check if table exists first
  const { error: checkError } = await supabase
    .from('terms_acceptance')
    .select('*')
    .limit(1);

  if (!checkError || checkError.code !== '42P01') {
    if (checkError && checkError.code === '42P01') {
      console.log('❌ Table does not exist, but cannot create via client API.');
    } else {
      console.log('✅ Table already exists!');
      return;
    }
  }

  console.log('\n❌ Cannot execute SQL directly. Please run this migration manually:');
  console.log('\n📋 Option 1: Use Supabase SQL Editor (Recommended)');
  console.log('   1. Go to: https://supabase.com/dashboard/project/jawzxiiwfagliloxnnkc/sql');
  console.log('   2. Click "New query"');
  console.log('   3. Paste the contents of: migrations/20250120_terms_acceptance.sql');
  console.log('   4. Click "Run"');
  console.log('\n📋 Option 2: Use psql');
  console.log('   Get your database password from Supabase Dashboard > Settings > Database');
  console.log('   Then run:');
  console.log(`   psql "postgresql://postgres.jawzxiiwfagliloxnnkc:[PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres" -f migrations/20250120_terms_acceptance.sql`);
}

runMigration().catch(console.error);

