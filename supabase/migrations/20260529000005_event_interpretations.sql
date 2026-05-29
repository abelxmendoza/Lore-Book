-- Event interpretations — reconsolidation support
-- Stores how the user (or AI) has interpreted/reframed a specific event over time.
-- Multiple interpretations of the same event can coexist; supersedes_id chains them.
-- The epiphanyEngine writes here when it detects a reframe; retrieval uses the
-- most recent interpretation as narrative context.

CREATE TABLE IF NOT EXISTS event_interpretations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id           uuid REFERENCES resolved_events(id) ON DELETE SET NULL,
  journal_entry_id   uuid REFERENCES journal_entries(id) ON DELETE SET NULL,
  interpretation     text NOT NULL,
  emotional_valence  float,           -- -1.0 to 1.0 (negative → positive reframe direction)
  narrative_role     text,            -- 'origin' | 'turning_point' | 'resolution' | 'recurring'
  written_at         timestamptz NOT NULL DEFAULT now(),
  supersedes_id      uuid REFERENCES event_interpretations(id) ON DELETE SET NULL,
  source             text NOT NULL DEFAULT 'ai',  -- 'ai' | 'user'
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_interpretations_user_id_idx
  ON event_interpretations (user_id);

CREATE INDEX IF NOT EXISTS event_interpretations_event_id_idx
  ON event_interpretations (event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_interpretations_journal_entry_id_idx
  ON event_interpretations (journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_interpretations_written_at_idx
  ON event_interpretations (user_id, written_at DESC);
