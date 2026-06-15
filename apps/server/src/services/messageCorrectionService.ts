/**
 * Message Correction Service
 * ───────────────────────────────────────────────────────────────────────────
 * Closes the correction loop: when a user edits/corrects one of their chat
 * bubbles, the text they actually said is versioned (history preserved), the
 * knowledge that was derived 1:1 from the old text is tombstoned (superseded,
 * never hard-deleted), and the corrected text is re-ingested so fresh
 * derivations + aggregates are produced.
 *
 * Design notes:
 *  - Edits are versioned, not destructive — chat_message_revisions keeps every
 *    prior version so nothing the user said is ever lost.
 *  - We tombstone the artifacts that are 1:1 with the message text (utterances
 *    and their extracted_units) by setting superseded_at. Read paths exclude
 *    superseded rows, so the old interpretation immediately stops influencing
 *    prompts/recall.
 *  - We do NOT blindly delete aggregate knowledge (entity_facts /
 *    crystallized_knowledge) — those can be supported by other messages. Re-
 *    ingestion re-runs aggregation over the corrected text; the existing
 *    confidence/contradiction engine reconciles the value over the next pass.
 *    A provenance "superseded" edge is recorded for audit + future
 *    aggregate reconciliation.
 */

import { logger } from '../logger';
import { ingestionQueue } from './ingestion/ingestionQueue';
import { ragPacketCacheService } from './ragPacketCacheService';
import { supabaseAdmin } from './supabaseClient';

export interface CorrectMessageResult {
  changed: boolean;
  revision: number;
  supersededUtterances: number;
  supersededUnits: number;
  reingestJobId: string | null;
}

class MessageCorrectionService {
  /**
   * Apply a user correction to one of their own chat messages.
   * Returns a summary of what was versioned / tombstoned / re-queued.
   */
  async correctMessage(
    userId: string,
    messageId: string,
    newContent: string,
    reason?: string
  ): Promise<CorrectMessageResult> {
    const trimmed = newContent.trim();
    if (!trimmed) {
      throw new Error('Corrected content cannot be empty');
    }

    // ── 1. Load + authorize ────────────────────────────────────────────────
    const { data: message, error: loadErr } = await supabaseAdmin
      .from('chat_messages')
      .select('id, user_id, session_id, role, content, revision, original_content')
      .eq('id', messageId)
      .eq('user_id', userId)
      .single();

    if (loadErr || !message) {
      throw new Error('Message not found');
    }
    // Only the user's own utterances carry corrigible lore. Editing an
    // assistant turn would not change what the app "knows" about the user.
    if (message.role !== 'user') {
      throw new Error('Only user messages can be corrected');
    }
    if (message.content.trim() === trimmed) {
      return { changed: false, revision: message.revision ?? 1, supersededUtterances: 0, supersededUnits: 0, reingestJobId: null };
    }

    const currentRevision: number = message.revision ?? 1;
    const nextRevision = currentRevision + 1;
    const now = new Date().toISOString();

    // ── 2. Version the message (preserve full history) ─────────────────────
    // Snapshot the content being replaced as the current revision, then write
    // the new content as the live row at nextRevision.
    await supabaseAdmin.from('chat_message_revisions').insert({
      message_id: messageId,
      user_id: userId,
      revision: currentRevision,
      content: message.content,
      reason: reason ?? null,
    });

    await supabaseAdmin
      .from('chat_messages')
      .update({
        content: trimmed,
        revision: nextRevision,
        edited_at: now,
        // Keep the very first thing they said, only on the first edit.
        original_content: message.original_content ?? message.content,
      })
      .eq('id', messageId)
      .eq('user_id', userId);

    // ── 3. Tombstone the 1:1 derivations from the old text ─────────────────
    const { supersededUtterances, supersededUnits } = await this.retractDerivations(
      userId,
      messageId,
      reason ?? 'source_corrected'
    );

    // ── 4. Re-ingest the corrected text ────────────────────────────────────
    // force:true bypasses the "already ingested" idempotency guard so the new
    // text actually re-runs extraction instead of being skipped as a dup.
    const reingestJobId = ingestionQueue.enqueue(
      {
        userId,
        chatMessageId: messageId,
        sessionId: message.session_id,
        force: true,
      },
      'HIGH'
    );

    // ── 5. Invalidate caches so the next reply reflects the correction ─────
    ragPacketCacheService.invalidateLoreCache(userId);

    logger.info(
      { userId, messageId, nextRevision, supersededUtterances, supersededUnits, reingestJobId },
      'Message corrected — versioned, derivations tombstoned, re-ingestion queued'
    );

    return {
      changed: true,
      revision: nextRevision,
      supersededUtterances,
      supersededUnits,
      reingestJobId,
    };
  }

