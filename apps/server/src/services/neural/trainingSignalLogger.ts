/**
 * Neural Training Signal Logger
 *
 * Accumulates structured training signals for future Knowledge Graph Embedding (KGE)
 * and Graph Neural Network (GNN) models.
 *
 * Nothing here does any model training. This is pure data collection infrastructure —
 * the training data accumulation layer that makes Phase 5 (neural models) possible
 * without requiring a rewrite of the entire pipeline.
 *
 * --- What gets logged ---
 *
 * 1. RETRIEVAL_FEEDBACK
 *    (query, retrieved_entry_ids, implicit_positive: bump_retrieval_count entries)
 *    → Training pairs for dense retrieval (DPR) and reranker fine-tuning
 *    → Positive: entries retrieved AND subsequently bumped (user found them useful)
 *    → Negative: entries retrieved but NOT bumped (shown but not engaged with)
 *
 * 2. ENTITY_CO_OCCURRENCE
 *    (entity_a, entity_b, memory_id, context_text, timestamp)
 *    → TransE/RotatE training triples: (h, r, t) where r is inferred from co-occurrence type
 *    → Builds the knowledge graph edge distribution needed for KGE
 *
 * 3. COMMUNITY_ASSIGNMENT
 *    (node_id, community_id, algorithm, score)
 *    → GNN node classification labels
 *    → Enables supervised GNN training once enough Louvain labels accumulate
 *
 * 4. TEMPORAL_TRANSITION
 *    (edge_id, from_phase, to_phase, days_since_last_evidence, confidence)
 *    → HMM / temporal GNN training data
 *    → Captures how relationships evolve over time for the stochastic phase model
 *
 * --- Storage ---
 * Signals are written to `neural_training_signals` table (JSONB payload).
 * Batched writes, fire-and-forget, never block the hot path.
 *
 * --- When to use ---
 * Call from: memoryRetriever (retrieval feedback), omegaMemoryService (entity co-occurrence),
 * socialNetworkEngine (community assignment), evolveRelationshipsJob (temporal transitions).
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type SignalType =
  | 'retrieval_feedback'
  | 'entity_co_occurrence'
  | 'community_assignment'
  | 'temporal_transition';

export interface RetrievalFeedbackSignal {
  type: 'retrieval_feedback';
  userId: string;
  query: string;
  queryEmbeddingId?: string;  // FK to a cached embedding if available
  retrievedIds: string[];      // all retrieved entry IDs (candidates)
  positiveIds: string[];       // IDs that got bump_retrieval_count (implicit positive)
  strategy: string;            // 'hybrid' | 'keyword' | 'temporal' | 'onset'
  temporalWindow?: { start: string; end: string } | null;
  pprSeeds?: string[];         // entity IDs used to seed PPR
}

export interface EntityCoOccurrenceSignal {
  type: 'entity_co_occurrence';
  userId: string;
  entityA: string;             // omega_entity.id
  entityB: string;             // omega_entity.id
  memoryId: string;            // journal_entry.id that contains both
  coOccurrenceType: 'same_entry' | 'same_event' | 'linked_claim';
  confidence: number;          // from the containing entry/event
  timestamp: string;           // entry date (not created_at)
}

export interface CommunityAssignmentSignal {
  type: 'community_assignment';
  userId: string;
  nodeId: string;              // person_name or entity_id
  communityId: string;         // Louvain community label
  theme: string;               // inferred theme
  cohesion: number;            // community cohesion score
  algorithm: 'louvain';
}

export interface TemporalTransitionSignal {
  type: 'temporal_transition';
  userId: string;
  edgeId: string;
  fromPhase: string;
  toPhase: string;
  daysSinceLastEvidence: number;
  confidence: number;
  kind: 'ASSERTED' | 'EPISODIC';
  trigger: 'decay' | 'reinforce' | 'manual';
}

export type TrainingSignal =
  | RetrievalFeedbackSignal
  | EntityCoOccurrenceSignal
  | CommunityAssignmentSignal
  | TemporalTransitionSignal;

// ── Buffer + flush ────────────────────────────────────────────────────────────

const FLUSH_INTERVAL_MS = 30_000;   // flush every 30 seconds
const MAX_BUFFER_SIZE   = 100;      // or when buffer hits 100 signals

class TrainingSignalLogger {
  private buffer: TrainingSignal[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private enabled = process.env.ENABLE_NEURAL_TRAINING_SIGNALS === 'true';

  constructor() {
    if (this.enabled) this.scheduleFlush();
  }

  /**
   * Log a training signal. Non-blocking — batched and flushed async.
   */
  log(signal: TrainingSignal): void {
    if (!this.enabled) return;
    this.buffer.push(signal);
    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      void this.flush();
    }
  }

  /**
   * Log a retrieval feedback signal after a retrieval cycle completes.
   * Call this from memoryRetriever after bump_retrieval_count fires.
   */
  logRetrieval(params: Omit<RetrievalFeedbackSignal, 'type'>): void {
    this.log({ type: 'retrieval_feedback', ...params });
  }

  /**
   * Log entity co-occurrence from entity_mentions processing.
   * Call when two entities appear in the same journal entry or resolved_event.
   */
  logCoOccurrence(params: Omit<EntityCoOccurrenceSignal, 'type'>): void {
    this.log({ type: 'entity_co_occurrence', ...params });
  }

  /**
   * Log Louvain community assignment after community detection runs.
   */
  logCommunity(params: Omit<CommunityAssignmentSignal, 'type'>): void {
    this.log({ type: 'community_assignment', ...params });
  }

  /**
   * Log a relationship phase transition (for temporal GNN / HMM training).
   */
  logTransition(params: Omit<TemporalTransitionSignal, 'type'>): void {
    this.log({ type: 'temporal_transition', ...params });
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private scheduleFlush(): void {
    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) void this.flush();
    }, FLUSH_INTERVAL_MS);
    // Don't block process exit
    if (this.flushTimer.unref) this.flushTimer.unref();
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.buffer.length);

    try {
      const rows = batch.map(signal => ({
        signal_type: signal.type,
        user_id: (signal as any).userId,
        payload: signal,
        created_at: new Date().toISOString(),
      }));

      const { error } = await supabaseAdmin
        .from('neural_training_signals')
        .insert(rows);

      if (error) {
        logger.debug({ err: error, count: rows.length }, 'Training signal flush failed (non-fatal)');
        // Don't retry — signals are approximate, not critical
      }
    } catch (err) {
      logger.debug({ err }, 'Training signal flush exception (non-fatal)');
    }
  }
}

export const trainingSignalLogger = new TrainingSignalLogger();
