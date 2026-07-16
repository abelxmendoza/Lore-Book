-- Identity Ledger v1 — every identity mutation in LoreBook recorded as an
-- immutable, append-only audit event. This is the source of truth for "why is
-- this entity the way it is?" — distinct from cognition_mutations (truth-state
-- revisions) and entity_authority_decisions (the authority graph). One row per
-- mutation; history is NEVER overwritten or deleted.

create table if not exists public.identity_mutations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  entity_id       uuid not null,
  entity_type     text not null,                 -- character | location | organization | community | project | omega_entity | ...
  mutation_type   text not null check (mutation_type in (
                    'ENTITY_CREATED',
                    'ENTITY_UPDATED',
                    'ENTITY_ARCHIVED',
                    'ENTITY_MERGED',
                    'MERGE_REJECTED',
                    'ALIAS_ADDED',
                    'ALIAS_REMOVED',
                    'RELATIONSHIP_CREATED',
                    'RELATIONSHIP_REMOVED',
                    'TRUTH_STATE_CHANGED',
                    'CONFIDENCE_CHANGED'
                  )),
  previous_value  jsonb,                          -- null for creation events
  new_value       jsonb,                          -- null for removal events
  reason          text,
  confidence      real,                           -- confidence in the mutation itself (0..1)
  source          text not null default 'SYSTEM', -- USER | SYSTEM | PIPELINE | <service name>
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists identity_mutations_entity_idx
  on public.identity_mutations (user_id, entity_id, created_at desc);
create index if not exists identity_mutations_recent_idx
  on public.identity_mutations (user_id, created_at desc);
create index if not exists identity_mutations_type_idx
  on public.identity_mutations (user_id, mutation_type, created_at desc);

-- ── Append-only enforcement ────────────────────────────────────────────────
-- Defense in depth: RLS grants SELECT + INSERT only (no UPDATE/DELETE policy),
-- and a trigger hard-rejects any UPDATE/DELETE even from privileged roles so
-- history can never be rewritten.
create or replace function public.identity_mutations_block_mutate()
returns trigger
language plpgsql
as $$
begin
  raise exception 'identity_mutations is append-only; % is not permitted', tg_op;
end;
$$;

drop trigger if exists identity_mutations_no_update on public.identity_mutations;
drop trigger if exists identity_mutations_no_delete on public.identity_mutations;
create trigger identity_mutations_no_update
  before update on public.identity_mutations
  for each row execute function public.identity_mutations_block_mutate();
create trigger identity_mutations_no_delete
  before delete on public.identity_mutations
  for each row execute function public.identity_mutations_block_mutate();

alter table public.identity_mutations enable row level security;
drop policy if exists identity_mutations_select on public.identity_mutations;
drop policy if exists identity_mutations_insert on public.identity_mutations;
create policy identity_mutations_select on public.identity_mutations
  for select using (auth.uid() = user_id);
create policy identity_mutations_insert on public.identity_mutations
  for insert with check (auth.uid() = user_id);

comment on table public.identity_mutations is
  'Identity Ledger v1 — immutable, append-only audit trail of every identity mutation (create/update/archive/merge/alias/relationship/truth-state/confidence). Never overwritten.';

-- ── Identity Strength signal ───────────────────────────────────────────────
-- A separate health signal (0..100) from the simple per-entity confidence
-- score. The breakdown jsonb holds the component sub-scores. Existing
-- confidence logic is untouched — this is additive.
alter table public.characters
  add column if not exists identity_strength_score real,
  add column if not exists identity_strength jsonb;
alter table public.locations
  add column if not exists identity_strength_score real,
  add column if not exists identity_strength jsonb;
do $$
begin
  if to_regclass('public.organizations') is not null then
    alter table public.organizations
      add column if not exists identity_strength_score real,
      add column if not exists identity_strength jsonb;
  end if;
end $$;

comment on column public.characters.identity_strength_score is
  'Identity Strength Engine score (0..100): a richer identity-health signal, separate from confidence. See identity_strength for the breakdown.';
