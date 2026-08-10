-- Narrative anchors: retrieval structures clustering entities into life narratives.
-- Anchors emerge from evidence; they do not overwrite canonical entities.

CREATE TABLE IF NOT EXISTS narrative_anchors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text NOT NULL,
  anchor_type     text NOT NULL CHECK (anchor_type IN (
    'life_era', 'school_era', 'work_era', 'relationship_arc',
    'community', 'family_period', 'project_arc', 'travel_period', 'recurring_activity'
  )),
  confidence      real NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  gravity_score   real NOT NULL DEFAULT 0 CHECK (gravity_score >= 0 AND gravity_score <= 1),
  start_date      timestamptz,
  end_date        timestamptz,
  evidence        jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance      jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  consolidation_key text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_narrative_anchors_user_consolidation
  ON narrative_anchors (user_id, consolidation_key)
  WHERE consolidation_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_narrative_anchors_user_type
  ON narrative_anchors (user_id, anchor_type);

CREATE INDEX IF NOT EXISTS idx_narrative_anchors_user_gravity
  ON narrative_anchors (user_id, gravity_score DESC);

CREATE TABLE IF NOT EXISTS narrative_anchor_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anchor_id       uuid NOT NULL REFERENCES narrative_anchors(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_kind     text NOT NULL CHECK (member_kind IN ('entity', 'event', 'group', 'place', 'activity')),
  member_id       uuid,
  member_name     text NOT NULL,
  role            text,
  gravity_score   real,
  evidence        jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_narrative_anchor_members_anchor
  ON narrative_anchor_members (anchor_id);

CREATE INDEX IF NOT EXISTS idx_narrative_anchor_members_entity
  ON narrative_anchor_members (user_id, member_id, member_kind)
  WHERE member_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS entity_gravity_scores (
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id       uuid NOT NULL,
  entity_type     text NOT NULL,
  entity_name     text NOT NULL,
  gravity_score   real NOT NULL DEFAULT 0 CHECK (gravity_score >= 0 AND gravity_score <= 1),
  components      jsonb NOT NULL DEFAULT '{}'::jsonb,
  roles           text[] NOT NULL DEFAULT '{}',
  computed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entity_id, entity_type)
);

CREATE INDEX IF NOT EXISTS idx_entity_gravity_scores_user_score
  ON entity_gravity_scores (user_id, gravity_score DESC);

ALTER TABLE narrative_anchors ENABLE ROW LEVEL SECURITY;
ALTER TABLE narrative_anchor_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_gravity_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY narrative_anchors_user_select ON narrative_anchors
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY narrative_anchor_members_user_select ON narrative_anchor_members
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY entity_gravity_scores_user_select ON entity_gravity_scores
  FOR SELECT USING (auth.uid() = user_id);
