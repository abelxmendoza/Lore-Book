-- Canonical character relationship HISTORY: append-only asserted STATES
-- (bi-temporal intervals), not from→to transitions.
--
-- recorded_at = write time
-- valid_from / valid_until = relationship-change time at honest precision
--
-- character_relationships remains a current-state cache. Do not overwrite
-- historical states in place.
--
-- NOTE: written for review only — not applied in this session.

CREATE TABLE IF NOT EXISTS public.character_relationship_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL,
    source_character_id uuid NOT NULL,
    target_character_id uuid NOT NULL,
    pair_key text NOT NULL,
    relationship_type text NOT NULL,
    assertion_kind text NOT NULL,
    authority text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    valid_from timestamp with time zone,
    valid_until timestamp with time zone,
    valid_precision text DEFAULT 'unknown'::text NOT NULL,
    superseded_by_id uuid,
    idempotency_key text NOT NULL,
    mutation_key text,
    source_message_id text,
    evidence text,
    confidence real,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT character_relationship_history_kind_check CHECK (
      assertion_kind = ANY (ARRAY['asserted'::text, 'ended'::text, 'corrected_never'::text, 'destroyed'::text])
    ),
    CONSTRAINT character_relationship_history_authority_check CHECK (
      authority = ANY (ARRAY[
        'USER_EXPLICIT'::text,
        'USER_CONFIRMED'::text,
        'IMPORTED_SOURCE'::text,
        'SYSTEM_INFERENCE'::text
      ])
    ),
    CONSTRAINT character_relationship_history_user_idempotency_key UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS character_relationship_history_pair_idx
  ON public.character_relationship_history (user_id, pair_key, recorded_at DESC);

CREATE INDEX IF NOT EXISTS character_relationship_history_source_idx
  ON public.character_relationship_history (user_id, source_character_id);

CREATE INDEX IF NOT EXISTS character_relationship_history_target_idx
  ON public.character_relationship_history (user_id, target_character_id);

COMMENT ON TABLE public.character_relationship_history IS
  'Append-only relationship STATE intervals for one character pair. Current state is a projection ranked by authority, never newest-row-wins.';

ALTER TABLE public.character_relationship_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'character_relationship_history'
      AND policyname = 'users_manage_own_character_relationship_history'
  ) THEN
    CREATE POLICY users_manage_own_character_relationship_history
      ON public.character_relationship_history
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
