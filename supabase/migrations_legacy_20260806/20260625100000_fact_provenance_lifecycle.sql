-- =====================================================
-- FACT PROVENANCE + LIFECYCLE — Durable Memory Architecture, Slice 3
--
-- Connects normalized claims (omega_claims) to their originating event and gives
-- them a real epistemic lifecycle instead of a single is_active boolean.
--
-- Non-destructive + idempotent: only ADD COLUMN IF NOT EXISTS + a one-time
-- backfill. Older truth is never erased — superseded claims move to 'outdated',
-- and the richer states ('contradicted','retracted','corrected') let us record
-- "was true then, no longer true now" cleanly.
-- =====================================================

alter table public.omega_claims
  -- Soft reference to memory_events.id (the event this claim was derived from).
  -- Intentionally NOT a FK: a claim's provenance must survive regardless of the
  -- event row, and we avoid cross-migration coupling.
  add column if not exists source_event_id   uuid,
  add column if not exists last_confirmed_at  timestamptz,
  add column if not exists extraction_method  text,
  add column if not exists lifecycle_state    text not null default 'active'
    check (lifecycle_state in ('active','outdated','contradicted','retracted','corrected'));

-- One-time backfill: existing inactive claims are "superseded by newer evidence".
-- Active claims keep the column default ('active'). Idempotent (only flips rows
-- still at the default that are also inactive).
update public.omega_claims
   set lifecycle_state = 'outdated'
 where is_active = false
   and lifecycle_state = 'active';

create index if not exists omega_claims_lifecycle_idx
  on public.omega_claims (user_id, lifecycle_state);
create index if not exists omega_claims_source_event_idx
  on public.omega_claims (source_event_id) where source_event_id is not null;

comment on column public.omega_claims.lifecycle_state is
  'Epistemic lifecycle: active | outdated | contradicted | retracted | corrected. Older truth is superseded, never deleted.';
comment on column public.omega_claims.source_event_id is
  'Soft reference to memory_events.id — the originating event for this claim (provenance).';
