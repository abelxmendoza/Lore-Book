-- Lexical analysis results — pre-ontology signal extraction layer for LoreBook.

CREATE TABLE IF NOT EXISTS public.lexical_analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id UUID,
  message_id UUID,
  raw_text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lexical_analysis_user_id
  ON public.lexical_analysis_results(user_id);

CREATE INDEX IF NOT EXISTS idx_lexical_analysis_message_id
  ON public.lexical_analysis_results(message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lexical_analysis_thread_id
  ON public.lexical_analysis_results(thread_id)
  WHERE thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lexical_analysis_created_at
  ON public.lexical_analysis_results(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lexical_analysis_result_json
  ON public.lexical_analysis_results USING gin(result_json);

ALTER TABLE public.lexical_analysis_results ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lexical_analysis_results'
      AND policyname = 'lexical_analysis_results_user'
  ) THEN
    CREATE POLICY lexical_analysis_results_user ON public.lexical_analysis_results
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
