-- Prevent duplicate conversation_sessions rows for the same (user_id, chat_session_id).
-- ensureConversationSession() in apps/server/src/services/conversationCentered/ingestionPipelineClass.ts
-- does check-then-insert with no constraint, so concurrent ingestion calls can each fail to
-- find an existing row and both insert — producing two conversation_sessions that back one
-- real chat, each independently running episode segmentation and each minting its own
-- duplicate "episode" record (e.g. multiple "Hard Summer" scene_episode rows for one event).
CREATE UNIQUE INDEX IF NOT EXISTS conversation_sessions_user_chat_session_uidx
ON conversation_sessions (user_id, (metadata->>'chat_session_id'))
WHERE metadata->>'chat_session_id' IS NOT NULL;
