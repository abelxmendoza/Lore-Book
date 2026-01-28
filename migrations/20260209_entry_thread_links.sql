-- Entry–thread associations for "add this to thread" and context-aware creation.
-- Allows linking a journal entry to a thread (e.g. when user creates from thread context).

CREATE TABLE IF NOT EXISTS public.entry_thread_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entry_id, thread_id)
);

CREATE INDEX IF NOT EXISTS idx_entry_thread_links_entry ON public.entry_thread_links(entry_id);
CREATE INDEX IF NOT EXISTS idx_entry_thread_links_thread ON public.entry_thread_links(thread_id);

COMMENT ON TABLE public.entry_thread_links IS 'Links journal entries to threads for context-aware "add to thread" and retrieval by thread.';

ALTER TABLE public.entry_thread_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own entry-thread links"
  ON public.entry_thread_links FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id = entry_thread_links.entry_id AND e.user_id = auth.uid())
  );

CREATE POLICY "Users can insert own entry-thread links"
  ON public.entry_thread_links FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id = entry_thread_links.entry_id AND e.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.threads t WHERE t.id = entry_thread_links.thread_id AND t.user_id = auth.uid())
  );

CREATE POLICY "Users can delete own entry-thread links"
  ON public.entry_thread_links FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id = entry_thread_links.entry_id AND e.user_id = auth.uid())
  );
