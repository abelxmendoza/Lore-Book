import { createClient } from '@supabase/supabase-js';
import { config } from '../apps/server/src/config.js';

async function testTermsAPI() {
  console.log('🔍 Testing Terms Acceptance API...\n');

  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    console.error('❌ Supabase credentials not configured!');
    process.exit(1);
  }

  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });

  const testUserId = 'dev-user-id'; // Same as backend dev mode

  console.log('1️⃣  Checking if table exists...');
  const { error: tableError } = await supabase
    .from('terms_acceptance')
    .select('*')
    .limit(1);

  if (tableError) {
    if (tableError.code === '42P01') {
      console.log('   ❌ Table does NOT exist');
      console.log('\n   📋 SOLUTION: Run the SQL migration in Supabase SQL Editor');
      console.log('      https://supabase.com/dashboard/project/jawzxiiwfagliloxnnkc/sql/new');
      console.log('      Copy SQL from: migrations/20250120_terms_acceptance.sql');
      return;
    } else {
      console.log(`   ⚠️  Error: ${tableError.message}`);
    }
  } else {
    console.log('   ✅ Table exists!');
  }

  console.log('\n2️⃣  Testing insert (accepting terms)...');
  const { data: insertData, error: insertError } = await supabase
    .from('terms_acceptance')
    .insert({
      user_id: testUserId,
      version: '1.0',
      accepted_at: new Date().toISOString(),
      ip_address: '127.0.0.1',
      user_agent: 'test-script',
      metadata: { source: 'test' }
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      console.log('   ✅ User already accepted (duplicate is expected)');
    } else {
      console.log(`   ❌ Insert failed: ${insertError.message}`);
      console.log(`   Code: ${insertError.code}`);
    }
  } else {
    console.log('   ✅ Successfully inserted!');
    console.log(`   ID: ${insertData.id}`);
  }

  console.log('\n3️⃣  Testing query (checking status)...');
  const { data: queryData, error: queryError } = await supabase
    .from('terms_acceptance')
    .select('*')
    .eq('user_id', testUserId)
    .eq('version', '1.0')
    .single();

  if (queryError) {
    console.log(`   ❌ Query failed: ${queryError.message}`);
  } else {
    console.log('   ✅ Query successful!');
    console.log(`   Accepted at: ${queryData.accepted_at}`);
  }

  console.log('\n✅ All tests complete!');
}

testTermsAPI().catch(console.error);

