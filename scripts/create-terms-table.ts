import { createClient } from '@supabase/supabase-js';
import { config } from '../apps/server/src/config.js';

async function createTable() {
  console.log('🚀 Creating terms_acceptance table...\n');

  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    console.error('❌ Supabase credentials not configured!');
    process.exit(1);
  }

  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });

  // Try to create table using Supabase REST API with raw SQL
  const projectRef = config.supabaseUrl.split('//')[1].split('.')[0];
  
  console.log(`📝 Project: ${projectRef}`);
  console.log('📝 Attempting to create table via Supabase Management API...\n');

  // Use Supabase Management API
  const managementUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  
  const sql = `
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

    comment on table public.terms_acceptance is 'Tracks user acceptance of Terms of Service and Privacy Agreement';
    comment on column public.terms_acceptance.version is 'Version of the terms that were accepted';
    comment on column public.terms_acceptance.accepted_at is 'Timestamp when user accepted the terms';
    comment on column public.terms_acceptance.ip_address is 'IP address when terms were accepted (for audit purposes)';
    comment on column public.terms_acceptance.user_agent is 'User agent when terms were accepted (for audit purposes)';

    create index if not exists terms_acceptance_user_id_idx on public.terms_acceptance(user_id);
    create index if not exists terms_acceptance_version_idx on public.terms_acceptance(version);
    create index if not exists terms_acceptance_accepted_at_idx on public.terms_acceptance(accepted_at desc);

    alter table public.terms_acceptance enable row level security;

    create policy if not exists terms_acceptance_owner_select on public.terms_acceptance
      for select using (auth.uid() = user_id);

    create policy if not exists terms_acceptance_owner_insert on public.terms_acceptance
      for insert with check (auth.uid() = user_id);

    create or replace function has_accepted_latest_terms(p_user_id uuid, p_version text default '1.0')
    returns boolean as $$
    begin
      return exists (
        select 1 from public.terms_acceptance
        where user_id = p_user_id
        and version = p_version
      );
    end;
    $$ language plpgsql security definer;
  `;

  try {
    // Try Management API
    const response = await fetch(managementUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.supabaseServiceRoleKey}`,
      },
      body: JSON.stringify({ query: sql })
    });

    const responseText = await response.text();
    console.log('Response:', responseText.substring(0, 200));

    if (response.ok) {
      console.log('\n✅ Table created successfully!');
      
      // Verify
      const { error } = await supabase.from('terms_acceptance').select('*').limit(1);
      if (error && error.code === '42P01') {
        console.log('⚠️  Table still not found after creation');
      } else {
        console.log('✅ Verified: Table exists and is accessible');
      }
      return;
    }
  } catch (error: any) {
    console.log('⚠️  Management API error:', error.message);
  }

  console.log('\n❌ Could not create table automatically.');
  console.log('\n📋 Please create it manually in Supabase SQL Editor:');
  console.log('   1. Go to: https://supabase.com/dashboard/project/jawzxiiwfagliloxnnkc/sql/new');
  console.log('   2. Copy the SQL from: migrations/20250120_terms_acceptance.sql');
  console.log('   3. Paste and click "Run"');
}

createTable().catch(console.error);

