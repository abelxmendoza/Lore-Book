-- Knowledge gaps: explicit "things Lorebook doesn't know yet", detected when
-- the user asks about an entity with no record (unknown_entity) or one that
-- is just a name (sparse_entity). Surfaced in the voids dashboard with a
-- "Tell Lorebook" action; auto-filled when the subject later gets a record.

CREATE TABLE IF NOT EXISTS knowledge_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gap_type TEXT NOT NULL CHECK (gap_type IN ('unknown_entity', 'sparse_entity')),
  label TEXT NOT NULL,
  prompt TEXT NOT NULL,
  entity_id UUID,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filled', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- One pending gap per subject; re-asking the same question doesn't duplicate
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_gaps_one_pending
  ON knowledge_gaps (user_id, gap_type, lower(label)) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS knowledge_gaps_user_status ON knowledge_gaps (user_id, status);

ALTER TABLE knowledge_gaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_gaps_owner_select ON knowledge_gaps FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY knowledge_gaps_owner_insert ON knowledge_gaps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY knowledge_gaps_owner_update ON knowledge_gaps FOR UPDATE USING (auth.uid() = user_id);
