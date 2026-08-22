/**
 * Bridges the omega entity graph into the existing group-candidate review
 * queue. Entities routed to `omega_entities` (misclassifiedEntityRouter,
 * characterFoundationService) never had a path into `group_candidates` —
 * so an org-typed entity with real evidence behind it (e.g. "East Los
 * Productions") could sit invisibly in the omega graph indefinitely, never
 * surfacing on the Group Book for the user to accept or reject.
 *
 * This does not create organizations directly — it only proposes a
 * group_candidates row, same as groupDetectionService's structural
 * detection. Nothing is auto-created; the user still reviews and accepts.
 */
import { logger } from '../../logger';
import { inferNamedOrganizationForName } from '../organizations/inference/namedOrganizationInference';
import { applySuggestionCandidate } from '../lorebook/suggestions/applySuggestionCandidate';
import { supabaseAdmin } from '../supabaseClient';
import { normalizeNameKey } from '../../utils/nameNormalization';

const GENERIC_NAME_PREFIX = /^(the|my|our|this|that|these|those|current|anonymous|two|a|an)\b/i;

function looksLikeOrgName(name: string): boolean {
  const trimmed = name.trim();
  if (!/^[A-ZÀ-Ý0-9]/.test(trimmed)) return false;
  if (GENERIC_NAME_PREFIX.test(trimmed)) return false;
  if (trimmed.split(/\s+/).length > 6) return false;
  return true;
}

export interface OmegaOrgPromotionResult {
  promoted: number;
  skippedAsExisting: number;
  skippedAsLowSignal: number;
  candidateIds: string[];
}

class OmegaOrgPromotionService {
  /**
   * Promote one omega entity (already known to be type ORG) into a pending
   * group_candidates row, if it isn't already tracked as an organization or
   * an existing candidate. Safe to call repeatedly — idempotent by name.
   */
  async promoteEntity(
    userId: string,
    omegaEntity: { id: string; primary_name: string; aliases?: string[] | null; mention_count?: number | null },
  ): Promise<string | null> {
    const name = omegaEntity.primary_name?.trim();
    if (!name) return null;
    const key = normalizeNameKey(name);

    const { data: candidates } = await supabaseAdmin
      .from('group_candidates')
      .select('id, proposed_name')
      .eq('user_id', userId);

    // Respect prior review decisions (accepted or rejected) as well as any
    // already-pending candidate — don't create a duplicate proposal.
    const existingCandidate = (candidates ?? []).find(
      (c) => normalizeNameKey(String(c.proposed_name ?? '')) === key,
    );
    if (existingCandidate) return null;

    let createdId: string | null = null;
    const named = inferNamedOrganizationForName(name);
    const write = await applySuggestionCandidate({
      userId,
      domain: 'organizations',
      name,
      incomingType: named?.organizationType ?? 'company',
      extractor: 'omega_org_promotion',
      source: 'omega_backfill',
      onCreate: async () => {
        const { data: created, error } = await supabaseAdmin
          .from('group_candidates')
          .insert({
            user_id: userId,
            proposed_name: name,
            detected_members: [],
            detected_member_ids: [],
            suggested_group_type: named?.organizationType === 'university' ? 'school' : 'company',
            suggested_user_relationship: 'referenced',
            suggested_membership_model: 'strict',
            is_public_entity: false,
            confidence: 0.7,
            occurrence_count: Math.max(1, omegaEntity.mention_count ?? 1),
            source_message_ids: [],
            context: null,
            metadata: {
              inference_source: 'omega_entity_promotion',
              omega_entity_id: omegaEntity.id,
            },
            status: 'pending',
          })
          .select('id')
          .single();

        if (error) {
          logger.warn({ err: error, userId, name }, 'omegaOrgPromotion: failed to create candidate');
          return;
        }
        createdId = created?.id as string;
      },
    });
    if (write.outcome === 'ATTACHED') return write.canonical?.id ?? null;
    return createdId;
  }

  /**
   * Backfill: scan all of a user's ORG-typed omega entities and propose
   * candidates for the ones with real signal behind them that aren't
   * already tracked anywhere. One-time or periodic sweep, not per-message.
   */
  async backfillForUser(userId: string, minMentionCount = 2): Promise<OmegaOrgPromotionResult> {
    const result: OmegaOrgPromotionResult = {
      promoted: 0,
      skippedAsExisting: 0,
      skippedAsLowSignal: 0,
      candidateIds: [],
    };

    const { data: entities, error } = await supabaseAdmin
      .from('omega_entities')
      .select('id, primary_name, aliases, mention_count')
      .eq('user_id', userId)
      .eq('type', 'ORG');
    if (error || !entities) return result;

    for (const entity of entities) {
      const name = (entity.primary_name as string | null)?.trim();
      if (!name) continue;
      const mentionCount = (entity.mention_count as number | null) ?? 0;
      if (mentionCount < minMentionCount || !looksLikeOrgName(name)) {
        result.skippedAsLowSignal++;
        continue;
      }
      const candidateId = await this.promoteEntity(userId, entity as { id: string; primary_name: string; aliases?: string[] | null; mention_count?: number | null });
      if (candidateId) {
        result.promoted++;
        result.candidateIds.push(candidateId);
      } else {
        result.skippedAsExisting++;
      }
    }

    logger.info({ userId, ...result, candidateIds: undefined }, 'omegaOrgPromotion: backfill complete');
    return result;
  }
}

export const omegaOrgPromotionService = new OmegaOrgPromotionService();
