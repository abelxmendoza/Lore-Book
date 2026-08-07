-- Epiphany insights: retroactive pattern interpretations fired by EpiphanySessionManager

CREATE TABLE IF NOT EXISTS public.epiphany_insights (
  id           UUID        PRIMARY KEY,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claim        TEXT        NOT NULL,
  confidence   FLOAT       NOT NULL,
  supporting_memory_ids       TEXT[] NOT NULL DEFAULT '{}',
  contradicting_memory_ids    TEXT[] NOT NULL DEFAULT '{}',
  supersedes_interpretation_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS epiphany_insights_user_id_idx
  ON public.epiphany_insights (user_id, created_at DESC);

ALTER TABLE public.epiphany_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own epiphany insights"
  ON public.epiphany_insights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert epiphany insights"
  ON public.epiphany_insights FOR INSERT
  WITH CHECK (true);
