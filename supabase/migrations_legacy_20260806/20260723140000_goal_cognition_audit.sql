-- Auditable cleanup trail for Goal & Quest Cognition Engine decisions.

CREATE TABLE IF NOT EXISTS public.goal_cognition_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  suggestion_id UUID REFERENCES public.quest_suggestions(id) ON DELETE SET NULL,
  prior_title TEXT NOT NULL,
  source_message_id TEXT,
  source_text TEXT,
  prior_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision TEXT NOT NULL CHECK (
    decision IN ('ACCEPT', 'REVIEW', 'REJECT', 'UPDATE_EXISTING', 'COMPLETE_EXISTING', 'CANCEL_EXISTING')
  ),
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_cognition_audit_user_created
  ON public.goal_cognition_audit(user_id, created_at DESC);

ALTER TABLE public.goal_cognition_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'goal_cognition_audit'
      AND policyname = 'goal_cognition_audit_user'
  ) THEN
    CREATE POLICY goal_cognition_audit_user
      ON public.goal_cognition_audit
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
