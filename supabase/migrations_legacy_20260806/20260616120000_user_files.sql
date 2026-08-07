-- Canonical file registry for unified ingestion
CREATE TABLE IF NOT EXISTS public.user_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  storage_url TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  ingest_kind TEXT,
  derived_counts JSONB NOT NULL DEFAULT '{"moments":0,"facts":0,"entities":0,"relationships":0,"events":0}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  UNIQUE (user_id, sha256)
);

CREATE INDEX IF NOT EXISTS idx_user_files_user_id ON public.user_files(user_id);
CREATE INDEX IF NOT EXISTS idx_user_files_status ON public.user_files(user_id, processing_status);

ALTER TABLE public.user_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_files_select ON public.user_files
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY user_files_insert ON public.user_files
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_files_update ON public.user_files
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_files_delete ON public.user_files
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_files IS 'Canonical registry for every user-uploaded artifact; all ingestion flows through this table.';

-- PostgREST does not always pick up new tables until the schema cache reloads.
NOTIFY pgrst, 'reload schema';
