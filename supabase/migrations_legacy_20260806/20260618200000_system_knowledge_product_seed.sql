-- =====================================================
-- SYSTEM KNOWLEDGE — product-facing self-model seed
--
-- User-facing facts for LoreBook System Cognition in chat.
-- Complements the technical pipeline seed (20260618100001).
-- =====================================================

INSERT INTO system_knowledge (concept, description, source_file, route, service_name, confidence, last_verified_at)
SELECT v.concept, v.description, v.source_file, v.route, v.service_name, v.confidence, now()
FROM (VALUES
  (
    'product_identity',
    'LoreBook is a personal memory operating system — not a generic chatbot. It accumulates people, moments, and patterns from your conversations into a persistent biographical record.',
    'docs/lorebook-life-os-vision.md',
    NULL,
    NULL,
    1.0
  ),
  (
    'memory_lifecycle',
    'When you share lived experience, LoreBook extracts candidates in the background. Some memories await your confirmation in Memory Review before becoming durable.',
    'apps/server/src/routes/memoryReviewQueue.ts',
    '/api/mrq',
    'memoryReviewQueue',
    1.0
  ),
  (
    'chat_flow',
    'Each message is interpreted (entities, events, relationships), may enqueue background ingestion, and future replies retrieve a bounded working-memory packet — not your entire history at once.',
    'apps/server/src/services/chat/workingMemoryAssembler.ts',
    NULL,
    'workingMemoryAssembler',
    1.0
  ),
  (
    'surfaces',
    'Chat is the input surface. Characters, Locations, Timeline, Events, and Memory Review are where stored data lives — check there to verify what was captured.',
    'docs/lorebook-life-os-vision.md',
    NULL,
    NULL,
    1.0
  ),
  (
    'limitations',
    'Retrieval is reconstruction with a token budget, not perfect omniscience. LoreBook answers from what was loaded for this turn; say honestly when something is not in context.',
    'apps/server/src/services/chat/systemPromptBuilder.ts',
    NULL,
    'systemPromptBuilder',
    1.0
  ),
  (
    'retrieval',
    'Recall checks the current thread first, then structured foundation data (characters, family, biography), then semantic search over journal entries.',
    'apps/server/src/services/chat/explicitRecallService.ts',
    NULL,
    'explicitRecallService',
    1.0
  ),
  (
    'user_is_narrator',
    'You are the main character and narrator of your story. LoreBook tracks people in your life — not you as a character card in Characters.',
    'apps/server/src/services/chat/systemPromptBuilder.ts',
    NULL,
    'systemPromptBuilder',
    1.0
  ),
  (
    'extraction_pipeline',
    'People, places, and groups you mention are extracted automatically — you do not need to create cards manually. Extraction runs after chat, not through the assistant reply.',
    'apps/server/src/services/ingestion/ingestionQueue.ts',
    NULL,
    'ingestionQueue',
    1.0
  )
) AS v(concept, description, source_file, route, service_name, confidence)
WHERE NOT EXISTS (
  SELECT 1 FROM system_knowledge sk WHERE sk.concept = v.concept
);
