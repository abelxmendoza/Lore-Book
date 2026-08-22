/**
 * Explicit column projections for the RAG lore bundle.
 * Hot-path chat must never `select('*')` on large lore tables: embeddings,
 * metadata blobs, and unused generated prose are not needed to answer
 * "when / who / where" questions.
 */

/** Characters: identity + ranking fields. Never the embedding vector. */
export const RAG_CHARACTER_COLS =
  'id, user_id, name, alias, pronouns, archetype, role, status, first_appearance, ' +
  'summary, tags, metadata, created_at, updated_at, first_name, last_name, is_nickname, ' +
  'avatar_url, importance_level, importance_score, proximity_level, has_met, ' +
  'relationship_depth';

export const RAG_LOCATION_COLS = 'id, name, aliases, summary, updated_at';

export const RAG_CHAPTER_COLS = 'id, title, summary, description, start_date, end_date';

export const RAG_ERA_COLS = 'id, title, summary, description, start_date, end_date';

export const RAG_SAGA_COLS = 'id, title, summary, description, start_date, end_date';

export const RAG_ARC_COLS = 'id, title, summary, description, start_date, end_date';

export const RAG_ORG_COLS = 'id, name, aliases';

export const RAG_ENTITY_ATTR_COLS =
  'entity_id, entity_type, attribute_type, attribute_value, confidence, is_current, ' +
  'start_time, end_time, evidence_source_ids, metadata';

export const RAG_ROMANCE_COLS =
  'id, user_id, person_id, person_type, relationship_type, status, is_current, ' +
  'is_situationship, exclusivity_status, start_date, end_date, affection_score, ' +
  'compatibility_score, relationship_health, emotional_intensity, love_status';

export const RAG_CORRECTION_COLS =
  'id, user_id, target_type, target_id, original_content, corrected_content, ' +
  'correction_type, confidence, applied, created_at, metadata';

export const RAG_DEPRECATED_UNIT_COLS =
  'id, type, content, confidence, metadata, superseded_at, superseded_reason, created_at';

export const RAG_BIOMETRIC_COLS =
  'id, measurement_date, measurement_type, value, unit, source';

export const RAG_RESOLVED_EVENT_COLS =
  'id, title, summary, start_time, end_time, confidence, people, locations, activities, tags, ' +
  'temporal_precision, temporal_source, temporal_status, temporal_confidence, temporal_expression, created_at, metadata';
