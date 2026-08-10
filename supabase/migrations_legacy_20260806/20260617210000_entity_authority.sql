-- Entity Authority graph: the persistent record of confirmed authority decisions
-- (MERGE/ALIAS/PARENT_CHILD/LINK). One row per ratified decision. MERGE/ALIAS also
-- collapse the source table to one canonical via the existing *MergeService; this
-- table is the audit trail + the LINK/PARENT_CHILD relationship store.

create table if not exists public.entity_authority_decisions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  kind                 text not null,                 -- PERSON|LOCATION|VENUE|HOUSEHOLD|ROOM|EVENT|BUSINESS|ORGANIZATION|COMMUNITY|PROJECT|SKILL|GOAL
  decision             text not null,                 -- MERGE | ALIAS | PARENT_CHILD | LINK
  relationship         text,                          -- HOSTED_AT | INSIDE | HOME_OF | VISITS | USES | ASSOCIATED_WITH | RELATED
  source_id            uuid,
  source_name          text,
  target_id            uuid,
  target_name          text,
  canonical_entity_id  uuid,                           -- survivor (MERGE/ALIAS) or parent (PARENT_CHILD)
  confidence           real,
  reason               text,
  evidence             jsonb not null default '[]'::jsonb,
  status               text not null default 'confirmed', -- confirmed | dismissed
  applied              boolean not null default false,
  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now()
);

create index if not exists ead_user_idx on public.entity_authority_decisions(user_id, created_at desc);
create index if not exists ead_canonical_idx on public.entity_authority_decisions(user_id, canonical_entity_id);
create index if not exists ead_source_idx on public.entity_authority_decisions(user_id, source_id);

alter table public.entity_authority_decisions enable row level security;
drop policy if exists ead_select on public.entity_authority_decisions;
drop policy if exists ead_insert on public.entity_authority_decisions;
drop policy if exists ead_update on public.entity_authority_decisions;
create policy ead_select on public.entity_authority_decisions for select using (auth.uid() = user_id);
create policy ead_insert on public.entity_authority_decisions for insert with check (auth.uid() = user_id);
create policy ead_update on public.entity_authority_decisions for update using (auth.uid() = user_id);

comment on table public.entity_authority_decisions is 'Confirmed entity authority decisions (MERGE/ALIAS/PARENT_CHILD/LINK) — the authority graph + audit trail.';
