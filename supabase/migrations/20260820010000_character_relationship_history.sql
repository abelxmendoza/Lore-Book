-- Additive, append-only relationship-transition ledger for character_relationships.
-- Modeled directly on organization_relationship_history (20260815010000), the
-- one proven, live analog in this schema. character_relationships remains the
-- current-state cache other code already reads; this table is the new source
-- of TRUTH for "what was this relationship, and by what authority."
--
-- NOTE: written for review only — not applied in this session. Additive only,
-- no destructive rewrite of character_relationships, no backfill of existing
-- rows (a legacy character_relationships row with zero history rows is handled
-- at READ time by the projector as a synthetic MIGRATED baseline — see
-- characterRelationshipAuthorityService.ts — not by a live migration here).
--
-- authority reuses the exact same vocabulary as MutationAuthority
-- (canonicalMutationTypes.ts) so this ledger speaks the same authority
-- language the rest of the canonical-mutation system already uses.

CREATE TABLE public.character_relationship_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL,
    source_character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
    target_character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,

    -- The state this row asserts. Nullable to_relationship_type/to_status: a
    -- CORRECTED row may assert nothing positive — it only retracts a prior row.
    from_relationship_type text,
    from_status text,
    to_relationship_type text,
    to_status text,

    -- changed_at: when this state is claimed to have been true (evidence time).
    -- recorded_at: when this row was actually written (ingestion/edit time).
    -- These differ exactly in the case this ledger exists to handle: a system
    -- job reprocessing old evidence in August has recorded_at=August but is
    -- asserting something about a period that may predate a July user
    -- correction — recorded_at is what authority-tie-breaking uses, not
    -- changed_at, so a late reprocessing run can't silently jump the queue.
    changed_at timestamptz NOT NULL DEFAULT now(),
    recorded_at timestamptz NOT NULL DEFAULT now(),
    valid_until timestamptz,

    change_kind text NOT NULL CHECK (change_kind IN ('CREATED', 'TRANSITIONED', 'ENDED', 'CORRECTED')),

    -- Same vocabulary as MutationAuthority (canonicalMutationTypes.ts).
    authority text NOT NULL CHECK (authority IN (
      'USER_EXPLICIT', 'USER_CONFIRMED', 'SYSTEM_DERIVED', 'IMPORTED_SOURCE', 'MANUAL_OPERATOR'
    )),

    evidence_ids uuid[] DEFAULT '{}',
    confidence real,

    -- Nullable, ON DELETE SET NULL: the live cache row this came from/updated.
    -- A history row must outlive the live row if that row is later removed.
    relationship_id uuid REFERENCES public.character_relationships(id) ON DELETE SET NULL,

    -- Self-reference for CORRECTED rows: "this row retracts that row." The
    -- retracted row stays in the table (immutable ledger) but the projector
    -- excludes it from user-facing history — audit trail, not user-facing truth.
    corrects_history_id uuid REFERENCES public.character_relationship_history(id) ON DELETE SET NULL,

    -- Optional idempotency key (e.g. derived from source message + transition
    -- hash) so reprocessing the same evidence twice does not duplicate history.
    idempotency_key text,

    created_at timestamptz DEFAULT now()
);

CREATE INDEX character_relationship_history_pair_idx
  ON public.character_relationship_history (source_character_id, target_character_id, recorded_at DESC);

CREATE INDEX character_relationship_history_user_idx
  ON public.character_relationship_history (user_id);

CREATE UNIQUE INDEX character_relationship_history_idempotency_uidx
  ON public.character_relationship_history (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.character_relationship_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY character_relationship_history_user_isolation
  ON public.character_relationship_history
  FOR ALL
  USING (user_id = auth.uid());

COMMENT ON TABLE public.character_relationship_history IS
  'Append-only, authority-aware ledger of character_relationships transitions. Never updated or deleted by application code — corrections add a new CORRECTED row referencing corrects_history_id rather than mutating history. See characterRelationshipAuthorityService.ts.';
