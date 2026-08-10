-- In-chat entity disambiguation questions: gray-zone character mentions defer
-- creation and queue a question the chat asks once. Resolved/dismissed rows
-- are permanent never-re-ask memory.

CREATE TABLE IF NOT EXISTS entity_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id UUID,
  mention_text TEXT NOT NULL,
  mention_lower TEXT NOT NULL,
  candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  asked_count INT NOT NULL DEFAULT 0,
  resolution JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS entity_questions_one_pending
  ON entity_questions (user_id, mention_lower) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS entity_questions_user_status ON entity_questions (user_id, status);

ALTER TABLE entity_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY entity_questions_owner_select ON entity_questions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY entity_questions_owner_insert ON entity_questions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY entity_questions_owner_update ON entity_questions FOR UPDATE USING (auth.uid() = user_id);
