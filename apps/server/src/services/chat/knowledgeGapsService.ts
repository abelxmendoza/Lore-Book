/**
 * Knowledge Gaps Service — persistence for "things Lorebook doesn't know yet".
 *
 * Gaps detected at chat time (knowledgeGapDetector) are recorded here so the
 * voids dashboard can list them with a "Tell Lorebook" action. Writes are
 * fire-and-forget from the chat path and must never block a response.
 *
 * Lifecycle: pending → filled (the name later resolves with a real record)
 *                    → dismissed (user said don't ask)
 * A unique partial index on (user_id, gap_type, lower(label)) WHERE pending
 * keeps duplicates out without read-before-write.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { KnowledgeGap } from './knowledgeGapDetector';

export interface KnowledgeGapRow {
  id: string;
  user_id: string;
  gap_type: 'unknown_entity' | 'sparse_entity';
  label: string;
  prompt: string;
  entity_id: string | null;
  status: 'pending' | 'filled' | 'dismissed';
  created_at: string;
  resolved_at: string | null;
}

function promptFor(gap: KnowledgeGap): string {
  return gap.type === 'unknown_entity'
    ? `Let me tell you about ${gap.name}: `
    : `Here's more about ${gap.name}: `;
}

class KnowledgeGapsService {
  /** Insert pending gaps; duplicate pendings are silently ignored. */
  async recordGaps(userId: string, gaps: KnowledgeGap[]): Promise<void> {
    for (const gap of gaps) {
      const { error } = await supabaseAdmin.from('knowledge_gaps').insert({
        user_id: userId,
        gap_type: gap.type,
        label: gap.name,
        prompt: promptFor(gap),
        entity_id: gap.entityId ?? null,
        status: 'pending',
      });
      // 23505 = unique violation (already pending) — expected, not an error
      if (error && error.code !== '23505') {
        logger.debug({ error, userId, gap }, '[KnowledgeGaps] record failed');
      }
    }
  }

  /**
   * Mark pending gaps filled when their subject now has a real record.
   * Called when an entity arc loads for a name that previously gapped.
   */
  async markFilled(userId: string, names: string[]): Promise<void> {
    if (names.length === 0) return;
    for (const name of names) {
      const { error } = await supabaseAdmin
        .from('knowledge_gaps')
        .update({ status: 'filled', resolved_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('status', 'pending')
        .ilike('label', `%${name}%`);
      if (error) logger.debug({ error, userId, name }, '[KnowledgeGaps] markFilled failed');
    }
  }

  async listPending(userId: string): Promise<KnowledgeGapRow[]> {
    const { data, error } = await supabaseAdmin
      .from('knowledge_gaps')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      logger.debug({ error, userId }, '[KnowledgeGaps] list failed');
      return [];
    }
    return (data ?? []) as KnowledgeGapRow[];
  }

  async dismiss(userId: string, gapId: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('knowledge_gaps')
      .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
      .eq('id', gapId)
      .eq('user_id', userId)
      .eq('status', 'pending');
    return !error;
  }
}

export const knowledgeGapsService = new KnowledgeGapsService();
