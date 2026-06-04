-- =====================================================================
-- G2: Group Intelligence Activation
-- group_candidates: review queue for detected group signals
-- Evidence accumulates, user reviews — nothing auto-created.
-- Applied: 2026-06-04
-- =====================================================================

CREATE TABLE IF NOT EXISTS group_candidates (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid        NOT NULL,
  proposed_name           text,
  detected_members        text[]      NOT NULL DEFAULT '{}',
  suggested_group_type    text        NOT NULL DEFAULT 'friend_group',
  suggested_user_relationship text    NOT NULL DEFAULT 'member',
  suggested_membership_model  text    NOT NULL DEFAULT 'strict',
  is_public_entity        boolean     NOT NULL DEFAULT false,
  confidence              float       NOT NULL DEFAULT 0.65,
  occurrence_count        int         NOT NULL DEFAULT 1,
  source_message_ids      uuid[]      NOT NULL DEFAULT '{}',
  context                 text,
  status                  text        NOT NULL DEFAULT 'pending',
  created_organization_id uuid        REFERENCES organizations(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT group_candidates_status_check
    CHECK (status IN ('pending', 'accepted', 'rejected')),
  CONSTRAINT group_candidates_group_type_check
    CHECK (suggested_group_type IN (
      'friend_group','band','sports_team','company','club','nonprofit',
      'family','martial_arts','scene','crew','collective',
      'institution','public_entity','other'
    )),
  CONSTRAINT group_candidates_relationship_check
    CHECK (suggested_user_relationship IN (
      'founder','leader','member','former_member','collaborator',
      'adjacent','fan','aware_of','referenced','alumnus'
    ))
);

CREATE INDEX IF NOT EXISTS group_candidates_user_idx
  ON group_candidates (user_id);
CREATE INDEX IF NOT EXISTS group_candidates_status_idx
  ON group_candidates (user_id, status)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS group_candidates_members_idx
  ON group_candidates USING gin (detected_members);

ALTER TABLE group_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "group_candidates_user_isolation"
  ON group_candidates FOR ALL
  USING (user_id = auth.uid());
