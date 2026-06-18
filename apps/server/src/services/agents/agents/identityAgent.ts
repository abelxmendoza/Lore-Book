/**
 * IDENTITY AGENT (v1 — deterministic)
 *
 * Reviews the people/entities the pipeline detected and reasons about identity:
 *
 *   - Reports resolved pronoun/reference links (informational).
 *   - Flags identity collisions (same name claimed as both self and a
 *     relationship). These MUST NOT auto-merge — they become a review proposal.
 *   - Surfaces merge/alias suggestions from the meaning layer's ontology action
 *     candidates as proposed actions routed to Entity Authority.
 *
 * Pure: reads the pipeline result, returns a result. It never merges, renames,
 * or writes anything — every change is a proposal requiring confirmation.
 */

import type {
  LoreAgent,
  LoreAgentInput,
  LoreAgentResult,
  LoreAgentObservation,
  LoreAgentProposedAction,
  LoreAgentEvidence,
  LoreAgentWarning,
} from '../loreAgentTypes';
import type { OntologyActionKind } from '../../meaning/meaningResolutionTypes';

/** Ontology action kinds that are identity-shaped (vs. skill/relationship/etc.). */
const IDENTITY_ACTION_KINDS = new Set<OntologyActionKind>([
  'set_legal_name',
  'distinct_from_self',
  'merge_into_self',
  'resolve_duplicate',
]);

class IdentityAgent implements LoreAgent {
  readonly name = 'IdentityAgent';

  shouldRun(input: Omit<LoreAgentInput, 'tools'>): boolean {
    const meaning = input.pipelineResult.meaning;
    if (!meaning) return false;
    return (
      meaning.identityCollisions.length > 0 ||
      meaning.references.length > 0 ||
      meaning.ontologyActionCandidates.some((c) => IDENTITY_ACTION_KINDS.has(c.kind))
    );
  }

  async run(input: LoreAgentInput): Promise<LoreAgentResult> {
    const startedAt = new Date().toISOString();
    const { meaning } = input.pipelineResult;

    const observations: LoreAgentObservation[] = [];
    const proposedActions: LoreAgentProposedAction[] = [];
    const warnings: LoreAgentWarning[] = [];
    const evidence: LoreAgentEvidence[] = [
      {
        kind: 'pipeline_stage',
        ref: 'identityCollisionService',
        detail: `collisions=${meaning?.identityCollisions.length ?? 0}, references=${meaning?.references.length ?? 0}`,
        sourceFile: 'apps/server/src/services/meaning/identityCollisionService.ts',
      },
    ];

    // ── Pronoun / reference resolution (informational) ──────────────────────────
    for (const ref of meaning?.references ?? []) {
      observations.push({
        kind: 'reference_resolved',
        summary: `Resolved "${ref.reference}" → ${ref.antecedent} (${ref.antecedentKind})`,
        confidence: ref.confidence,
        evidence: [
          { kind: 'message', ref: input.messageId, detail: ref.resolutionReason || 'reference resolution' },
        ],
      });
    }

    // ── Identity collisions — must NOT auto-merge ───────────────────────────────
    for (const collision of meaning?.identityCollisions ?? []) {
      const collisionEvidence: LoreAgentEvidence[] = [
        {
          kind: 'entity',
          ref: collision.characterId ?? collision.name,
          detail: `"${collision.name}" claimed as: ${collision.claims.join(' + ')}`,
        },
      ];

      observations.push({
        kind: 'identity_collision',
        summary: `Identity collision on "${collision.name}" — claimed as both ${collision.claims.join(' and ')}`,
        confidence: collision.confidence,
        evidence: collisionEvidence,
      });

      proposedActions.push({
        type: 'propose_identity_review',
        label: `Clarify who "${collision.name}" is`,
        payload: {
          name: collision.name,
          claims: collision.claims,
          relationshipRole: collision.relationshipRole,
          characterId: collision.characterId,
          mustNotAutoMerge: true,
        },
        confidence: collision.confidence,
        requiresConfirmation: true,
        routeTo: 'entity_authority',
      });

      warnings.push({
        code: 'identity_collision',
        message: `"${collision.name}" must not be auto-merged; user disambiguation required.`,
        severity: 'high',
      });
    }

    // ── Merge / alias suggestions from the ontology layer ───────────────────────
    for (const candidate of meaning?.ontologyActionCandidates ?? []) {
      if (!IDENTITY_ACTION_KINDS.has(candidate.kind)) continue;

      const isAlias = candidate.kind === 'set_legal_name';
      const isMerge = candidate.kind === 'resolve_duplicate';

      proposedActions.push({
        type: isAlias ? 'propose_alias' : isMerge ? 'propose_entity_merge' : 'propose_identity_review',
        label: candidate.label,
        payload: { ontologyKind: candidate.kind, ...candidate.payload },
        confidence: candidate.confidence,
        requiresConfirmation: true,
        routeTo: 'entity_authority',
      });

      observations.push({
        kind: 'identity_suggestion',
        summary: candidate.label,
        confidence: candidate.confidence,
        evidence: [
          { kind: 'pipeline_stage', ref: 'ontologyEnrichmentService', detail: candidate.kind },
        ],
      });
    }

    const confidence =
      proposedActions.length > 0
        ? proposedActions.reduce((sum, a) => sum + a.confidence, 0) / proposedActions.length
        : meaning?.confidence ?? 0;

    return {
      agentName: this.name,
      runId: input.runId,
      observations,
      proposedActions,
      confidence,
      evidence,
      warnings,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }
}

export const identityAgent = new IdentityAgent();
