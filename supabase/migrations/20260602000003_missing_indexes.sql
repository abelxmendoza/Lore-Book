-- =====================================================
-- MISSING INDEXES — Phase 6 Cost & Performance
-- Identified in the LLM call path audit and Big-O analysis.
-- Every index here addresses a measured hot path.
--
-- NOTE: Do not use CREATE INDEX CONCURRENTLY here. Supabase Preview /
-- migration runners execute statements in a pipeline/transaction, and
-- CONCURRENTLY is rejected with SQLSTATE 25001.
-- =====================================================

-- 1. Entity relationship dedup (7-column equality filter before every INSERT).
--    Turns the SELECT + conditional INSERT pattern into a single
--    INSERT ... ON CONFLICT DO UPDATE with zero round-trips.
--    entityRelationshipDetector.ts:456 — fires on every message with 2+ entities.
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_rel_dedup
  ON entity_relationships (
    user_id,
    from_entity_id,
    from_entity_type,
    to_entity_id,
    to_entity_type,
    relationship_type,
    scope
  );

-- 2. Event unit link lookups.
--    eventAssemblyService.ts:140 — SELECT per unit inside groupUnitsIntoEvents.
--    Without this index the query is a full table scan on every unit.
CREATE INDEX IF NOT EXISTS idx_event_unit_links_unit_id
  ON event_unit_links (unit_id);

-- 3. Extracted units by user + type + recency.
--    correctionResolutionService.ts:224 — scans units for contradiction detection.
--    Also used by ingestion pipeline to fetch recent units per user.
CREATE INDEX IF NOT EXISTS idx_extracted_units_user_type_created
  ON extracted_units (user_id, type, created_at DESC);

-- 4. Conversation messages session lookup.
--    Multiple services fetch messages by session + user ordered by time.
--    Without this index each fetch is O(total_messages) not O(session_messages).
CREATE INDEX IF NOT EXISTS idx_conversation_messages_session_user_time
  ON conversation_messages (session_id, user_id, created_at DESC);

-- 5. Entity relationships by user + recency.
--    relationshipDriftDetector.ts — samples recent relationships per user.
--    Also used by relationship cycle detector (90-day lookback).
CREATE INDEX IF NOT EXISTS idx_entity_relationships_user_updated
  ON entity_relationships (user_id, updated_at DESC);
