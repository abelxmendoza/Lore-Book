-- Pending quest suggestions (mirrors skill_suggestions confirm-before-truth flow).

CREATE TABLE IF NOT EXISTS public.quest_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  quest_type TEXT NOT NULL DEFAULT 'side',
  priority INT NOT NULL DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  importance INT NOT NULL DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
  impact INT NOT NULL DEFAULT 5 CHECK (impact >= 1 AND impact <= 10),
  category TEXT,
  confidence NUMERIC NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  reasoning TEXT,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_message_id TEXT,
  source TEXT NOT NULL DEFAULT 'chat',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, title)
);

CREATE INDEX IF NOT EXISTS idx_quest_suggestions_user_status
  ON public.quest_suggestions(user_id, status);

ALTER TABLE public.quest_suggestions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'quest_suggestions' AND policyname = 'quest_suggestions_user'
  ) THEN
    CREATE POLICY quest_suggestions_user ON public.quest_suggestions
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
