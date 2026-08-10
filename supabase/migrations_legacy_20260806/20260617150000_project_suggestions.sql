-- Pending project suggestions (confirm-before-truth, mirrors quest/skill suggestions).

CREATE TABLE IF NOT EXISTS public.project_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  description TEXT,
  project_type TEXT DEFAULT 'project',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'abandoned')),
  confidence NUMERIC NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  reasoning TEXT,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_message_id TEXT,
  source TEXT NOT NULL DEFAULT 'chat',
  match_status TEXT DEFAULT 'new' CHECK (match_status IN ('new', 'similar', 'existing')),
  matched_project_id UUID,
  status_row TEXT NOT NULL DEFAULT 'pending' CHECK (status_row IN ('pending', 'confirmed', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_project_suggestions_user_status
  ON public.project_suggestions(user_id, status_row);

ALTER TABLE public.project_suggestions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'project_suggestions' AND policyname = 'project_suggestions_user'
  ) THEN
    CREATE POLICY project_suggestions_user ON public.project_suggestions
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
