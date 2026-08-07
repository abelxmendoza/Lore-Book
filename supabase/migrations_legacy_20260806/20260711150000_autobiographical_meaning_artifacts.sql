-- =====================================================
-- Autobiographical meaning artifacts (Memory Quality)
-- =====================================================
-- Durable, idempotent store for deterministic life-meaning extraction.
-- Metadata projections remain caches only.

CREATE TABLE IF NOT EXISTS public.autobiographical_meaning_artifacts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_message_id  uuid,
  source_event_id    uuid,
  meaning_type       text NOT NULL,
  -- lesson | behavior_change | identity_growth | motivation | intent | outcome
  -- | future_implication | causal_link | continuity_link | progression
  -- | relationship_dimension | preference_lifecycle | emotion
  subject_entity_id  uuid,
  object_entity_id   uuid,
  normalized_value   text NOT NULL,
  display_label      text NOT NULL,
  confidence         real NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0 AND confidence <= 1),
  evidence_ids       uuid[] NOT NULL DEFAULT '{}',
  evidence_quotes    text[] NOT NULL DEFAULT '{}',
  extractor_version  text NOT NULL DEFAULT 'memory-quality-v1',
  source_fingerprint text NOT NULL,
  epistemic_type     text NOT NULL DEFAULT 'deterministic_inference',
  -- direct_statement | deterministic_inference | multi_evidence_pattern
  -- | user_confirmed | user_corrected
  status             text NOT NULL DEFAULT 'ACTIVE',
  -- ACTIVE | SUPERSEDED | REMOVED | USER_CORRECTED
  supersedes_id      uuid REFERENCES public.autobiographical_meaning_artifacts(id) ON DELETE SET NULL,
  linked_from_type   text,
  linked_from_value  text,
  linked_to_type     text,
  linked_to_value    text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz
);

-- One logical artifact per fingerprint (user-scoped via fingerprint material)
CREATE UNIQUE INDEX IF NOT EXISTS autobiographical_meaning_fingerprint_uidx
  ON public.autobiographical_meaning_artifacts (user_id, source_fingerprint)
  WHERE status IN ('ACTIVE', 'USER_CORRECTED');

CREATE INDEX IF NOT EXISTS autobiographical_meaning_message_idx
  ON public.autobiographical_meaning_artifacts (user_id, source_message_id)
  WHERE source_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS autobiographical_meaning_event_idx
  ON public.autobiographical_meaning_artifacts (user_id, source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS autobiographical_meaning_type_idx
  ON public.autobiographical_meaning_artifacts (user_id, meaning_type, status);

CREATE INDEX IF NOT EXISTS autobiographical_meaning_active_idx
  ON public.autobiographical_meaning_artifacts (user_id, updated_at DESC)
  WHERE status = 'ACTIVE';

ALTER TABLE public.autobiographical_meaning_artifacts ENABLE ROW LEVEL SECURITY;

-- Owner-read policy only when auth.uid() exists (Supabase). Local/test DBs may lack it.
DROP POLICY IF EXISTS autobiographical_meaning_owner_read ON public.autobiographical_meaning_artifacts;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY autobiographical_meaning_owner_read
        ON public.autobiographical_meaning_artifacts
        FOR SELECT
        USING (auth.uid() = user_id)
    $pol$;
  END IF;
END $$;

-- Service role writes only (no client INSERT policy)

COMMENT ON TABLE public.autobiographical_meaning_artifacts IS
  'Durable Memory Quality meaning layer. Metadata on chat_messages/resolved_events is a projection only.';

-- Stage tracking on ingestion jobs (observable MEMORY_QUALITY stage)
ALTER TABLE public.ingestion_jobs
  ADD COLUMN IF NOT EXISTS memory_quality_status text;
-- PENDING | PROCESSING | COMPLETED | SKIPPED | RETRYABLE_FAILED | PERMANENT_FAILED

COMMENT ON COLUMN public.ingestion_jobs.memory_quality_status IS
  'Observable Memory Quality stage status for this ingestion job.';
