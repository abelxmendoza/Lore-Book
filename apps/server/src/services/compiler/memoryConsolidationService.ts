// =====================================================
// LORE-KEEPER NARRATIVE COMPILER (LNC)
// Memory Consolidation Service
//
// Closes the ingestion loop:
//   entry_ir → journal_entries → embedding → retrieval eligibility
//
// Architectural invariants enforced here:
//   - entry_ir is NEVER deleted after consolidation (durable compiler output)
//   - Every durable memory preserves full provenance chain
//   - Canon gate: only CANON entries consolidate automatically
//   - Confidence gate: below threshold → review queue, not durable memory
//   - Idempotent: safe to call multiple times on the same IR id
// =====================================================

import { randomUUID } from 'crypto';

import { config } from '../../config';
import { logger } from '../../logger';
import { embeddingService } from '../embeddingService';
import { supabaseAdmin } from '../supabaseClient';

import type { EntryIR, KnowledgeType } from './types';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ConsolidationStatus =
  | 'CONSOLIDATED'
  | 'ALREADY_CONSOLIDATED'
  | 'QUEUED_FOR_REVIEW'
  | 'SKIPPED'
  | 'NOT_FOUND'
  | 'ERROR';

export interface ConsolidationResult {
  status: ConsolidationStatus;
  journalEntryId?: string;
  reason?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

// Knowledge types that auto-consolidate when confidence is sufficient
const AUTO_CONSOLIDATE_TYPES: KnowledgeType[] = ['EXPERIENCE', 'DECISION', 'FACT'];

// Knowledge types that always go to review queue first
const REVIEW_REQUIRED_TYPES: KnowledgeType[] = ['BELIEF', 'FEELING', 'QUESTION'];

// Minimum confidence for auto-consolidation into durable memory.
// Below this: BELIEF/FEELING go to review queue; EXPERIENCE/FACT/DECISION are skipped.
// Tune based on observed consolidation rates via /api/admin/memory-health.
const CONSOLIDATION_THRESHOLD = 0.65;

// ─── Service ─────────────────────────────────────────────────────────────────

class MemoryConsolidationService {

  /**
   * Promote a compiled EntryIR to a durable journal_entry.
   *
   * Call this non-blocking (setImmediate / fire-and-forget) from the
   * ingestion pipeline after IR compilation succeeds. Never await on the
   * chat critical path.
   *
   * Idempotent: calling twice with the same irId is safe — the second call
   * returns ALREADY_CONSOLIDATED without writing a duplicate.
   */
  async consolidateEntry(userId: string, irId: string): Promise<ConsolidationResult> {
    // ── Load IR ──────────────────────────────────────────────────────────────
    const { data: ir, error: irError } = await supabaseAdmin
      .from('entry_ir')
      .select('*')
      .eq('id', irId)
      .eq('user_id', userId)
      .maybeSingle();

    if (irError) {
      logger.warn({ err: irError, irId }, 'consolidateEntry: failed to load entry_ir');
      return { status: 'ERROR', reason: irError.message };
    }
    if (!ir) return { status: 'NOT_FOUND' };

    // ── Idempotency check ─────────────────────────────────────────────────────
    if (ir.consolidation_status === 'CONSOLIDATED' && ir.consolidated_to) {
      return { status: 'ALREADY_CONSOLIDATED', journalEntryId: ir.consolidated_to };
    }

    // ── Canon gate ────────────────────────────────────────────────────────────
    // Only CANON entries auto-consolidate. Roleplay, hypotheticals, fiction,
    // and thought experiments must not pollute autobiographical memory.
    const canonStatus = ir.canon?.status ?? 'CANON';
    if (canonStatus !== 'CANON') {
      await this.markIR(irId, 'SKIPPED', undefined, `canon_status:${canonStatus}`);
      return { status: 'SKIPPED', reason: `canon_status:${canonStatus}` };
    }

    // ── Review queue path ─────────────────────────────────────────────────────
    if (REVIEW_REQUIRED_TYPES.includes(ir.knowledge_type as KnowledgeType)) {
      await this.enqueueForReview(userId, ir);
      await this.markIR(irId, 'QUEUED_FOR_REVIEW');
      return { status: 'QUEUED_FOR_REVIEW' };
    }

    // ── Confidence gate ───────────────────────────────────────────────────────
    if (ir.confidence < CONSOLIDATION_THRESHOLD) {
      await this.markIR(irId, 'SKIPPED', undefined, `confidence:${ir.confidence.toFixed(3)}`);
      return { status: 'SKIPPED', reason: `confidence_below_threshold:${ir.confidence.toFixed(3)}` };
    }

    // ── Type gate ─────────────────────────────────────────────────────────────
    if (!AUTO_CONSOLIDATE_TYPES.includes(ir.knowledge_type as KnowledgeType)) {
      await this.enqueueForReview(userId, ir);
      await this.markIR(irId, 'QUEUED_FOR_REVIEW');
      return { status: 'QUEUED_FOR_REVIEW' };
    }

    // ── Write durable journal_entry ───────────────────────────────────────────
    try {
      const journalEntryId = await this.writeJournalEntry(userId, ir);

      // Mark IR as consolidated — this is the provenance link
      await this.markIR(irId, 'CONSOLIDATED', journalEntryId);

      // Generate embedding non-blocking — BM25 covers retrieval until it lands
      this.generateEmbeddingAsync(userId, journalEntryId, ir.content);

      logger.debug({
        userId,
        irId,
        journalEntryId,
        knowledgeType: ir.knowledge_type,
        confidence: ir.confidence,
      }, 'entry_ir consolidated to journal_entry');

      return { status: 'CONSOLIDATED', journalEntryId };
    } catch (err) {
      logger.warn({ err, irId, userId }, 'consolidateEntry: write failed');
      return { status: 'ERROR', reason: String(err) };
    }
  }

