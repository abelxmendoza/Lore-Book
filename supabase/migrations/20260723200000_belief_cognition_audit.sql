-- Auditable trail for Belief Cognition Engine v2 decisions (shadow + enforced).

CREATE TABLE IF NOT EXISTS public.belief_cognition_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposal_id UUID REFERENCES public.memory_proposals(id) ON DELETE SET NULL,
  claim_text TEXT NOT NULL DEFAULT '',
  source_text TEXT,
  source_message_id TEXT,
  decision TEXT NOT NULL,
  speech_act TEXT,
  routing_target TEXT,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  gate_enforced BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_belief_cognition_audit_user_created
  ON public.belief_cognition_audit(user_id, created_at DESC);

ALTER TABLE public.belief_cognition_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'belief_cognition_audit'
      AND policyname = 'belief_cognition_audit_user'
  ) THEN
    CREATE POLICY belief_cognition_audit_user
      ON public.belief_cognition_audit
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
