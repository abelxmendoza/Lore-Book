-- Message Correction Loop
-- Lets a user edit/correct a chat bubble and have the derived knowledge
-- (extracted units, entity facts, omega claims, crystallized knowledge)
-- re-derived from the new text, while the old derivations are tombstoned
-- (superseded, never hard-deleted) and the full edit history is retained.

-- ── 1. Edit history (full audit trail of every revision of a message) ──────────
CREATE TABLE IF NOT EXISTS public.chat_message_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,            -- 1 = original content, 2 = first edit, ...
  content TEXT NOT NULL,                -- the content AS OF this revision
  reason TEXT,                          -- optional "why" the user gave for the edit
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

-- ── 2. Revision pointers on the live message row ──────────────────────────────
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_content TEXT;

-- ── 3. Generic tombstone columns on derived tables ────────────────────────────
-- A non-null superseded_at means "this derivation came from text that has since
-- been corrected — exclude it from reads, prompts, and aggregates." We keep the
-- row for provenance/audit rather than deleting it.
ALTER TABLE public.extracted_units
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_reason TEXT;
CREATE INDEX IF NOT EXISTS extracted_units_superseded_idx ON public.extracted_units(superseded_at);

ALTER TABLE public.entity_facts
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_reason TEXT;
CREATE INDEX IF NOT EXISTS entity_facts_superseded_idx ON public.entity_facts(superseded_at);

-- Helpful lookup indexes for the re-derivation walk (message -> utterances -> units)
CREATE INDEX IF NOT EXISTS utterances_message_id_idx ON public.utterances(message_id);
CREATE INDEX IF NOT EXISTS extracted_units_utterance_id_idx ON public.extracted_units(utterance_id);
CREATE INDEX IF NOT EXISTS provenance_edges_source_idx ON public.provenance_edges(source_id);
