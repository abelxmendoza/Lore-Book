/**
 * Association → Books Bridge.
 *
 * Routes the (evidence-gated) outputs of the association graph into the existing
 * confirm-before-truth book pipelines — it does NOT hard-create records:
 *
 *   member_of edges (explicit)      → organizationSuggestionService (Orgs book)
 *   community / friend_group groups → groupCandidateService (Groups review queue)
 *
 * This is the payoff of the layer: groups/memberships only ever reach the books
 * AFTER the promotion thresholds are met, so the old "mention → group" jump
 * (Leslie & Tio Family, Club Nova Community from one visit) cannot happen.
 *
 * Heavy book services are dynamically imported so this file stays cheap to load
 * and free of import cycles. Every route is fail-open.
 */
import { logger } from '../../logger';
import type { IngestResult } from './associationInferenceService';
import type { AssociationObservation } from './associationTypes';

export interface BridgeResult {
  organizationSuggestions: number;
  groupCandidates: number;
}

/** Map the association target kind / evidence to an organization type. */
function orgTypeFor(obs: AssociationObservation): string {
  const rules = obs.evidence.rulesFired.join(' ');
  if (obs.target.kind === 'school') return /university|college/i.test(obs.target.name) ? 'university' : 'school';
  if (/employment/i.test(rules) || obs.target.kind === 'organization') return 'employer';
  return 'company';
}

export const associationBookBridge = {
  async route(userId: string, result: IngestResult, sourceMessageId?: string): Promise<BridgeResult> {
    const out: BridgeResult = { organizationSuggestions: 0, groupCandidates: 0 };

    // ── member_of (explicit) → organization suggestions ──────────────────────
    // Dedupe by normalized target name: the semantic adapter and the regex
    // fallback can both assert membership in the same org under different ids
    // (canonical vs provisional). Prefer the canonical (non-provisional) id.
    const byName = new Map<string, AssociationObservation>();
    for (const o of result.observations) {
      if (o.associationType !== 'member_of' || !o.explicit || o.target.name.trim().length <= 1) continue;
      const key = o.target.name.trim().toLowerCase();
      const existing = byName.get(key);
      if (!existing || (existing.target.id.startsWith('prov:') && !o.target.id.startsWith('prov:'))) {
        byName.set(key, o);
      }
    }
    const memberships = [...byName.values()];
    if (memberships.length > 0) {
      try {
        const { organizationSuggestionService } = await import('../organizations/organizationSuggestionService');
        for (const obs of memberships) {
          const ok = await organizationSuggestionService.upsertFromInference(
            userId,
            {
              displayName: obs.target.name,
              organizationType: orgTypeFor(obs) as never,
              context: {},
              aliases: [],
              evidencePhrases: [obs.evidence.quote],
              sourceMessageIds: sourceMessageId ? [sourceMessageId] : [],
              confidence: Math.max(0.9, obs.evidence.confidence),
              inferredNotConfirmed: true,
              requiresReview: true,
              promotionStatus: 'suggested_organization',
            },
            { sourceMessageId, source: 'chat' },
          );
          if (ok) out.organizationSuggestions += 1;
        }
      } catch (error) {
        logger.debug({ error, userId }, 'association→org suggestion route failed (non-fatal)');
      }
    }

    // ── community / friend_group → group review candidates ────────────────────
    if (result.groups.length > 0) {
      try {
        const { groupCandidateService } = await import('../groupCandidateService');
        const detected = result.groups.map((g) => ({
          name: g.name,
          members: g.memberNames,
          member_ids: g.memberIds.filter((id) => !id.startsWith('prov:')),
          context: `${g.reason}${g.sharedAnchors.length ? ` · anchors: ${g.sharedAnchors.join(', ')}` : ''}`.slice(0, 200),
          // Earned via promotion thresholds → review candidate, not auto-create.
          confidence: 0.72,
          group_type: (g.kind === 'community' ? 'community' : 'friend_group') as never,
          membership_model: 'fuzzy' as never,
          user_relationship: 'member' as never,
          is_public_entity: false,
        }));
        await groupCandidateService.ingestExternalDetections(
          userId,
          detected as never,
          sourceMessageId ?? 'association-graph',
        );
        out.groupCandidates += detected.length;
      } catch (error) {
        logger.debug({ error, userId }, 'association→group candidate route failed (non-fatal)');
      }
    }

    return out;
  },
};
