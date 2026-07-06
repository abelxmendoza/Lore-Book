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
import { isWrongDomainStatus } from './characterCardAuditTypes';
import type { CharacterCardAuditResult } from './characterCardAuditTypes';

export type CharacterCardCleanupAction = {
  characterId: string;
  currentTitle: string;
  applied: 'delete' | 'merge' | 'rename' | 'archive' | 'move' | 'skipped';
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
  if (result.status === 'sentence_bleed' || result.status === 'pronoun_fragment') return true;
  if (result.status === 'broken_span' && result.mergeCandidates?.[0]) return true;
  if (isWrongDomainStatus(result.status)) return true;
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
  /**
   * Move a wrong-domain card into its correct book (Organizations, Events,
   * Skills, Locations, Interests). Domains with no book — tool, role, system —
   * are archived with the review trail. Returns null when archived.
   */
  private async moveToTargetBook(
    userId: string,
    result: CharacterCardAuditResult,
    metadata: Record<string, unknown>,
  ): Promise<{ targetName: string } | null> {
    const target = result.wrongDomainTarget;
    const reviewTrail = {
      card_audit_review: {
        action: result.recommendedAction,
        wrongDomainTarget: target,
        reviewedAt: new Date().toISOString(),
        appliedBy: 'card_cleanup',
      },
    };

    const markCard = async (status: 'reclassified' | 'archived', extra: Record<string, unknown> = {}) => {
      await supabaseAdmin
        .from('characters')
        .update({
          status,
          updated_at: new Date().toISOString(),
          metadata: { ...metadata, ...reviewTrail, ...extra },
        })
        .eq('id', result.characterId)
        .eq('user_id', userId);
    };

    const reclassifyTarget =
      target === 'band' || target === 'group'
        ? ('organization' as const)
        : target === 'event' || target === 'process'
          ? ('event' as const)
          : target === 'skill'
            ? ('skill' as const)
            : target === 'place'
              ? ('location' as const)
              : null;

    if (reclassifyTarget) {
      try {
        const { reclassifyCharacterService } = await import('../reclassifyCharacterService');
        const outcome = await reclassifyCharacterService.performReclassification(
          userId,
          { id: result.characterId, name: result.currentTitle, summary: null, metadata },
          reclassifyTarget,
        );
        await markCard('reclassified', {
          reclassified_from: 'character',
          reclassified_to: reclassifyTarget,
          reclassified_at: new Date().toISOString(),
          ...(outcome.targetId ? { reclassified_target_id: outcome.targetId } : {}),
        });
        return { targetName: outcome.targetName };
      } catch (moveError) {
        logger.warn(
          { error: moveError, characterId: result.characterId, reclassifyTarget },
          'card cleanup: book move failed — archiving instead',
        );
      }
    }

    if (target === 'media' || target === 'interest') {
      try {
        const { interestTracker } = await import('../../conversationCentered/interestTracker');
        await interestTracker.saveInterest(userId, {
          interest_name: result.currentTitle,
          interest_category: 'entertainment',
          confidence: 0.8,
          emotional_intensity: 0.5,
          sentiment: 0.3,
          evidence: result.provenanceSummary ?? `Reclassified from character: ${result.currentTitle}`,
          context: 'Moved from Character Book by card audit',
        });
        await markCard('reclassified', {
          reclassified_from: 'character',
          reclassified_to: 'interest',
          reclassified_at: new Date().toISOString(),
        });
        return { targetName: result.currentTitle };
      } catch (interestError) {
        logger.warn(
          { error: interestError, characterId: result.characterId },
          'card cleanup: interest move failed — archiving instead',
        );
      }
    }

    await markCard('archived');
    return null;
  }

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
            isWrongDomainStatus(result.status)
              ? ['band', 'group', 'event', 'process', 'skill', 'place', 'media', 'interest'].includes(
                  result.wrongDomainTarget ?? '',
                )
                ? 'move'
                : 'archive'
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
        if (
          result.status === 'junk_test_data' ||
          result.status === 'bare_title_invalid' ||
          result.status === 'sentence_bleed' ||
          result.status === 'pronoun_fragment'
        ) {
          let appliedKind: 'delete' | 'archive' = 'delete';
          try {
            await characterDeletionService.deleteCharacter(userId, result.characterId, {
              redistribute: true,
              reason: 'character_card_audit_cleanup',
            });
          } catch (deleteError) {
            // Deletion policy requires the pending-deletion queue — archive with
            // the review trail instead so the card leaves the book either way.
            logger.warn(
              { error: deleteError, characterId: result.characterId },
              'card cleanup: direct delete blocked — archiving instead',
            );
            await supabaseAdmin
              .from('characters')
              .update({
                status: 'archived',
                updated_at: new Date().toISOString(),
                metadata: {
                  ...metadata,
                  card_audit_review: {
                    action: 'delete',
                    reviewedAt: new Date().toISOString(),
                    appliedBy: 'card_cleanup',
                  },
                },
              })
              .eq('id', result.characterId)
              .eq('user_id', userId);
            appliedKind = 'archive';
          }
          applied += 1;
          actions.push({
            characterId: result.characterId,
            currentTitle: result.currentTitle,
            applied: appliedKind,
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

        if (isWrongDomainStatus(result.status)) {
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

          // Move the entity into its correct book where one exists; archive
          // only the domains that have no book (tool, role, interest, system).
          const moved = await this.moveToTargetBook(userId, result, metadata);
          applied += 1;
          actions.push({
            characterId: result.characterId,
            currentTitle: result.currentTitle,
            applied: moved ? 'move' : 'archive',
            reason: result.reason,
            targetTitle: moved?.targetName,
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
