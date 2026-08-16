-- Durable "this thread is about X" link, sourced from the client-side
-- ChatFocus at first-message time (see applyChatFocusOriginLink in
-- apps/server/src/routes/chat.ts). Previously this was client-only UI
-- state, discarded after the first turn — nothing let an entity's own
-- timeline pull in the threads that were actually opened about it.
--
-- No FK on primary_entity_id: it's polymorphic across characters,
-- locations, and organizations, same pattern already used by
-- entity_conversation_links.entity_id.

ALTER TABLE public.conversation_sessions
  ADD COLUMN primary_entity_type text
    CHECK (primary_entity_type IN ('character', 'location', 'organization')),
  ADD COLUMN primary_entity_id uuid;

CREATE INDEX conversation_sessions_primary_entity_idx
  ON public.conversation_sessions (user_id, primary_entity_type, primary_entity_id);

COMMENT ON COLUMN public.conversation_sessions.primary_entity_type IS
  'Entity kind this thread was opened about (from ChatFocus), first-write-wins. Null for threads with no originating focus.';
COMMENT ON COLUMN public.conversation_sessions.primary_entity_id IS
  'Entity id this thread was opened about (from ChatFocus), first-write-wins.';