  /**
   * Background sweep: retry all PENDING entry_ir rows for a user.
   * Called by the nightly background job and the dead-letter recovery path.
   */
  async sweepPendingForUser(userId: string): Promise<void> {
    const { data: pending, error } = await supabaseAdmin
      .from('entry_ir')
      .select('id')
      .eq('user_id', userId)
      .eq('consolidation_status', 'PENDING')
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) {
      logger.warn({ err: error, userId }, 'sweepPendingForUser: query failed');
      return;
    }

    for (const row of pending ?? []) {
      await this.consolidateEntry(userId, row.id).catch(err => {
        logger.warn({ err, irId: row.id, userId }, 'sweepPendingForUser: individual consolidation failed');
      });
    }
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async writeJournalEntry(userId: string, ir: EntryIR & Record<string, unknown>): Promise<string> {
    const tags = Array.isArray(ir.themes)
      ? (ir.themes as Array<{ theme: string }>).map(t => t.theme).filter(Boolean)
      : [];

    const { data, error } = await supabaseAdmin
      .from('journal_entries')
      .insert({
        user_id:          userId,
        content:          ir.content,
        date:             ir.timestamp,
        tags,
        source:           'chat',
        embedding_model:  config.embeddingModel,
        embedding_version: 1,
        metadata: {
          // Full provenance chain — every durable memory must preserve this
          source_ir_id:          ir.id,
          source_utterance_id:   ir.source_utterance_id,
          source_thread_id:      ir.thread_id,
          knowledge_type:        ir.knowledge_type,
          certainty_source:      ir.certainty_source,
          canon_status:          ir.canon?.status,
          canon_confidence:      ir.canon?.confidence,
          ir_confidence:         ir.confidence,
          compiler_version:      (ir.compiler_flags as Record<string, unknown>)?.compilation_version ?? 1,
          consolidated_at:       new Date().toISOString(),
          entity_ids:            Array.isArray(ir.entities)
                                   ? (ir.entities as Array<{ entity_id: string }>).map(e => e.entity_id)
                                   : [],
          emotions:              ir.emotions ?? [],
        },
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`journal_entry insert failed: ${error.message}`);
    }
    return data.id;
  }

  private generateEmbeddingAsync(userId: string, journalEntryId: string, content: string): void {
    // Intentionally fire-and-forget.
    // Entry is retrievable via BM25 keyword search until embedding lands.
    setImmediate(async () => {
      try {
        const embedding = await embeddingService.embedText(content);

        await supabaseAdmin
          .from('journal_entries')
          .update({ embedding })
          .eq('id', journalEntryId)
          .eq('user_id', userId);
      } catch (err) {
        logger.warn(
          { err, journalEntryId },
          'Embedding generation failed; entry retrievable via BM25 until re-embedded by nightly job'
        );
      }
    });
  }

  private async markIR(
    irId: string,
    status: 'CONSOLIDATED' | 'SKIPPED' | 'QUEUED_FOR_REVIEW',
    consolidatedTo?: string,
    skipReason?: string
  ): Promise<void> {
    const update: Record<string, unknown> = { consolidation_status: status };
    if (consolidatedTo) {
      update.consolidated_to = consolidatedTo;
      update.consolidated_at = new Date().toISOString();
    }
    if (skipReason) {
      update.consolidation_skip_reason = skipReason;
    }

    const { error } = await supabaseAdmin
      .from('entry_ir')
      .update(update)
      .eq('id', irId);

    if (error) {
      logger.warn({ err: error, irId, status }, 'markIR: failed to update consolidation_status');
    }
  }

  private async enqueueForReview(userId: string, ir: unknown): Promise<void> {
    // The memory review queue activation is tracked in Phase 2.
    // For now, log with enough context to reconstruct the proposal later.
    logger.info(
      { userId, irId: (ir as EntryIR).id, knowledgeType: (ir as EntryIR).knowledge_type },
      'entry_ir queued for human review (memoryReviewQueueService pending activation)'
    );
  }
}

export const memoryConsolidationService = new MemoryConsolidationService();
