-- Tracks user-initiated entity deletions for lore preservation + learning.
CREATE TABLE IF NOT EXISTS public.entity_deletion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('character', 'organization', 'location')),
  entity_id UUID NOT NULL,
  entity_name TEXT NOT NULL,
  normalized_keys TEXT[] NOT NULL DEFAULT '{}',
  deletion_kind TEXT NOT NULL DEFAULT 'permanent' CHECK (deletion_kind IN ('permanent', 'archive')),
  reason TEXT,
  initiated_by TEXT NOT NULL DEFAULT 'USER' CHECK (initiated_by IN ('USER', 'SYSTEM')),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_message_ids UUID[] NOT NULL DEFAULT '{}',
  source_thread_ids UUID[] NOT NULL DEFAULT '{}',
  facts_preserved INTEGER NOT NULL DEFAULT 0,
  claims_preserved INTEGER NOT NULL DEFAULT 0,
  reprocess_jobs_queued INTEGER NOT NULL DEFAULT 0,
  deletion_count INTEGER NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_deletion_events_user_type
  ON public.entity_deletion_events (user_id, entity_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entity_deletion_events_entity_id
  ON public.entity_deletion_events (user_id, entity_id);

CREATE INDEX IF NOT EXISTS idx_entity_deletion_events_normalized_keys
  ON public.entity_deletion_events USING GIN (normalized_keys);

ALTER TABLE public.entity_deletion_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own entity deletion events"
  ON public.entity_deletion_events FOR SELECT
  USING (user_id = auth.uid());

COMMENT ON TABLE public.entity_deletion_events IS
  'User entity deletions — preserves lore snapshots, blocks wrong re-creation, drives reprocessing';
