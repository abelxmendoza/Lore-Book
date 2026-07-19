-- Mirror of supabase/migrations/20260718220000_narrative_moments.sql
-- Narrative Moments: Conversation → Moments → (later) Scenes → Events.

CREATE TABLE IF NOT EXISTS public.narrative_moments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  occurred_at           TIMESTAMPTZ,
  recorded_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  sentence_kind         TEXT NOT NULL DEFAULT 'EVENT'
    CHECK (sentence_kind IN (
      'EVENT', 'FACT', 'STATE', 'GOAL', 'OPINION', 'BACKGROUND', 'EMOTION', 'PROFILE', 'IGNORE'
    )),
  summary               TEXT NOT NULL,
  participants          TEXT[] NOT NULL DEFAULT '{}',
  location              TEXT,
  emotions              TEXT[] NOT NULL DEFAULT '{}',
  evidence_unit_ids     TEXT[] NOT NULL DEFAULT '{}',
  thread_id             UUID,
  source_message_id     UUID,
  significance_score    INTEGER NOT NULL DEFAULT 0 CHECK (significance_score >= 0 AND significance_score <= 100),
  promoted_event_id     UUID REFERENCES public.resolved_events(id) ON DELETE SET NULL,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_narrative_moments_user_occurred
  ON public.narrative_moments (user_id, occurred_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_narrative_moments_user_created
  ON public.narrative_moments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_narrative_moments_promoted
  ON public.narrative_moments (user_id, promoted_event_id)
  WHERE promoted_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_narrative_moments_evidence
  ON public.narrative_moments USING GIN (evidence_unit_ids);

ALTER TABLE public.narrative_moments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can read own narrative moments"
    ON public.narrative_moments FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own narrative moments"
    ON public.narrative_moments FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own narrative moments"
    ON public.narrative_moments FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own narrative moments"
    ON public.narrative_moments FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.narrative_moments TO authenticated;
GRANT ALL ON public.narrative_moments TO service_role;
