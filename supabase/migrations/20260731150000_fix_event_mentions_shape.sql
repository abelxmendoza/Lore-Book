-- Fix event_mentions schema drift.
--
-- The live table predates every migration in this repo and holds a per-entry
-- entity-mention shape (entry_id / entity_id / mention_text) that no code
-- reads or writes. Because 20250223000080 and 20250223000097 both used
-- CREATE TABLE IF NOT EXISTS, they silently no-op'd against it, so every
-- event-mention write (temporalEvents EventStorage.saveMentions, ER
-- writeRelationship) and every reader (eventMeaningService, legacyClaimBridge,
-- lifeEventClassificationService, narrativeAtomBuilder, ...) has failed
-- silently since. Recreate the table with the canonical resolved_events
-- shape. The legacy table is dropped only when empty; otherwise it is renamed
-- so its rows stay inspectable.

DO $$
DECLARE
  legacy_rows BIGINT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_mentions' AND column_name = 'entry_id'
  ) THEN
    EXECUTE 'SELECT count(*) FROM public.event_mentions' INTO legacy_rows;
    IF legacy_rows = 0 THEN
      DROP TABLE public.event_mentions;
    ELSE
      ALTER TABLE public.event_mentions RENAME TO event_mentions_entry_legacy;
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.event_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.resolved_events(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  signal JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_mentions_memory ON public.event_mentions(memory_id);
CREATE INDEX IF NOT EXISTS idx_event_mentions_event ON public.event_mentions(event_id);

ALTER TABLE public.event_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own event mentions" ON public.event_mentions;
DROP POLICY IF EXISTS "Users can insert own event mentions" ON public.event_mentions;
DROP POLICY IF EXISTS "Users can delete own event mentions" ON public.event_mentions;

CREATE POLICY "Users can view own event mentions"
  ON public.event_mentions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.resolved_events
      WHERE resolved_events.id = event_mentions.event_id
      AND resolved_events.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own event mentions"
  ON public.event_mentions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.resolved_events
      WHERE resolved_events.id = event_mentions.event_id
      AND resolved_events.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own event mentions"
  ON public.event_mentions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.resolved_events
      WHERE resolved_events.id = event_mentions.event_id
      AND resolved_events.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_mentions TO authenticated, service_role;
