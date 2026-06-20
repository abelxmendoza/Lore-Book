/**
 * Entity Authority — persistence/apply layer (Phase 4).
 *
 * Takes a confirmed authority verdict and (a) applies its effect through the
 * existing per-domain merge services (so there is exactly one canonical entity —
 * no new compatibility layer), and (b) records it in `entity_authority_decisions`
 * as the durable authority graph + audit trail.
 *
 *   MERGE / ALIAS  → *MergeService.merge(source → target); canonical = target
 *   PARENT_CHILD   → child.parent_location_id = parent (places)
 *   LINK           → recorded as a relationship edge in the authority graph
 */
import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';
import { characterMergeService } from './characterMergeService';
import { locationMergeService } from './locationMergeService';
import { organizationMergeService } from './organizationMergeService';
import { projectMergeService } from './projectMergeService';
import type { AuthorityDecision, EntityKind } from './entityAuthorityService';

const PLACE_KINDS = new Set<EntityKind>(['LOCATION', 'VENUE', 'HOUSEHOLD', 'PROPERTY', 'BUSINESS', 'CITY', 'REGION', 'ROOM', 'LANDMARK', 'EVENT']);
const PERSON_KINDS = new Set<EntityKind>(['PERSON']);
const ORG_KINDS = new Set<EntityKind>(['ORGANIZATION', 'COMMUNITY', 'GROUP']);

export interface AuthorityApplyInput {
  kind: EntityKind;
  decision: AuthorityDecision;
  relationship?: string;
  sourceId?: string;
  sourceName?: string;
  targetId?: string;        // canonical / parent
  targetName?: string;
  confidence?: number;
  reason?: string;
  evidence?: string[];
}

export interface AuthorityApplyResult {
  ok: boolean;
  applied: boolean;
  decisionId: string | null;
  canonicalEntityId: string | null;
  mergeReport?: unknown;
  error?: string;
}

class EntityAuthorityApplyService {
  async applyDecision(userId: string, input: AuthorityApplyInput): Promise<AuthorityApplyResult> {
    const { kind, decision } = input;
    let applied = false;
    let canonicalEntityId: string | null = null;
    let mergeReport: unknown;

    try {
      if (decision === 'MERGE' || decision === 'ALIAS') {
        if (!input.sourceId || !input.targetId) throw new Error('MERGE/ALIAS requires sourceId and targetId');
        if (input.sourceId === input.targetId) throw new Error('Cannot merge an entity into itself');
        mergeReport = await this.runMerge(userId, kind, input.sourceId, input.targetId, input.reason);
        canonicalEntityId = input.targetId;
        applied = true;
      } else if (decision === 'PARENT_CHILD') {
        if (input.sourceId && input.targetId) {
          if (PLACE_KINDS.has(kind)) {
            await supabaseAdmin.from('locations')
              .update({ parent_location_id: input.targetId })
              .eq('id', input.sourceId).eq('user_id', userId);
            applied = true;
          } else if (ORG_KINDS.has(kind)) {
            await supabaseAdmin.from('organizations')
              .update({ parent_group_id: input.targetId })
              .eq('id', input.sourceId).eq('user_id', userId);
            applied = true;
          }
        }
        canonicalEntityId = input.targetId ?? null;
      } else if (decision === 'LINK') {
        // Recorded as a relationship edge in the authority graph (below). Domain
        // edge tables (character_/organization_relationships) are written by their
        // own services; here we persist the authoritative link record.
        applied = true;
        canonicalEntityId = null;
      }

      const { data, error } = await supabaseAdmin
        .from('entity_authority_decisions')
        .insert({
          user_id: userId,
          kind,
          decision,
          relationship: input.relationship ?? null,
          source_id: input.sourceId ?? null,
          source_name: input.sourceName ?? null,
          target_id: input.targetId ?? null,
          target_name: input.targetName ?? null,
          canonical_entity_id: canonicalEntityId,
          confidence: input.confidence ?? null,
          reason: input.reason ?? null,
          evidence: input.evidence ?? [],
          status: 'confirmed',
          applied,
        })
        .select('id')
        .single();
      if (error) throw error;

      return { ok: true, applied, decisionId: (data as { id: string }).id, canonicalEntityId, mergeReport };
    } catch (e) {
      logger.error({ error: e, userId, input }, 'applyDecision failed');
      return { ok: false, applied: false, decisionId: null, canonicalEntityId: null, error: e instanceof Error ? e.message : 'apply failed' };
    }
  }

  /** Dismiss a suggestion — record it so it is never re-suggested. */
  async dismiss(userId: string, input: AuthorityApplyInput): Promise<AuthorityApplyResult> {
    const { data, error } = await supabaseAdmin
      .from('entity_authority_decisions')
      .insert({
        user_id: userId, kind: input.kind, decision: input.decision,
        relationship: input.relationship ?? null,
        source_id: input.sourceId ?? null, source_name: input.sourceName ?? null,
        target_id: input.targetId ?? null, target_name: input.targetName ?? null,
        confidence: input.confidence ?? null, reason: input.reason ?? null,
        status: 'dismissed', applied: false,
      })
      .select('id').single();
    if (error) return { ok: false, applied: false, decisionId: null, canonicalEntityId: null, error: error.message };
    return { ok: true, applied: false, decisionId: (data as { id: string }).id, canonicalEntityId: null };
  }

  private async runMerge(userId: string, kind: EntityKind, sourceId: string, targetId: string, reason?: string): Promise<unknown> {
    if (PERSON_KINDS.has(kind)) return characterMergeService.merge(userId, sourceId, targetId, { mergedBy: 'USER', reason });
    if (kind === 'PROJECT') return projectMergeService.merge(userId, sourceId, targetId);
    if (ORG_KINDS.has(kind)) return organizationMergeService.merge(userId, targetId, [sourceId]);
    if (PLACE_KINDS.has(kind)) return locationMergeService.merge(userId, sourceId, targetId, { reason });
    throw new Error(`No merge service for kind ${kind}`);
  }
}

export const entityAuthorityApplyService = new EntityAuthorityApplyService();
