-- Meaning resolution results — interpretation layer between Lexer and Planner.

CREATE TABLE IF NOT EXISTS public.meaning_resolution_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id UUID,
  message_id UUID,
  lexical_result_id UUID,
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  factuality TEXT NOT NULL DEFAULT 'uncertain',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meaning_resolution_user_id
  ON public.meaning_resolution_results(user_id);

CREATE INDEX IF NOT EXISTS idx_meaning_resolution_message_id
  ON public.meaning_resolution_results(message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meaning_resolution_thread_id
  ON public.meaning_resolution_results(thread_id)
  WHERE thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meaning_resolution_lexical_result_id
  ON public.meaning_resolution_results(lexical_result_id)
  WHERE lexical_result_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meaning_resolution_factuality
  ON public.meaning_resolution_results(factuality);

CREATE INDEX IF NOT EXISTS idx_meaning_resolution_created_at
  ON public.meaning_resolution_results(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meaning_resolution_result_json
  ON public.meaning_resolution_results USING gin(result_json);

ALTER TABLE public.meaning_resolution_results ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'meaning_resolution_results'
      AND policyname = 'meaning_resolution_results_user'
  ) THEN
    CREATE POLICY meaning_resolution_results_user ON public.meaning_resolution_results
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
