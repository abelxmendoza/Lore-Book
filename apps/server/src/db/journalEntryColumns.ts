/**
 * Every `journal_entries` column EXCEPT the 1536-dim `embedding` vector (~6KB/row).
 * PostgREST serializes embedding as JSON and bills it as egress; read paths that
 * use `select('*')` ship it on every recall even though similarity search runs in
 * the DB (match RPC / HNSW). Keep in sync with journal_entries if columns are added.
 */
export const JOURNAL_COLS =
  'id, user_id, date, content, tags, chapter_id, mood, summary, source, metadata, ' +
  'created_at, updated_at, embedding_model, embedding_version, content_type, ' +
  'original_content, preserve_original_language, accessibility_score, ' +
  'emotional_intensity, retrieval_count, last_retrieved_at, narrative_order, ' +
  'derived_from_entry_id, end_time, time_precision, time_confidence, timestamp';
