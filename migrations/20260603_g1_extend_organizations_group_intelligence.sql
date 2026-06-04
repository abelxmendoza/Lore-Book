-- =====================================================================
-- G1: Group Intelligence Foundation
-- Extends organizations with the canonical group model
-- Safe migration: all new columns have defaults, existing data preserved
-- Applied: 2026-06-03
-- =====================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS group_type        text    NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS membership_model  text    NOT NULL DEFAULT 'strict',
  ADD COLUMN IF NOT EXISTS user_relationship text    NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS is_public_entity  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS founded_year      int,
  ADD COLUMN IF NOT EXISTS dissolved_year    int;

UPDATE organizations SET group_type = type WHERE group_type = 'other';

ALTER TABLE organizations
  ADD CONSTRAINT organizations_group_type_check
    CHECK (group_type IN (
      'friend_group','band','sports_team','company','club','nonprofit',
      'family','martial_arts','scene','crew','collective',
      'institution','public_entity','other'
    )),
  ADD CONSTRAINT organizations_membership_model_check
    CHECK (membership_model IN ('strict','fuzzy','none')),
  ADD CONSTRAINT organizations_user_relationship_check
    CHECK (user_relationship IN (
      'founder','leader','member','former_member','collaborator',
      'adjacent','fan','aware_of','referenced','alumnus'
    ));

CREATE INDEX IF NOT EXISTS organizations_group_type_idx
  ON organizations (group_type);
CREATE INDEX IF NOT EXISTS organizations_user_relationship_idx
  ON organizations (user_relationship);
CREATE INDEX IF NOT EXISTS organizations_public_entity_idx
  ON organizations (is_public_entity)
  WHERE is_public_entity = true;

ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS left_at date;
