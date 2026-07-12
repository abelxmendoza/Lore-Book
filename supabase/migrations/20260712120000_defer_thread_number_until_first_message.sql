-- Defer conversation_sessions.thread_number until the first user message.
-- Empty "New chat" drafts used to burn sequential numbers and never get used
-- (deleted or abandoned), which made the sidebar #N list look gappy and random
-- when sorted by recency.
--
-- Existing numbered threads keep their permanent refs. New sessions stay NULL
-- until a user message lands; then a number is assigned once and never reused.

-- ── Stop assigning numbers on session insert ────────────────────────────────

CREATE OR REPLACE FUNCTION assign_thread_number() RETURNS trigger AS $$
BEGIN
  -- Intentionally leave NEW.thread_number NULL for new drafts.
  -- Numbers are assigned by assign_thread_number_on_first_message below.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Assign on first user message in the session ─────────────────────────────

CREATE OR REPLACE FUNCTION assign_thread_number_on_first_message() RETURNS trigger AS $$
DECLARE
  owner_id uuid;
BEGIN
  IF NEW.role IS DISTINCT FROM 'user' THEN
    RETURN NEW;
  END IF;

  -- Only claim a number once per session.
  SELECT user_id INTO owner_id
    FROM conversation_sessions
   WHERE id = NEW.session_id
     AND thread_number IS NULL
   FOR UPDATE;

  IF owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('thread_number:' || owner_id::text, 0));

  UPDATE conversation_sessions
     SET thread_number = (
           SELECT COALESCE(MAX(thread_number), 0) + 1
             FROM conversation_sessions
            WHERE user_id = owner_id
         )
   WHERE id = NEW.session_id
     AND thread_number IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_thread_number_on_first_message ON chat_messages;
CREATE TRIGGER trg_assign_thread_number_on_first_message
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION assign_thread_number_on_first_message();
