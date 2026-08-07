-- Pending organization suggestions (confirm-before-truth, mirrors project/skill suggestions).

CREATE TABLE IF NOT EXISTS public.organization_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  organization_type TEXT NOT NULL DEFAULT 'unknown_organization',
  group_type TEXT NOT NULL DEFAULT 'other',
  role_to_user TEXT,
  description TEXT,
  confidence NUMERIC NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  reasoning TEXT,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_message_id TEXT,
  source TEXT NOT NULL DEFAULT 'chat',
  promotion_status TEXT NOT NULL DEFAULT 'candidate',
  match_status TEXT DEFAULT 'new' CHECK (match_status IN ('new', 'similar', 'existing')),
  matched_organization_id UUID,
  status_row TEXT NOT NULL DEFAULT 'pending' CHECK (status_row IN ('pending', 'confirmed', 'rejected')),
  requires_review BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_organization_suggestions_user_status
  ON public.organization_suggestions(user_id, status_row);

ALTER TABLE public.organization_suggestions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organization_suggestions' AND policyname = 'organization_suggestions_user'
  ) THEN
    CREATE POLICY organization_suggestions_user ON public.organization_suggestions
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
