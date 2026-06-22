/**
 * Rescan-time character card audit — auto-remove bad cards, queue uncertain
 * ones for suggestion review, delete after 3 unresolved rescan rounds.
 */

import { logger } from '../../../logger';
import { normalizeNameKey } from '../../../utils/nameNormalization';
import { characterDeletionService } from '../../characterDeletionService';
import { characterMergeService } from '../../characterMergeService';
import { supabaseAdmin } from '../../supabaseClient';
import { characterCardAuditService } from './characterCardAuditService';
import { characterRescanStateService } from './characterRescanStateService';
import type { CharacterCardAuditResult, CharacterAuditStatus } from './characterCardAuditTypes';

export const CARD_AUDIT_MAX_REVIEW_ROUNDS = 3;

export type CharacterCardReviewSuggestion = {
  id: string;
  characterId: string;
  name: string;
  status: CharacterAuditStatus;
  reason: string;
  suggestedTitle?: string;
  reviewRound: number;
  maxRounds: number;
  source: 'card_audit';
  context: string;
};

export type CharacterCardRescanAuditReport = {
  userId: string;
  autoRemoved: number;
  queuedForReview: number;
  deletedAfterThreeStrikes: number;
  reviewSuggestions: CharacterCardReviewSuggestion[];
  actions: Array<{
    characterId: string;
    currentTitle: string;
    applied: string;
    reason: string;
  }>;
};

type ReviewQueueMeta = {
  status: 'pending';
  round: number;
  maxRounds: number;
  lastRescanAt: string;
  auditStatus: CharacterAuditStatus;
  reason: string;
  suggestedTitle?: string;
};

const UNCERTAIN_STATUSES = new Set<CharacterAuditStatus>([
  'needs_context',
  'duplicate_or_merge_candidate',
  'needs_identity_resolution',
]);

import { isCharacterCardUserReviewed } from './characterCardReviewState';
function isConfidentAutoFix(result: CharacterCardAuditResult, metadata: Record<string, unknown>): boolean {
  if (isCharacterCardUserReviewed(metadata)) return false;
  if (result.recommendedAction === 'needs_review') return false;
  if (result.status === 'duplicate_or_merge_candidate') return false;
  if (result.status === 'needs_identity_resolution') return false;

  if (result.status === 'junk_test_data' || result.status === 'bare_title_invalid') return true;
  if (result.status === 'broken_span' && result.mergeCandidates?.[0]) return true;
  if (result.status === 'wrong_domain') return true;
  if (
    result.recommendedAction === 'rename_with_context' &&
    result.suggestedTitle &&
    result.suggestedTitle.trim() !== result.currentTitle.trim() &&
    (result.status === 'valid_contextual_reference' ||
      (result.ambiguousContext?.confidence ?? 0) >= 0.85)
  ) {
    return true;
  }
  return false;
}

function isUncertainForReview(result: CharacterCardAuditResult, metadata: Record<string, unknown>): boolean {
  if (isCharacterCardUserReviewed(metadata)) return false;
  if (isConfidentAutoFix(result, metadata)) return false;
  return (
    UNCERTAIN_STATUSES.has(result.status) ||
    result.recommendedAction === 'needs_review' ||
    (result.recommendedAction === 'rename_with_context' && !result.suggestedTitle)
  );
}

function readReviewRound(metadata: Record<string, unknown>): number {
  const queue = metadata.card_audit_review_queue as ReviewQueueMeta | undefined;
  return typeof queue?.round === 'number' ? queue.round : 0;
}

function buildReviewSuggestion(
  result: CharacterCardAuditResult,
  round: number,
): CharacterCardReviewSuggestion {
  const remaining = Math.max(0, CARD_AUDIT_MAX_REVIEW_ROUNDS - round);
  return {
    id: `card-audit-${result.characterId}`,
    characterId: result.characterId,
    name: result.currentTitle,
    status: result.status,
    reason: result.reason,
    suggestedTitle: result.suggestedTitle,
    reviewRound: round,
    maxRounds: CARD_AUDIT_MAX_REVIEW_ROUNDS,
    source: 'card_audit',
    context:
      remaining > 0
        ? `Review this card (${round}/${CARD_AUDIT_MAX_REVIEW_ROUNDS} rescan rounds). ${remaining} left before auto cleanup with lore re-evaluation.`
        : 'Final review — next rescan will remove this card and re-evaluate source messages.',
  };
}

