-- Chat reference numbers — durable, human-referencable ids for provenance.
--
-- Threads:  conversation_sessions.thread_number  → "#12"   (per-user sequential)
-- Prompts:  chat_messages.turn_number, reply_seq=0 → "12.4"  (user prompt opens turn 4 of thread 12)
-- Replies:  chat_messages.reply_seq >= 1          → "12.4.1" (assistant reply 1 to prompt 12.4)
--
-- Numbers are assigned once at insert time by triggers (race-safe via advisory
-- locks) and never reassigned, so a reference stays valid even if other
-- messages or threads are later deleted.

-- ── Columns ──────────────────────────────────────────────────────────────────

ALTER TABLE conversation_sessions ADD COLUMN IF NOT EXISTS thread_number INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_sessions_user_thread_no
  ON conversation_sessions(user_id, thread_number)
  WHERE thread_number IS NOT NULL;

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS turn_number INTEGER;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_seq INTEGER;

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_turn
  ON chat_messages(session_id, turn_number, reply_seq);

-- ── Thread numbering trigger ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION assign_thread_number() RETURNS trigger AS $$
BEGIN
  IF NEW.thread_number IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('thread_number:' || NEW.user_id::text, 0));
    SELECT COALESCE(MAX(thread_number), 0) + 1
      INTO NEW.thread_number
      FROM conversation_sessions
     WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_thread_number ON conversation_sessions;
CREATE TRIGGER trg_assign_thread_number
  BEFORE INSERT ON conversation_sessions
  FOR EACH ROW EXECUTE FUNCTION assign_thread_number();

-- ── Message turn/reply numbering trigger ─────────────────────────────────────

CREATE OR REPLACE FUNCTION assign_chat_message_refs() RETURNS trigger AS $$
DECLARE
  max_turn INTEGER;
BEGIN
  IF NEW.turn_number IS NOT NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('chat_refs:' || NEW.session_id::text, 0));
  SELECT COALESCE(MAX(turn_number), 0)
    INTO max_turn
    FROM chat_messages
   WHERE session_id = NEW.session_id;
  IF NEW.role = 'user' THEN
    NEW.turn_number := max_turn + 1;
    NEW.reply_seq := 0;
  ELSE
    -- Assistant/system rows attach to the latest turn (turn 1 if the thread
    -- opens with an assistant message, e.g. a welcome).
    NEW.turn_number := GREATEST(max_turn, 1);
    SELECT COALESCE(MAX(reply_seq), 0) + 1
      INTO NEW.reply_seq
      FROM chat_messages
     WHERE session_id = NEW.session_id
       AND turn_number = NEW.turn_number
       AND role <> 'user';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_chat_message_refs ON chat_messages;
CREATE TRIGGER trg_assign_chat_message_refs
  BEFORE INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION assign_chat_message_refs();

-- ── Backfill existing threads (creation order per user) ──────────────────────

WITH base AS (
  SELECT user_id, COALESCE(MAX(thread_number), 0) AS max_no
    FROM conversation_sessions
   GROUP BY user_id
),
ranked AS (
  SELECT id, user_id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at, id) AS rn
    FROM conversation_sessions
   WHERE thread_number IS NULL
)
UPDATE conversation_sessions cs
   SET thread_number = base.max_no + ranked.rn
  FROM ranked
  JOIN base ON base.user_id = ranked.user_id
 WHERE cs.id = ranked.id;

-- ── Backfill existing messages (chronological turns per session) ─────────────

WITH ordered AS (
  SELECT id, session_id, role, created_at,
         SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END)
           OVER (PARTITION BY session_id ORDER BY created_at, id) AS turn_raw
    FROM chat_messages
   WHERE turn_number IS NULL
),
computed AS (
  SELECT id,
         GREATEST(turn_raw, 1) AS turn,
         CASE WHEN role = 'user' THEN 0
              ELSE ROW_NUMBER() OVER (
                     PARTITION BY session_id, GREATEST(turn_raw, 1), (role <> 'user')
                     ORDER BY created_at, id)
         END AS seq
    FROM ordered
)
UPDATE chat_messages cm
   SET turn_number = computed.turn,
       reply_seq = computed.seq
  FROM computed
 WHERE cm.id = computed.id;
