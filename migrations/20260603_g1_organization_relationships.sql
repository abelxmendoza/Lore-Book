-- =====================================================================
-- G1: Organization Relationships table
-- Group-to-group edges with RLS
-- Applied: 2026-06-03
-- =====================================================================

CREATE TABLE IF NOT EXISTS organization_relationships (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL,
  from_org_id       uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  to_org_id         uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  relationship_type text        NOT NULL,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT org_rel_type_check CHECK (
    relationship_type IN (
      'part_of','affiliated_with','rival_of','spawned_from',
      'collaborated_with','succeeded_by','merged_with'
    )
  ),
  CONSTRAINT org_rel_no_self_ref CHECK (from_org_id <> to_org_id),
  UNIQUE (user_id, from_org_id, to_org_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS org_rel_from_idx  ON organization_relationships (from_org_id);
CREATE INDEX IF NOT EXISTS org_rel_to_idx    ON organization_relationships (to_org_id);
CREATE INDEX IF NOT EXISTS org_rel_user_idx  ON organization_relationships (user_id);
CREATE INDEX IF NOT EXISTS org_rel_type_idx  ON organization_relationships (relationship_type);

ALTER TABLE organization_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_relationships_user_isolation"
  ON organization_relationships FOR ALL
  USING (user_id = auth.uid());
