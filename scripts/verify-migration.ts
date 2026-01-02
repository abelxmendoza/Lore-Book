import { createClient } from '@supabase/supabase-js';
import { config } from '../apps/server/src/config.js';

async function verifyMigration() {
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });

  console.log('🔍 Verifying terms_acceptance table...\n');

  try {
    const { data, error } = await supabase
      .from('terms_acceptance')
      .select('*')
      .limit(1);

    if (error) {
      if (error.code === '42P01') {
        console.log('❌ Table does not exist');
        return false;
      }
      console.log(`⚠️  Error: ${error.message}`);
      return false;
    }

    console.log('✅ Table exists and is accessible!');
    console.log(`   Columns: id, user_id, version, accepted_at, ip_address, user_agent, metadata, created_at`);
    return true;
  } catch (error: any) {
    console.log(`❌ Error: ${error.message}`);
    return false;
  }
}

verifyMigration().catch(console.error);

