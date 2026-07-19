-- Add a dedicated Love & Dating track while preserving the broader
-- Relationships track for family, friendship, and community arcs.

ALTER TABLE public.life_arcs
  DROP CONSTRAINT IF EXISTS life_arcs_track_check;

ALTER TABLE public.life_arcs
  ADD CONSTRAINT life_arcs_track_check
    CHECK (track IN (
      'career',
      'romance',
      'relationships',
      'creative',
      'health',
      'inner',
      'mixed',
      'custom'
    ));

-- Reclassify only arcs with explicit romantic provenance. General family and
-- friendship arcs remain in Relationships.
UPDATE public.life_arcs
SET track = 'romance',
    updated_at = now()
WHERE track = 'relationships'
  AND (
    metadata ? 'romantic_relationship_id'
    OR tags && ARRAY['romantic', 'romance', 'dating']::text[]
  );

-- Keep the relationship-intelligence compatibility view aware of both the
-- historical track value and the new dedicated romance track.
CREATE OR REPLACE VIEW public.relationship_arcs
  WITH (security_invoker = true) AS
  SELECT
    id,
    user_id,
    title,
    arc_type,
    dominant_emotion,
    emotional_arc,
    start_date,
    end_date,
    is_active,
    summary,
    confidence,
    stability_score,
    source,
    tags,
    metadata,
    (metadata->>'romantic_relationship_id')::uuid AS romantic_relationship_id,
    created_at,
    updated_at
  FROM public.life_arcs
  WHERE track IN ('romance', 'relationships');
