-- Widen narrative_moments.sentence_kind to accept DECISION/REFLECTION.
-- These are internal (not external) happenings — a resolved choice or a
-- realization — that the sentence classifier previously had no kind for,
-- so they fell into the default FACT bucket and never entered the
-- Moments -> Scenes -> Story Chapters -> Life Eras ladder.

DO $$
BEGIN
  IF to_regclass('public.narrative_moments') IS NULL THEN
    RAISE NOTICE 'narrative_moments_kind_expand: narrative_moments missing; skip';
    RETURN;
  END IF;

  ALTER TABLE public.narrative_moments DROP CONSTRAINT IF EXISTS narrative_moments_sentence_kind_check;
  ALTER TABLE public.narrative_moments
    ADD CONSTRAINT narrative_moments_sentence_kind_check
      CHECK (sentence_kind IN (
        'EVENT', 'DECISION', 'REFLECTION', 'FACT', 'STATE', 'GOAL', 'OPINION', 'BACKGROUND', 'EMOTION', 'PROFILE', 'IGNORE'
      ));
END $$;
