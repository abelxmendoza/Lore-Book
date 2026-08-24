-- Prevent new chat messages from pointing at a conversation thread that does
-- not exist. NOT VALID deliberately avoids rejecting deployment because of
-- historical orphan rows; run scripts/audits/chat-thread-integrity.sql and
-- repair those rows before validating this constraint in a later migration.
--
-- Deploy the server-side ensureChatSession change before this migration so an
-- optimistic first send cannot race the create-thread request.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chat_messages_session_id_fkey'
      AND conrelid = 'public.chat_messages'::regclass
  ) THEN
    ALTER TABLE public.chat_messages
      ADD CONSTRAINT chat_messages_session_id_fkey
      FOREIGN KEY (session_id)
      REFERENCES public.conversation_sessions(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$$;
