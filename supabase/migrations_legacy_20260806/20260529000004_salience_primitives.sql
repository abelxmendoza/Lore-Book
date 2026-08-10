-- Salience primitives — autobiographical memory foundation
-- accessibility_score: how easily this memory surfaces (1.0=fresh, 0.1=floor after decay)
-- emotional_intensity: derived from mood/content at ingestion (0.0–1.0)
-- retrieval_count: how many times the AI has surfaced this entry (reinforcement)
-- last_retrieved_at: timestamp of last retrieval (used by decay job)

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS accessibility_score float NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS emotional_intensity float NOT NULL DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS retrieval_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retrieved_at timestamptz;

ALTER TABLE resolved_events
  ADD COLUMN IF NOT EXISTS accessibility_score float NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS emotional_intensity float NOT NULL DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS retrieval_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retrieved_at timestamptz;

-- Indexes for the decay job (scans entries above floor, sorted by last_retrieved)
CREATE INDEX IF NOT EXISTS journal_entries_accessibility_idx
  ON journal_entries (accessibility_score)
  WHERE accessibility_score > 0.1;

CREATE INDEX IF NOT EXISTS journal_entries_last_retrieved_idx
  ON journal_entries (last_retrieved_at)
  WHERE last_retrieved_at IS NOT NULL;

-- Atomic retrieval reinforcement: bump count, update timestamp, nudge accessibility up
-- Called fire-and-forget after each RAG fetch.
CREATE OR REPLACE FUNCTION bump_retrieval_count(entry_ids uuid[])
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE journal_entries
  SET
    retrieval_count   = retrieval_count + 1,
    last_retrieved_at = now(),
    -- Each retrieval adds +0.05, capped at 1.0; counteracts daily decay
    accessibility_score = LEAST(1.0, accessibility_score + 0.05)
  WHERE id = ANY(entry_ids);
$$;

-- Daily accessibility decay: multiply by (1 - decay_rate), floor at floor_val
-- Called by accessibilityDecayJob once per day.
CREATE OR REPLACE FUNCTION apply_accessibility_decay(decay_rate float, floor_val float)
RETURNS int LANGUAGE sql SECURITY DEFINER AS $$
  WITH updated AS (
    UPDATE journal_entries
    SET accessibility_score = GREATEST(floor_val, accessibility_score * (1.0 - decay_rate))
    WHERE accessibility_score > floor_val
    RETURNING id
  )
  SELECT count(*)::int FROM updated;
$$;
