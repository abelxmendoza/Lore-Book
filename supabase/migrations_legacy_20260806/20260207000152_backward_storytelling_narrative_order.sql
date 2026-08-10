-- Backward-Storytelling–Safe Narrative Ingestion
-- Optional: narrative_order and derived_from_entry_id for story slices.
-- Use cases: "You told this story backward", conflict detection, timeline explanations.

-- narrative_order: order user told it (1-based). Never used for chronology.
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS narrative_order INT NULL;

-- derived_from_entry_id: when this entry was materialized from a parent (e.g. one chat → many slices)
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS derived_from_entry_id UUID NULL REFERENCES public.journal_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS journal_entries_narrative_order_idx
  ON public.journal_entries(user_id, narrative_order) WHERE narrative_order IS NOT NULL;

CREATE INDEX IF NOT EXISTS journal_entries_derived_from_idx
  ON public.journal_entries(derived_from_entry_id) WHERE derived_from_entry_id IS NOT NULL;

COMMENT ON COLUMN public.journal_entries.narrative_order IS 'Order user told the story (1-based). Do not use for chronology.';
COMMENT ON COLUMN public.journal_entries.derived_from_entry_id IS 'Parent entry when this was materialized as a story slice (backward-storytelling pipeline).';
