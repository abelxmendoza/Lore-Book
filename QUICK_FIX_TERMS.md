# Quick Fix: Terms Acceptance Table

## The Problem
The `terms_acceptance` table doesn't exist in your Supabase database, which is why you can't accept the terms.

## The Solution (2 minutes)

### Step 1: Open Supabase SQL Editor
Click this link to open your SQL Editor:
**https://supabase.com/dashboard/project/jawzxiiwfagliloxnnkc/sql/new**

### Step 2: Copy and Paste This SQL

```sql
-- Terms of Service acceptance tracking
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

-- Create index for quick lookups
create index if not exists terms_acceptance_user_id_idx on public.terms_acceptance(user_id);
create index if not exists terms_acceptance_version_idx on public.terms_acceptance(version);
create index if not exists terms_acceptance_accepted_at_idx on public.terms_acceptance(accepted_at desc);

-- Enable Row Level Security
alter table public.terms_acceptance enable row level security;

-- RLS Policies
create policy terms_acceptance_owner_select on public.terms_acceptance
  for select using (auth.uid() = user_id);

create policy terms_acceptance_owner_insert on public.terms_acceptance
  for insert with check (auth.uid() = user_id);

-- Function to check if user has accepted latest terms
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
```

### Step 3: Click "Run" (or press Cmd/Ctrl + Enter)

You should see: **"Success. No rows returned"**

### Step 4: Refresh Your Browser

Go back to your app and refresh the page. The terms acceptance should work now!

## Verify It Worked

After running the SQL, you can verify by running:
```bash
cd apps/server && pnpm tsx ../../scripts/verify-migration.ts
```

You should see: "✅ Table exists and is accessible!"

