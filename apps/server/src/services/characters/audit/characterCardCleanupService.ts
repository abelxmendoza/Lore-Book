/**
 * Applies high-confidence character card audit fixes without losing lore.
 * Deletes use redistribution + reprocessing; wrong-domain cards are archived.
 */

import { logger } from '../../../logger';
import { normalizeNameKey } from '../../../utils/nameNormalization';
import { characterMergeService } from '../../characterMergeService';
import { characterDeletionService } from '../../characterDeletionService';
import { supabaseAdmin } from '../../supabaseClient';
import { characterCardAuditService } from './characterCardAuditService';
import { characterRescanStateService } from './characterRescanStateService';
import type { CharacterCardAuditResult } from './characterCardAuditTypes';

export type CharacterCardCleanupAction = {
  characterId: string;
  currentTitle: string;
  applied: 'delete' | 'merge' | 'rename' | 'archive' | 'skipped';
  reason: string;
  targetTitle?: string;
  mergeTargetId?: string;
};

export type CharacterCardCleanupReport = {
  userId: string;
  dryRun: boolean;
  audited: number;
  applied: number;
  skipped: number;
  actions: CharacterCardCleanupAction[];
};

import { isCharacterCardUserReviewed } from './characterCardReviewState';
function shouldAutoApply(result: CharacterCardAuditResult, metadata: Record<string, unknown>): boolean {
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

class CharacterCardCleanupService {
  async applySafeFixes(
    userId: string,
    opts: { dryRun?: boolean } = {},
  ): Promise<CharacterCardCleanupReport> {
    const dryRun = opts.dryRun === true;
    const audit = await characterCardAuditService.audit(userId);
    const actions: CharacterCardCleanupAction[] = [];
    let applied = 0;
    let skipped = 0;

    const { data: characterRows } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, metadata')
      .eq('user_id', userId);

    const rosterById = new Map(
      (characterRows ?? []).map((r) => [
        r.id,
        {
          metadata: (r.metadata ?? {}) as Record<string, unknown>,
          alias: (r.alias ?? []) as string[],
        },
      ]),
    );

    for (const result of audit.results) {
      const row = rosterById.get(result.characterId);
      const metadata = row?.metadata ?? {};
      if (!shouldAutoApply(result, metadata)) {
        skipped += 1;
        actions.push({
          characterId: result.characterId,
          currentTitle: result.currentTitle,
          applied: 'skipped',
          reason: isCharacterCardUserReviewed(metadata) ? 'User already reviewed' : result.reason,
        });
        continue;
      }

      if (dryRun) {
        applied += 1;
        actions.push({
          characterId: result.characterId,
          currentTitle: result.currentTitle,
          applied:
            result.status === 'wrong_domain'
              ? 'archive'
              : result.recommendedAction === 'merge'
                ? 'merge'
                : result.recommendedAction === 'rename_with_context'
                  ? 'rename'
                  : 'delete',
          reason: result.reason,
          targetTitle: result.suggestedTitle,
          mergeTargetId: result.mergeCandidates?.[0]?.characterId,
        });
        continue;
      }

      try {
        if (result.status === 'junk_test_data' || result.status === 'bare_title_invalid') {
          await characterDeletionService.deleteCharacter(userId, result.characterId, {
            redistribute: true,
            reason: 'character_card_audit_cleanup',
          });
          applied += 1;
          actions.push({
            characterId: result.characterId,
            currentTitle: result.currentTitle,
            applied: 'delete',
            reason: result.reason,
          });
          continue;
        }

        if (result.status === 'broken_span' && result.mergeCandidates?.[0]) {
          const targetId = result.mergeCandidates[0].characterId;
          await characterMergeService.merge(userId, result.characterId, targetId, {
            mergedBy: 'SYSTEM',
            reason: `Card audit: broken possessive merge into ${result.mergeCandidates[0].currentTitle}`,
          });
          applied += 1;
          actions.push({
            characterId: result.characterId,
            currentTitle: result.currentTitle,
            applied: 'merge',
            reason: result.reason,
            mergeTargetId: targetId,
            targetTitle: result.mergeCandidates[0].currentTitle,
          });
          continue;
        }

        if (result.status === 'wrong_domain') {
          if (result.recommendedAction === 'delete' || result.wrongDomainTarget === 'system') {
            await characterDeletionService.deleteCharacter(userId, result.characterId, {
              redistribute: true,
              reason: 'character_card_audit_cleanup',
            });
            applied += 1;
            actions.push({
              characterId: result.characterId,
              currentTitle: result.currentTitle,
              applied: 'delete',
              reason: result.reason,
            });
            continue;
          }

          await supabaseAdmin
            .from('characters')
            .update({
              status: 'archived',
              updated_at: new Date().toISOString(),
              metadata: {
                ...metadata,
                card_audit_review: {
                  action: result.recommendedAction,
                  wrongDomainTarget: result.wrongDomainTarget,
                  reviewedAt: new Date().toISOString(),
                  appliedBy: 'card_cleanup',
                },
              },
            })
            .eq('id', result.characterId)
            .eq('user_id', userId);
          applied += 1;
          actions.push({
            characterId: result.characterId,
            currentTitle: result.currentTitle,
            applied: 'archive',
            reason: result.reason,
          });
          continue;
        }

        if (
          result.recommendedAction === 'rename_with_context' &&
          result.suggestedTitle &&
          result.suggestedTitle.trim() !== result.currentTitle.trim()
        ) {
          const aliasSet = new Set(row?.alias ?? []);
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
                  appliedBy: 'card_cleanup',
                },
                ambiguous_character_context: result.ambiguousContext ?? metadata.ambiguous_character_context,
              },
            })
            .eq('id', result.characterId)
            .eq('user_id', userId);

          applied += 1;
          actions.push({
            characterId: result.characterId,
            currentTitle: result.currentTitle,
            applied: 'rename',
            reason: result.reason,
            targetTitle: result.suggestedTitle.trim(),
          });
          continue;
        }

        skipped += 1;
        actions.push({
          characterId: result.characterId,
          currentTitle: result.currentTitle,
          applied: 'skipped',
          reason: 'No auto-apply rule matched',
        });
      } catch (err) {
        logger.warn({ err, userId, characterId: result.characterId }, 'Card cleanup action failed');
        skipped += 1;
        actions.push({
          characterId: result.characterId,
          currentTitle: result.currentTitle,
          applied: 'skipped',
          reason: err instanceof Error ? err.message : 'Cleanup failed',
        });
      }
    }

    if (!dryRun && applied > 0) {
      await characterRescanStateService.recordCardCleanup(userId);
      const validatedKeys = actions
        .filter((a) => a.applied !== 'skipped')
        .flatMap((a) => [normalizeNameKey(a.currentTitle), a.targetTitle ? normalizeNameKey(a.targetTitle) : ''])
        .filter(Boolean);
      if (validatedKeys.length > 0) {
        const state = await characterRescanStateService.load(userId);
        await characterRescanStateService.save(userId, {
          validatedPersonKeys: [...new Set([...state.validatedPersonKeys, ...validatedKeys])].slice(-500),
        });
      }
    }

    const report: CharacterCardCleanupReport = {
      userId,
      dryRun,
      audited: audit.results.length,
      applied,
      skipped,
      actions,
    };

    logger.info({ userId, dryRun, applied, skipped }, 'Character card cleanup completed');
    return report;
  }
}

export const characterCardCleanupService = new CharacterCardCleanupService();
