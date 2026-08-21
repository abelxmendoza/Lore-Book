/**
 * Phase 0 map of recurring / post-message workers that touch durable lore.
 * Classification is the contract; only A/B workers in the priority list
 * were converted to delta in this slice.
 */

export type WorkerClass =
  | 'DELTA-SAFE'
  | 'NEEDS OVERLAP WINDOW'
  | 'TRUE FULL RECOMPUTE'
  | 'RECOVERY ONLY'
  | 'REDUNDANT'
  | 'DEAD';

export type BackgroundWorkerRecord = {
  id: string;
  trigger: string;
  frequency: string;
  queryWindow: string;
  rowsLoaded: string;
  llmCalls: string;
  embeddingCalls: string;
  writeVolume: string;
  existingCursor: string;
  idempotency: string;
  overlapReason: string;
  classification: WorkerClass;
  tables: string[];
};

export const BACKGROUND_WORKER_MAP: BackgroundWorkerRecord[] = [
  {
    id: 'event_recovery',
    trigger: 'graphRecoveryTrigger.schedule (live), diagnostics/scripts (manual)',
    frequency: 'debounced 15s, cooldown 30m live; on-demand otherwise',
    queryWindow: 'was last 800 chat_messages + all sessions + 2000 facts',
    rowsLoaded: '~800 messages + session metadata + ≤2000 facts',
    llmCalls: '0 (regex patterns)',
    embeddingCalls: '0',
    writeVolume: 'insert resolved_events on first match of recovery_key',
    existingCursor: 'in-memory lastRunAt only (process-local)',
    idempotency: 'recovery_key / title on resolved_events',
    overlapReason: 'regex may span adjacent messages; 10min overlap is enough',
    classification: 'NEEDS OVERLAP WINDOW',
    tables: ['chat_messages', 'conversation_sessions', 'entity_facts', 'resolved_events'],
  },
  {
    id: 'event_assembly',
    trigger: 'ingestionPipeline after extracted units; /assemble-events; life-log recovery',
    frequency: 'every ingested message with EXPERIENCE units; explicit route; 60s recovery cooldown',
    queryWindow: 'was last 30 days / 1000 EXPERIENCE units',
    rowsLoaded: '≤1000 extracted_units',
    llmCalls: '1–3 per promoted scene (omegaMemoryService.ingestText)',
    embeddingCalls: '0 directly (ingestText may embed during resolve)',
    writeVolume: 'moments/scenes/resolved_events/event_unit_links; often identical UPDATEs',
    existingCursor: 'none (windowDays only)',
    idempotency: 'source_fingerprint + canonical_event_key + event_unit_links',
    overlapReason: 'groupUnitsIntoEvents uses 24h entity proximity',
    classification: 'NEEDS OVERLAP WINDOW',
    tables: ['extracted_units', 'resolved_events', 'event_unit_links', 'narrative_moments', 'narrative_scenes'],
  },
  {
    id: 'graph_relationship_recovery',
    trigger: 'same as event_recovery (graphRecoveryTrigger)',
    frequency: 'same 30m cooldown',
    queryWindow: 'broad relationship corpus',
    rowsLoaded: 'relationship pairs; historically ~57 identical UPDATEs per idle run',
    llmCalls: '0 typical',
    embeddingCalls: '0',
    writeVolume: 'relationships created/updated',
    existingCursor: 'pipeline_runs hwm:relationship_foundation',
    idempotency: 'pair key + evidence source ids; skip identical canonical writes',
    overlapReason: 'co-mention can straddle adjacent messages; 10min overlap, evidence ids deduped',
    classification: 'NEEDS OVERLAP WINDOW',
    tables: ['character_relationships', 'characters', 'entity_facts', 'resolved_events', 'chat_messages'],
  },
  {
    id: 'life_log_coverage_recovery',
    trigger: 'scheduleLifeLogCoverageRecovery',
    frequency: '60s per-user cooldown',
    queryWindow: 'ingestionRecovery scan 100 + assembleEvents windowDays 365',
    rowsLoaded: 'up to a year of EXPERIENCE units',
    llmCalls: 'via event assembly',
    embeddingCalls: '0',
    writeVolume: 'replay-safe assembly writes',
    existingCursor: 'in-memory lastStartedAt',
    idempotency: 'replay-safe downstream writers',
    overlapReason: 'explicit historical coverage repair',
    classification: 'RECOVERY ONLY',
    tables: ['chat_messages', 'extracted_units', 'resolved_events'],
  },
  {
    id: 'ingestion_jobs',
    trigger: 'chat persist → durable queue',
    frequency: 'per user message',
    queryWindow: 'single chat_message_id',
    rowsLoaded: '1 message + thread context',
    llmCalls: 'entity extraction when gate opens',
    embeddingCalls: 'optional resolve path',
    writeVolume: 'extracted_units, entities, MRQ',
    existingCursor: 'ingestion_jobs idempotency_key + lease',
    idempotency: 'idempotency_key unique',
    overlapReason: 'none — per-message',
    classification: 'DELTA-SAFE',
    tables: ['chat_messages', 'extracted_units', 'ingestion_jobs'],
  },
  {
    id: 'memory_extraction_worker',
    trigger: 'cron 60s',
    frequency: '1 min',
    queryWindow: 'ended/stale sessions pending extraction',
    rowsLoaded: 'batch 10 sessions',
    llmCalls: 'memory-worthy extract',
    embeddingCalls: 'journal embed on write',
    writeVolume: 'journal_entries',
    existingCursor: 'session extraction_status state machine',
    idempotency: 'status transitions (pending/processing/completed)',
    overlapReason: 'skipped sessions re-eval after 24h',
    classification: 'DELTA-SAFE',
    tables: ['conversation_sessions', 'journal_entries'],
  },
  {
    id: 'enrichment_nightly',
    trigger: 'node-cron (enrichmentJob)',
    frequency: 'nightly',
    queryWindow: 'per-entry analyzers + full-user engines',
    rowsLoaded: 'journal history per user engine',
    llmCalls: 'per engine',
    embeddingCalls: 'some engines',
    writeVolume: 'wisdom/growth/values/… derived tables',
    existingCursor: 'none on user analyzers',
    idempotency: 'engine-specific',
    overlapReason: 'user analyzers are TRUE FULL RECOMPUTE by design',
    classification: 'TRUE FULL RECOMPUTE',
    tables: ['journal_entries', 'wisdom', 'growth', 'values', 'habits'],
  },
  {
    id: 'response_compiler_semantic',
    trigger: 'post-stream chat.ts before persist',
    frequency: 'every assistant reply',
    queryWindow: 'current turn + canon facts',
    rowsLoaded: 'canon facts + witnesses',
    llmCalls: '0',
    embeddingCalls: '≤8 claims + ≤12 witnesses + lore matcher',
    writeVolume: 'none (metadata on persist)',
    existingCursor: 'embeddingCache TinyLFU + embeddings_cache',
    idempotency: 'content hash (was missing model version)',
    overlapReason: 'none',
    classification: 'DELTA-SAFE',
    tables: ['embeddings_cache'],
  },
  {
    id: 'omega_ingest_text',
    trigger: 'event assembly / MRQ / memory namespace',
    frequency: 'per promoted scene historically',
    queryWindow: 'scene source text',
    rowsLoaded: '1 text blob',
    llmCalls: 'extractEntities + extractClaims + extractRelationships (1–3)',
    embeddingCalls: 'entity resolve fallback',
    writeVolume: 'MRQ claims, entity timestamps',
    existingCursor: 'in-process extractEntities hash (global text)',
    idempotency: 'none durable',
    overlapReason: 'none — should reuse message-level IR',
    classification: 'REDUNDANT',
    tables: ['omega_entities', 'memory_review_queue'],
  },
  {
    id: 'inference_orchestrator',
    trigger: 'after chat ingest (debounced)',
    frequency: 'coalesced per user',
    queryWindow: 'domain-specific',
    rowsLoaded: 'varies (includes graph_recovery)',
    llmCalls: 'domain-specific',
    embeddingCalls: 'domain-specific',
    writeVolume: 'locations/orgs/standing',
    existingCursor: 'orchestrator debounce state',
    idempotency: 'per domain',
    overlapReason: 'graph_recovery nested — now delta',
    classification: 'NEEDS OVERLAP WINDOW',
    tables: ['locations', 'organizations', 'resolved_events'],
  },
];

export function workerById(id: string): BackgroundWorkerRecord | undefined {
  return BACKGROUND_WORKER_MAP.find((w) => w.id === id);
}

export function workersByClass(classification: WorkerClass): BackgroundWorkerRecord[] {
  return BACKGROUND_WORKER_MAP.filter((w) => w.classification === classification);
}
