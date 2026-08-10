-- Full-text search indexes for chat history.
--
-- Context: chat_messages / conversation_messages had only btree indexes on
-- (user_id, session_id, created_at) — no index over `content`, so searching the
-- text of past queries/responses was an unindexed scan. These GIN indexes make
-- every chat input and AI response indexable/searchable.
--
-- Query side: use websearch_to_tsquery, e.g.
--   select * from chat_messages
--   where to_tsvector('english', content) @@ websearch_to_tsquery('english', :q);

create index if not exists idx_chat_messages_content_fts
  on public.chat_messages using gin (to_tsvector('english', content));

create index if not exists idx_conversation_messages_content_fts
  on public.conversation_messages using gin (to_tsvector('english', content));