class CharacterCardRescanAuditService {
  async getPendingReviewSuggestions(userId: string): Promise<CharacterCardReviewSuggestion[]> {
    const { data } = await supabaseAdmin
      .from('characters')
      .select('id, name, metadata, status')
      .eq('user_id', userId)
      .eq('status', 'archived');

    const out: CharacterCardReviewSuggestion[] = [];
    for (const row of data ?? []) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const queue = meta.card_audit_review_queue as ReviewQueueMeta | undefined;
      if (queue?.status !== 'pending') continue;
      out.push({
        id: `card-audit-${row.id}`,
        characterId: row.id,
        name: String(row.name ?? ''),
        status: queue.auditStatus,
        reason: queue.reason,
        suggestedTitle: queue.suggestedTitle,
        reviewRound: queue.round,
        maxRounds: queue.maxRounds ?? CARD_AUDIT_MAX_REVIEW_ROUNDS,
        source: 'card_audit',
        context: `Queued for review (${queue.round}/${queue.maxRounds ?? CARD_AUDIT_MAX_REVIEW_ROUNDS})`,
      });
    }
    return out.sort((a, b) => b.reviewRound - a.reviewRound);
  }

  async applyRescanAudit(userId: string): Promise<CharacterCardRescanAuditReport> {
    const audit = await characterCardAuditService.audit(userId);
    const { data: characterRows } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, metadata, status')
      .eq('user_id', userId);

    const rosterById = new Map(
      (characterRows ?? []).map((r) => [
        r.id,
        {
          metadata: (r.metadata ?? {}) as Record<string, unknown>,
          alias: (r.alias ?? []) as string[],
          status: r.status as string,
        },
      ]),
    );

    const actions: CharacterCardRescanAuditReport['actions'] = [];
    const reviewSuggestions: CharacterCardReviewSuggestion[] = [];
    let autoRemoved = 0;
    let queuedForReview = 0;
    let deletedAfterThreeStrikes = 0;

    for (const result of audit.results) {
      const row = rosterById.get(result.characterId);
      const metadata = row?.metadata ?? {};

      if (isConfidentAutoFix(result, metadata)) {
        const applied = await this.applyConfidentFix(userId, result, row?.alias ?? [], metadata);
        if (applied) {
          autoRemoved += 1;
          actions.push({
            characterId: result.characterId,
            currentTitle: result.currentTitle,
            applied: applied.type,
            reason: result.reason,
          });
        }
        continue;
      }

      if (!isUncertainForReview(result, metadata)) continue;

      const nextRound = readReviewRound(metadata) + 1;

      if (nextRound >= CARD_AUDIT_MAX_REVIEW_ROUNDS) {
        await characterDeletionService.deleteCharacter(userId, result.characterId, {
          redistribute: true,
          reason: 'character_card_audit_three_strike_cleanup',
        });
        deletedAfterThreeStrikes += 1;
        actions.push({
          characterId: result.characterId,
          currentTitle: result.currentTitle,
          applied: 'deleted_after_three_strikes',
          reason: `Unresolved after ${CARD_AUDIT_MAX_REVIEW_ROUNDS} rescan review rounds`,
        });
        continue;
      }

      const queueMeta: ReviewQueueMeta = {
        status: 'pending',
        round: nextRound,
        maxRounds: CARD_AUDIT_MAX_REVIEW_ROUNDS,
        lastRescanAt: new Date().toISOString(),
        auditStatus: result.status,
        reason: result.reason,
        suggestedTitle: result.suggestedTitle,
      };

      await supabaseAdmin
        .from('characters')
        .update({
          status: 'archived',
          updated_at: new Date().toISOString(),
          metadata: {
            ...metadata,
            card_audit_review_queue: queueMeta,
          },
        })
        .eq('id', result.characterId)
        .eq('user_id', userId);

      queuedForReview += 1;
      reviewSuggestions.push(buildReviewSuggestion(result, nextRound));
      actions.push({
        characterId: result.characterId,
        currentTitle: result.currentTitle,
        applied: 'queued_for_review',
        reason: result.reason,
      });
    }

    if (autoRemoved > 0 || deletedAfterThreeStrikes > 0) {
      await characterRescanStateService.recordCardCleanup(userId);
    }

    const report: CharacterCardRescanAuditReport = {
      userId,
      autoRemoved,
      queuedForReview,
      deletedAfterThreeStrikes,
      reviewSuggestions,
      actions,
    };

    logger.info({ userId, ...report }, 'Character card rescan audit completed');
    return report;
  }

  private async applyConfidentFix(
    userId: string,
    result: CharacterCardAuditResult,
    alias: string[],
    metadata: Record<string, unknown>,
  ): Promise<{ type: string } | null> {
    if (result.status === 'junk_test_data' || result.status === 'bare_title_invalid') {
      await characterDeletionService.deleteCharacter(userId, result.characterId, {
        redistribute: true,
        reason: 'character_card_audit_rescan',
      });
      return { type: 'delete' };
    }

    if (result.status === 'broken_span' && result.mergeCandidates?.[0]) {
      await characterMergeService.merge(userId, result.characterId, result.mergeCandidates[0].characterId, {
        mergedBy: 'SYSTEM',
        reason: 'Card audit rescan: broken possessive merge',
      });
      return { type: 'merge' };
    }

    if (result.status === 'wrong_domain') {
      if (result.recommendedAction === 'delete' || result.wrongDomainTarget === 'system') {
        await characterDeletionService.deleteCharacter(userId, result.characterId, {
          redistribute: true,
          reason: 'character_card_audit_rescan',
        });
        return { type: 'delete' };
      }
      await supabaseAdmin
        .from('characters')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('id', result.characterId)
        .eq('user_id', userId);
      return { type: 'archive' };
    }

    if (
      result.recommendedAction === 'rename_with_context' &&
      result.suggestedTitle &&
      result.suggestedTitle.trim() !== result.currentTitle.trim()
    ) {
      const aliasSet = new Set(alias);
      aliasSet.add(result.currentTitle.trim());
      if (result.aliasToAdd) aliasSet.add(result.aliasToAdd);
      aliasSet.delete(result.suggestedTitle.trim());
      await supabaseAdmin
        .from('characters')
        .update({
          name: result.suggestedTitle.trim(),
          alias: [...aliasSet].filter(Boolean),
          updated_at: new Date().toISOString(),
          metadata: {
            ...metadata,
            card_audit_review: {
              action: 'rename',
              from: result.currentTitle,
              to: result.suggestedTitle.trim(),
              reviewedAt: new Date().toISOString(),
              appliedBy: 'rescan_audit',
            },
          },
        })
        .eq('id', result.characterId)
        .eq('user_id', userId);
      return { type: 'rename' };
    }

    return null;
  }

  async resolveReviewSuggestion(
    userId: string,
    characterId: string,
    action: 'keep' | 'delete',
  ): Promise<{ success: boolean; error?: string }> {
    if (action === 'keep') {
      const { data: row, error: fetchErr } = await supabaseAdmin
        .from('characters')
        .select('id, metadata')
        .eq('id', characterId)
        .eq('user_id', userId)
        .maybeSingle();
      if (fetchErr || !row) {
        logger.warn({ fetchErr, userId, characterId }, 'card review keep: character not found');
        return { success: false, error: 'character_not_found' };
      }
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const { card_audit_review_queue: _removed, ...rest } = meta;
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('characters')
        .update({
          status: 'active',
          updated_at: new Date().toISOString(),
          metadata: {
            ...rest,
            card_audit_review: {
              action: 'keep',
              reviewedAt: new Date().toISOString(),
            },
            card_audit_locked: true,
          },
        })
        .eq('id', characterId)
        .eq('user_id', userId)
        .select('id')
        .maybeSingle();
      if (updateErr || !updated) {
        logger.warn({ updateErr, userId, characterId }, 'card review keep: update failed');
        return { success: false, error: 'update_failed' };
      }
      return { success: true };
    }

    await characterDeletionService.deleteCharacter(userId, characterId, {
      redistribute: true,
      reason: 'character_card_audit_review_rejected',
    });
    return { success: true };
  }
}

export const characterCardRescanAuditService = new CharacterCardRescanAuditService();
