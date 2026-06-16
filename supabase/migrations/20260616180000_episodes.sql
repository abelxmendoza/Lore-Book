-- Episode storage (Episode Activation Sprint — Phase 2).
-- Immutable scene log produced by episodeSegmentationCore; provenance-first.

CREATE TABLE IF NOT EXISTS public.episodes (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_thread_id    uuid        NOT NULL,
  episode_index       int         NOT NULL CHECK (episode_index >= 0),
  title               text        NOT NULL,
  start_at            timestamptz NOT NULL,
  end_at              timestamptz NOT NULL,
  boundary_reason     text        NOT NULL,
  source_message_ids  uuid[]      NOT NULL DEFAULT '{}',
  source_entity_ids   uuid[]      NOT NULL DEFAULT '{}',
  source_location_ids uuid[]      NOT NULL DEFAULT '{}',
  source_event_ids    uuid[]      NOT NULL DEFAULT '{}',
  participant_ids     uuid[]      NOT NULL DEFAULT '{}',
  location_ids        uuid[]      NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT episodes_message_evidence CHECK (cardinality(source_message_ids) > 0),
  CONSTRAINT episodes_time_order CHECK (end_at >= start_at),
  UNIQUE (user_id, source_thread_id, episode_index)
);

CREATE INDEX IF NOT EXISTS episodes_user_thread_idx
  ON public.episodes (user_id, source_thread_id, episode_index);

CREATE INDEX IF NOT EXISTS episodes_user_time_idx
  ON public.episodes (user_id, start_at DESC);

CREATE INDEX IF NOT EXISTS episodes_source_messages_gin
  ON public.episodes USING GIN (source_message_ids);

COMMENT ON TABLE public.episodes IS
  'Conversation episodes segmented from chat_messages via episodeSegmentationCore. Every row requires source_message_ids evidence.';

ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY episodes_owner_select
  ON public.episodes FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY episodes_owner_insert
  ON public.episodes FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY episodes_owner_update
  ON public.episodes FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY episodes_owner_delete
  ON public.episodes FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);
