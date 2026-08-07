-- Repair migration: ensure user_corrections exists (active learning / suggestion redirects).

CREATE TABLE IF NOT EXISTS public.user_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  correction_type TEXT NOT NULL,
  original_value TEXT NOT NULL,
  corrected_value TEXT NOT NULL,
  context TEXT,
  source_message_id UUID,
  source_unit_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used_for_training BOOLEAN DEFAULT FALSE,
  training_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_corrections_user_type
  ON public.user_corrections(user_id, correction_type);

CREATE INDEX IF NOT EXISTS idx_user_corrections_training
  ON public.user_corrections(used_for_training)
  WHERE used_for_training = FALSE;

ALTER TABLE public.user_corrections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_corrections' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY owner_rw ON public.user_corrections
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
