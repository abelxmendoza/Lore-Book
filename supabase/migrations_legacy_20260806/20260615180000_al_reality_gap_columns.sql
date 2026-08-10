-- Sprint AL — Reality Gap Closure (Phase 1)
-- Persist computed intelligence scores on real data.

ALTER TABLE public.resolved_events
  ADD COLUMN IF NOT EXISTS significance_score integer NOT NULL DEFAULT 0
    CHECK (significance_score >= 0 AND significance_score <= 100),
  ADD COLUMN IF NOT EXISTS significance_level text NOT NULL DEFAULT 'minor';

CREATE INDEX IF NOT EXISTS idx_resolved_events_significance
  ON public.resolved_events (user_id, significance_score DESC);

COMMENT ON COLUMN public.resolved_events.significance_score IS 'Sprint AL deterministic significance (0-100)';
COMMENT ON COLUMN public.resolved_events.significance_level IS 'Sprint AL: legendary | major | moderate | minor';

-- Cached event meaning (deterministic, confidence-gated)
CREATE TABLE IF NOT EXISTS public.event_meaning_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.resolved_events(id) ON DELETE CASCADE,
  meaning_summary text,
  identity_impact text,
  life_lesson text,
  chapter_relevance text,
  confidence float NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_meaning_cache_user
  ON public.event_meaning_cache (user_id, updated_at DESC);

ALTER TABLE public.event_meaning_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own event meaning cache"
  ON public.event_meaning_cache FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own event meaning cache"
  ON public.event_meaning_cache FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own event meaning cache"
  ON public.event_meaning_cache FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users delete own event meaning cache"
  ON public.event_meaning_cache FOR DELETE USING (auth.uid() = user_id);
