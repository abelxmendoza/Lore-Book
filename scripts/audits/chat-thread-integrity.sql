-- Read-only chat thread integrity audit. Returns aggregate counts only.
-- Safe to run in production before validating chat_messages_session_id_fkey.
WITH
thread_counts AS (
  SELECT count(*)::bigint AS total_threads
  FROM public.conversation_sessions
),
message_counts AS (
  SELECT count(*)::bigint AS total_messages
  FROM public.chat_messages
),
orphan_counts AS (
  SELECT count(*)::bigint AS orphan_messages
  FROM public.chat_messages message
  LEFT JOIN public.conversation_sessions thread ON thread.id = message.session_id
  WHERE thread.id IS NULL
),
wrong_owner_counts AS (
  SELECT count(*)::bigint AS owner_mismatched_messages
  FROM public.chat_messages message
  JOIN public.conversation_sessions thread ON thread.id = message.session_id
  WHERE message.user_id IS DISTINCT FROM thread.user_id
),
empty_thread_counts AS (
  SELECT count(*)::bigint AS zero_message_threads
  FROM public.conversation_sessions thread
  LEFT JOIN public.chat_messages message
    ON message.session_id = thread.id
   AND message.user_id = thread.user_id
  WHERE message.id IS NULL
),
duplicate_thread_ids AS (
  SELECT count(*)::bigint AS duplicate_thread_id_groups
  FROM (
    SELECT id
    FROM public.conversation_sessions
    GROUP BY id
    HAVING count(*) > 1
  ) duplicates
)
SELECT *
FROM thread_counts
CROSS JOIN message_counts
CROSS JOIN orphan_counts
CROSS JOIN wrong_owner_counts
CROSS JOIN empty_thread_counts
CROSS JOIN duplicate_thread_ids;
