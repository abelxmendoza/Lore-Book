-- Sticky suggestion dismissals: thread-scoped hides + 5-strike permanent suppression.

CREATE TABLE IF NOT EXISTS public.suggestion_dismissal_stats (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_domain TEXT NOT NULL CHECK (
    book_domain IN ('projects', 'skills', 'quests', 'locations', 'characters')
  ),
  normalized_name TEXT NOT NULL,
  dismiss_count INT NOT NULL DEFAULT 0 CHECK (dismiss_count >= 0),
  is_permanent BOOLEAN NOT NULL DEFAULT false,
  last_dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, book_domain, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_suggestion_dismissal_stats_user_domain
  ON public.suggestion_dismissal_stats(user_id, book_domain);

CREATE TABLE IF NOT EXISTS public.suggestion_thread_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_domain TEXT NOT NULL CHECK (
    book_domain IN ('projects', 'skills', 'quests', 'locations', 'characters')
  ),
  normalized_name TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_suggestion_id TEXT,
  UNIQUE (user_id, book_domain, normalized_name, thread_id)
);

CREATE INDEX IF NOT EXISTS idx_suggestion_thread_dismissals_user_domain
  ON public.suggestion_thread_dismissals(user_id, book_domain);

ALTER TABLE public.suggestion_dismissal_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggestion_thread_dismissals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'suggestion_dismissal_stats'
      AND policyname = 'suggestion_dismissal_stats_user'
  ) THEN
    CREATE POLICY suggestion_dismissal_stats_user ON public.suggestion_dismissal_stats
      FOR ALL USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'suggestion_thread_dismissals'
      AND policyname = 'suggestion_thread_dismissals_user'
  ) THEN
    CREATE POLICY suggestion_thread_dismissals_user ON public.suggestion_thread_dismissals
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
