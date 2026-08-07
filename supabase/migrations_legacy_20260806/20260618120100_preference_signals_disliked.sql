-- Slice C2 — persist deterministic dislike stances alongside stated/revealed signals.
-- Dislikes are tracked separately so they never inflate the positive STATED count
-- used for say-vs-do alignment math.

ALTER TABLE public.preference_signals
  ADD COLUMN IF NOT EXISTS disliked_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.preference_signals.disliked_count IS
  'Episodes where the user explicitly dislikes this category (deterministic stance layer). Orthogonal to stated_count/revealed_count alignment.';

-- Extend evidence signal_type to include disliked provenance.
ALTER TABLE public.preference_evidence
  DROP CONSTRAINT IF EXISTS preference_evidence_signal_type_check;

ALTER TABLE public.preference_evidence
  ADD CONSTRAINT preference_evidence_signal_type_check
  CHECK (signal_type IN ('stated', 'revealed', 'disliked'));
