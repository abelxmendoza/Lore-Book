-- Document/resume fact search indexes.
-- These indexes keep search deterministic and avoid loading every document body
-- into the application for simple text lookups. Existing tables already carry
-- user ownership and RLS; the unique index also makes generic document writes
-- idempotent by user and filename.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE UNIQUE INDEX IF NOT EXISTS original_documents_user_file_name_key
  ON public.original_documents (user_id, file_name);

CREATE INDEX IF NOT EXISTS original_documents_content_fts_idx
  ON public.original_documents
  USING gin (to_tsvector('simple', content));

CREATE INDEX IF NOT EXISTS original_documents_user_updated_idx
  ON public.original_documents (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS user_files_user_filename_idx
  ON public.user_files (user_id, filename);

CREATE INDEX IF NOT EXISTS user_files_filename_trgm_idx
  ON public.user_files
  USING gin (filename public.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS user_files_user_status_uploaded_idx
  ON public.user_files (user_id, processing_status, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS resume_documents_raw_text_fts_idx
  ON public.resume_documents
  USING gin (to_tsvector('simple', coalesce(raw_text, '')));

CREATE INDEX IF NOT EXISTS resume_documents_completed_user_uploaded_idx
  ON public.resume_documents (user_id, uploaded_at DESC)
  WHERE processing_status = 'completed';

CREATE INDEX IF NOT EXISTS profile_claims_text_fts_idx
  ON public.profile_claims
  USING gin (to_tsvector('simple', claim_text));

CREATE INDEX IF NOT EXISTS profile_claims_resume_user_updated_idx
  ON public.profile_claims (user_id, last_updated_at DESC)
  WHERE source = 'resume';

ALTER TABLE public.original_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS original_documents_select_own ON public.original_documents;
CREATE POLICY original_documents_select_own
  ON public.original_documents FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS original_documents_insert_own ON public.original_documents;
CREATE POLICY original_documents_insert_own
  ON public.original_documents FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS original_documents_update_own ON public.original_documents;
CREATE POLICY original_documents_update_own
  ON public.original_documents FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS original_documents_delete_own ON public.original_documents;
CREATE POLICY original_documents_delete_own
  ON public.original_documents FOR DELETE TO authenticated
  USING (user_id = auth.uid());
