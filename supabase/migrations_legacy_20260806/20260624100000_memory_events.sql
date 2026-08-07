-- =====================================================
-- MEMORY EVENTS — immutable source-of-truth event log
-- Durable Memory Architecture — Slice 1 (priority #1 + provenance backbone)
--
-- The single append-only "raw events = what happened" stream that feeds the
-- consolidation worker and gives every downstream fact a traceable origin.
-- Unifies what is currently scattered across chat_messages, corrections, file
-- uploads, extractions, inferences and retractions.
--
-- Design invariants (match identity_mutations / cognition_mutations / provenance_edges):
--   - Append-only: never UPDATE or DELETE (trigger-enforced)
--   - Never erase older truth: a retraction/correction SUPERSEDES an earlier
--     event by reference; the earlier event stays.
--   - RLS: owner reads; service-role writes.
-- =====================================================

create table if not exists public.memory_events (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users(id) on delete cascade,

  -- What kind of thing happened
  kind                text        not null check (kind in (
                        'user_message','assistant_message','correction','entity_extraction',
                        'relationship_change','file_upload','inference','fact_update',
                        'retraction','deletion'
                      )),
  actor               text        not null default 'user'
                        check (actor in ('user','assistant','system')),

  -- Where it came from / what it is about (all nullable — not every event has every link)
  session_id          uuid,                 -- conversation/thread id
  source_message_id   uuid,                 -- chat_messages.id when applicable
  entity_id           uuid,                 -- omega_entities.id (or other) when applicable

  -- Provenance
  extraction_method   text,                 -- 'user_provided' | 'llm' | 'heuristic' | 'parser' | 'import' | ...
  confidence          real        check (confidence is null or (confidence >= 0 and confidence <= 1)),
  user_confirmed      boolean     not null default false,

  -- The immutable payload of what happened
  content             text,                 -- raw text for messages / corrections
  payload             jsonb       not null default '{}'::jsonb,

  -- Supersession: newer truth points at the event it supersedes (older event is kept)
  supersedes_event_id uuid        references public.memory_events(id) on delete set null,

  occurred_at         timestamptz not null default now(),  -- when it happened (may differ from created_at)
  created_at          timestamptz not null default now()
);

create index if not exists memory_events_user_created_idx   on public.memory_events (user_id, created_at desc);
create index if not exists memory_events_user_kind_idx       on public.memory_events (user_id, kind);
create index if not exists memory_events_entity_idx          on public.memory_events (entity_id) where entity_id is not null;
create index if not exists memory_events_session_idx         on public.memory_events (session_id) where session_id is not null;
create index if not exists memory_events_source_message_idx  on public.memory_events (source_message_id) where source_message_id is not null;
create index if not exists memory_events_supersedes_idx      on public.memory_events (supersedes_event_id) where supersedes_event_id is not null;

-- ── Append-only enforcement (defense in depth) ──────────────────────────────
create or replace function public.memory_events_block_mutate()
  returns trigger
  language plpgsql
as $$
begin
  raise exception 'memory_events is append-only; % is not permitted', tg_op;
end;
$$;

drop trigger if exists memory_events_no_update on public.memory_events;
create trigger memory_events_no_update
  before update on public.memory_events
  for each row execute function public.memory_events_block_mutate();

drop trigger if exists memory_events_no_delete on public.memory_events;
create trigger memory_events_no_delete
  before delete on public.memory_events
  for each row execute function public.memory_events_block_mutate();

-- ── RLS: owner reads; service-role writes (no UPDATE/DELETE policy) ──────────
alter table public.memory_events enable row level security;

drop policy if exists memory_events_select on public.memory_events;
create policy memory_events_select on public.memory_events
  for select using (auth.uid() = user_id);

drop policy if exists memory_events_insert on public.memory_events;
create policy memory_events_insert on public.memory_events
  for insert with check (auth.uid() = user_id);

comment on table public.memory_events is
  'Append-only source-of-truth event log (Durable Memory Architecture slice 1). Never updated or deleted; retractions/corrections supersede prior events by reference.';
