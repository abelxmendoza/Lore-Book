/**
 * Run Finance Migration using server's Supabase connection
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env from project root
const rootDir = resolve(__dirname, '../../..');
dotenv.config({ path: resolve(rootDir, '.env') });
dotenv.config({ path: resolve(rootDir, '.env.development') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('Please set these in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

async function runMigration() {
  console.log('🚀 Running finance migration...\n');

  // Read migration file
  const migrationPath = join(rootDir, 'migrations', '20250130_finance_tables.sql');
  const migrationSQL = readFileSync(migrationPath, 'utf-8');

  // Since Supabase JS client doesn't support raw SQL execution directly,
  // we'll check if we can use the REST API or provide instructions
  console.log('📝 Migration SQL loaded');
  console.log('⚠️  Supabase JS client cannot execute raw SQL directly.');
  console.log('\n📋 Please run this migration using one of these methods:\n');
  console.log('Method 1: Supabase SQL Editor (Recommended)');
  console.log('1. Go to: https://supabase.com/dashboard/project/jawzxiiwfagliloxnnkc/sql/new');
  console.log('2. Copy the SQL from: migrations/20250130_finance_tables.sql');
  console.log('3. Paste and click "Run"\n');
  console.log('Method 2: Using psql');
  console.log('./scripts/run-migration.sh migrations/20250130_finance_tables.sql\n');
  console.log('Method 3: Check if tables already exist...\n');

  // Check if tables already exist
  try {
    const { error: paymentEventsError } = await supabase
      .from('payment_events')
      .select('*')
      .limit(0);

    const { error: monthlyFinancialsError } = await supabase
      .from('monthly_financials')
      .select('*')
      .limit(0);

    if (!paymentEventsError && !monthlyFinancialsError) {
      console.log('✅ Finance tables already exist!');
      return;
    }

    if (paymentEventsError && paymentEventsError.code === 'PGRST116') {
      console.log('❌ payment_events table does not exist');
    }
    if (monthlyFinancialsError && monthlyFinancialsError.code === 'PGRST116') {
      console.log('❌ monthly_financials table does not exist');
    }

    console.log('\n📝 You need to run the migration SQL to create these tables.');
    console.log('See methods above.\n');

  } catch (error) {
    console.error('Error checking tables:', error.message);
  }
}

runMigration().catch(console.error);

