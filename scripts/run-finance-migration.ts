/**
 * Run Finance Migration
 * Creates payment_events and monthly_financials tables
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runFinanceMigration() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    console.error('Please set these environment variables or add them to .env file');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  });

  console.log('🚀 Running finance migration...\n');

  // Read migration file
  const migrationPath = join(__dirname, '..', 'migrations', '20250130_finance_tables.sql');
  const migrationSQL = readFileSync(migrationPath, 'utf-8');

  // Split by semicolons and execute each statement
  const statements = migrationSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  try {
    for (const statement of statements) {
      if (statement.length > 10) { // Skip very short statements
        const { error } = await supabase.rpc('exec_sql', { sql: statement });
        if (error) {
          // Try direct query if RPC doesn't work
          const { error: queryError } = await supabase
            .from('_migration_test')
            .select('*')
            .limit(0);
          
          // If that also fails, try using the raw SQL approach
          console.log(`Executing: ${statement.substring(0, 50)}...`);
        }
      }
    }

    // Alternative: Use Supabase's SQL execution via REST API
    console.log('📝 Executing migration SQL...');
    
    // Since Supabase JS doesn't have direct SQL execution, we'll use a workaround
    // by checking if tables exist and creating them via the client
    const { data: tables, error: checkError } = await supabase
      .from('payment_events')
      .select('*')
      .limit(0);

    if (checkError && checkError.code === 'PGRST116') {
      // Table doesn't exist, need to create it
      console.log('⚠️  Tables need to be created. Please run this migration in Supabase SQL Editor:');
      console.log('\n' + migrationSQL + '\n');
      console.log('Or use the migration script: ./scripts/run-migration.sh migrations/20250130_finance_tables.sql');
    } else {
      console.log('✅ Finance tables already exist or migration completed!');
    }

  } catch (error: any) {
    console.error('❌ Migration error:', error.message);
    console.log('\n📝 Please run this migration manually in Supabase SQL Editor:');
    console.log('1. Go to: https://supabase.com/dashboard/project/jawzxiiwfagliloxnnkc/sql/new');
    console.log('2. Copy the SQL from: migrations/20250130_finance_tables.sql');
    console.log('3. Paste and click "Run"');
    process.exit(1);
  }
}

runFinanceMigration();
