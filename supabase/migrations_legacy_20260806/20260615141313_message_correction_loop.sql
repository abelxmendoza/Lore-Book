-- Mirrored from supabase_migrations.schema_migrations (version 20260615141313).
-- Applied on remote before this file existed in the repo.

CREATE TABLE IF NOT EXISTS public.chat_message_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  content TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, revision)
);
CREATE INDEX IF NOT EXISTS chat_message_revisions_message_idx ON public.chat_message_revisions(message_id);
CREATE INDEX IF NOT EXISTS chat_message_revisions_user_idx ON public.chat_message_revisions(user_id);
ALTER TABLE public.chat_message_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_message_revisions_select ON public.chat_message_revisions;
CREATE POLICY chat_message_revisions_select ON public.chat_message_revisions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS chat_message_revisions_insert ON public.chat_message_revisions;
CREATE POLICY chat_message_revisions_insert ON public.chat_message_revisions FOR INSERT WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_content TEXT;

ALTER TABLE public.extracted_units
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_reason TEXT;
CREATE INDEX IF NOT EXISTS extracted_units_superseded_idx ON public.extracted_units(superseded_at);

DO $$
BEGIN
  IF to_regclass('public.entity_facts') IS NOT NULL THEN
    ALTER TABLE public.entity_facts
      ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS superseded_reason TEXT;
    CREATE INDEX IF NOT EXISTS entity_facts_superseded_idx ON public.entity_facts(superseded_at);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS utterances_message_id_idx ON public.utterances(message_id);
CREATE INDEX IF NOT EXISTS extracted_units_utterance_id_idx ON public.extracted_units(utterance_id);
CREATE INDEX IF NOT EXISTS provenance_edges_source_idx ON public.provenance_edges(source_id);
