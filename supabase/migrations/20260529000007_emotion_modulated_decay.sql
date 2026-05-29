-- Emotion-modulated accessibility decay
-- Replaces the flat decay from migration 004 with an emotionally-weighted version.
--
-- Formula: effective_rate = decay_rate × (1 - emotional_intensity × 0.5)
--   emotional_intensity = 0.0 → full decay rate (standard 2%/day)
--   emotional_intensity = 0.5 → 75% of decay rate (1.5%/day)
--   emotional_intensity = 1.0 → 50% of decay rate (1%/day)
--
-- Effect: emotionally charged memories take ~2× longer to reach the floor.
-- This models the well-documented finding that emotional events are retained
-- longer in autobiographical memory than neutral events.

CREATE OR REPLACE FUNCTION apply_accessibility_decay(decay_rate float, floor_val float)
RETURNS int LANGUAGE sql SECURITY DEFINER AS $$
  WITH updated AS (
    UPDATE journal_entries
    SET accessibility_score = GREATEST(floor_val,
      accessibility_score * (1.0 - decay_rate * (1.0 - COALESCE(emotional_intensity, 0.0) * 0.5))
    )
    WHERE accessibility_score > floor_val
    RETURNING id
  )
  SELECT count(*)::int FROM updated;
$$;
