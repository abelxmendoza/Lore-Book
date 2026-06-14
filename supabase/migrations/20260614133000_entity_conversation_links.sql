-- Links certified entities (characters, locations, orgs, skills) to the
-- conversation_sessions where they were mentioned. Origin links preserve the
-- first thread that introduced an entity — threads with links must not be
-- auto-purged while entity knowledge still exists.

CREATE TABLE IF NOT EXISTS public.entity_conversation_links (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type     text        NOT NULL CHECK (entity_type IN ('character', 'location', 'organization', 'skill', 'event')),
  entity_id       uuid        NOT NULL,
  session_id      uuid        NOT NULL REFERENCES public.conversation_sessions(id) ON DELETE RESTRICT,
  link_kind       text        NOT NULL DEFAULT 'mention'
                              CHECK (link_kind IN ('mention', 'origin', 'created')),
  mention_count   int         NOT NULL DEFAULT 1 CHECK (mention_count >= 1),
  first_linked_at timestamptz NOT NULL DEFAULT now(),
  last_linked_at  timestamptz NOT NULL DEFAULT now(),
  metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, entity_type, entity_id, session_id)
);

CREATE INDEX IF NOT EXISTS entity_conversation_links_entity_idx
  ON public.entity_conversation_links (user_id, entity_type, entity_id, last_linked_at DESC);

CREATE INDEX IF NOT EXISTS entity_conversation_links_session_idx
  ON public.entity_conversation_links (user_id, session_id);

CREATE INDEX IF NOT EXISTS entity_conversation_links_origin_idx
  ON public.entity_conversation_links (user_id, entity_type, entity_id)
  WHERE link_kind = 'origin';

COMMENT ON TABLE public.entity_conversation_links IS
  'Many-to-many: entities ↔ conversation_sessions. Origin links mark first mention thread; RESTRICT prevents silent session deletion.';

ALTER TABLE public.entity_conversation_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY entity_conversation_links_owner_select
  ON public.entity_conversation_links FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY entity_conversation_links_owner_insert
  ON public.entity_conversation_links FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY entity_conversation_links_owner_update
  ON public.entity_conversation_links FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY entity_conversation_links_owner_delete
  ON public.entity_conversation_links FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);