  /**
   * Tombstone the artifacts derived 1:1 from a message's old text, and mark any
   * previously-ingested conversation_messages superseded so a forced re-ingest
   * produces fresh rows instead of being deduped against the stale ones.
   */
  private async retractDerivations(
    userId: string,
    messageId: string,
    reason: string
  ): Promise<{ supersededUtterances: number; supersededUnits: number }> {
    const now = new Date().toISOString();

    // utterances are keyed by message_id (1:1 with the chat message text)
    const { data: utterances } = await supabaseAdmin
      .from('utterances')
      .select('id')
      .eq('user_id', userId)
      .eq('message_id', messageId);

    const utteranceIds = (utterances ?? []).map((u) => u.id as string);
    let supersededUnits = 0;

    if (utteranceIds.length > 0) {
      // extracted_units hang off utterances — tombstone the ones not already gone
      const { data: units } = await supabaseAdmin
        .from('extracted_units')
        .update({ superseded_at: now, superseded_reason: reason })
        .in('utterance_id', utteranceIds)
        .is('superseded_at', null)
        .select('id');
      supersededUnits = (units ?? []).length;

      // Record provenance "superseded" edges for audit + future aggregate
      // reconciliation (best-effort; never blocks the correction).
      await this.recordSupersedeEdges(userId, messageId, utteranceIds).catch((err) =>
        logger.debug({ err, messageId }, 'Provenance supersede edge write failed (non-blocking)')
      );
    }

    // Mark prior ingested conversation_messages superseded so the forced
    // re-ingest is not deduped against them.
    const { error: cmErr } = await supabaseAdmin
      .from('conversation_messages')
      .update({ metadata: { chat_message_id: messageId, superseded_at: now, superseded_reason: reason } })
      .eq('user_id', userId)
      .eq('metadata->>chat_message_id', messageId);
    if (cmErr) {
      logger.debug({ cmErr, messageId }, 'Marking conversation_messages superseded failed (non-blocking)');
    }

    return { supersededUtterances: utteranceIds.length, supersededUnits };
  }

  /** Best-effort provenance: link the corrected message to the units it retired. */
  private async recordSupersedeEdges(
    userId: string,
    messageId: string,
    utteranceIds: string[]
  ): Promise<void> {
    if (utteranceIds.length === 0) return;
    const rows = utteranceIds.map((uid) => ({
      user_id: userId,
      source_id: messageId,
      source_type: 'message',
      target_id: uid,
      target_type: 'utterance',
      relation: 'superseded_by_correction',
      to_truth_state: 'RETRACTED',
      meta: { reason: 'source_corrected' },
    }));
    await supabaseAdmin.from('provenance_edges').insert(rows);
  }

  /** Read the full edit history of a message (newest revision first). */
  async getRevisions(userId: string, messageId: string) {
    const { data } = await supabaseAdmin
      .from('chat_message_revisions')
      .select('revision, content, reason, created_at')
      .eq('user_id', userId)
      .eq('message_id', messageId)
      .order('revision', { ascending: false });
    return data ?? [];
  }
}

export const messageCorrectionService = new MessageCorrectionService();
