-- Arc stability mechanics — autobiographical continuity persistence
-- stability_score tracks how "settled" an arc is:
--   increases with repeated retrieval and entity overlap
--   decays slowly when dormant
--   floors at 0.3 (arcs never fully disappear once inferred)
--
-- An arc with stability_score >= 0.8 is considered canonical for the system prompt.
-- An arc below 0.4 is speculative and not shown to the user.

ALTER TABLE life_arcs
  ADD COLUMN IF NOT EXISTS stability_score float NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS retrieval_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retrieved_at timestamptz;

-- Atomic arc stability bump — called fire-and-forget when arc entries are retrieved
CREATE OR REPLACE FUNCTION bump_arc_stability(arc_ids uuid[])
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE life_arcs
  SET
    retrieval_count   = retrieval_count + 1,
    last_retrieved_at = now(),
    -- Each retrieval adds +0.02, capped at 0.95; slow build toward canonical
    stability_score   = LEAST(0.95, stability_score + 0.02)
  WHERE id = ANY(arc_ids);
$$;

-- Daily stability decay: arcs not retrieved recently drift toward 0.3 floor
-- Called by arcStabilityJob. decay_rate ~0.005 = ~0.5% per day (very slow)
CREATE OR REPLACE FUNCTION apply_arc_stability_decay(decay_rate float, floor_val float)
RETURNS int LANGUAGE sql SECURITY DEFINER AS $$
  WITH updated AS (
    UPDATE life_arcs
    SET stability_score = GREATEST(floor_val, stability_score * (1.0 - decay_rate))
    WHERE stability_score > floor_val
      AND source = 'inferred'  -- user_created arcs never decay
    RETURNING id
  )
  SELECT count(*)::int FROM updated;
$$;

CREATE INDEX IF NOT EXISTS life_arcs_stability_idx
  ON life_arcs (stability_score DESC)
  WHERE stability_score > 0.4;
