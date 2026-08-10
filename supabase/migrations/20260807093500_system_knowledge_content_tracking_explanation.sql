-- =====================================================
-- SYSTEM KNOWLEDGE — content_tracking_explanation
-- Extends product self-model for LoreBook System Cognition.
-- Grounds "how are you tracking/putting this on the timeline?"
-- style meta-questions so the assistant never narrates live
-- tracking work for a turn that persisted nothing new.
-- =====================================================

INSERT INTO system_knowledge (concept, description, source_file, route, service_name, confidence, last_verified_at)
SELECT v.concept, v.description, v.source_file, v.route, v.service_name, v.confidence, now()
FROM (VALUES
  (
    'content_tracking_explanation',
    'Timeline and Swimlanes reflect only what has already been extracted and saved from past turns. Describing how something "would" appear does not create a new record — that only happens through the background extraction pipeline. When asked how this conversation is being tracked, reference only items already shown in context as recorded; frame anything else as a proposed layout, not confirmed as saved.',
    'apps/server/src/services/chat/lorebookSelfModelService.ts',
    NULL,
    'lorebookSelfModelService',
    1.0
  )
) AS v(concept, description, source_file, route, service_name, confidence)
WHERE NOT EXISTS (
  SELECT 1 FROM system_knowledge sk WHERE sk.concept = v.concept
);
