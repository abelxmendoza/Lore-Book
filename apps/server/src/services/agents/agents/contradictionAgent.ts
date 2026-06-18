/**
 * CONTRADICTION AGENT (v1 — deterministic)
 *
 * Compares new claims against what LoreBook already believes by reading the
 * contradictions the meaning layer surfaced. For each conflict it proposes a
 * correction workflow routed to Correction Authority.
 *
 * It NEVER overwrites truth. Truth-state transitions are owned by
 * CorrectionAuthority and require explicit user confirmation + rationale; this
 * agent only opens the proposal.
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
import type { PotentialContradiction } from '../../meaning/meaningResolutionTypes';

/** Map contradiction severity to a confidence the proposal carries. */
const SEVERITY_CONFIDENCE: Record<PotentialContradiction['severity'], number> = {
  high: 0.9,
  medium: 0.7,
  low: 0.5,
};

class ContradictionAgent implements LoreAgent {
  readonly name = 'ContradictionAgent';

  shouldRun(input: Omit<LoreAgentInput, 'tools'>): boolean {
    const meaning = input.pipelineResult.meaning;
    return Boolean(meaning && meaning.contradictions.length > 0);
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
        ref: 'meaningResolutionService',
        detail: `contradictions=${meaning?.contradictions.length ?? 0}`,
        sourceFile: 'apps/server/src/services/meaning/meaningResolutionService.ts',
      },
    ];

    for (const contradiction of meaning?.contradictions ?? []) {
      const confidence = SEVERITY_CONFIDENCE[contradiction.severity];

      const contradictionEvidence: LoreAgentEvidence[] = [
        {
          kind: 'memory',
          ref: contradiction.field,
          detail: `existing: "${contradiction.existingFact}"`,
        },
        {
          kind: 'message',
          ref: input.messageId,
          detail: `new claim: "${contradiction.newClaim}"`,
        },
      ];

      observations.push({
        kind: 'contradiction',
        summary: `Conflict on "${contradiction.field}": existing "${contradiction.existingFact}" vs new "${contradiction.newClaim}" (${contradiction.severity})`,
        confidence,
        evidence: contradictionEvidence,
      });

      proposedActions.push({
        type: 'propose_correction',
        label: `Reconcile "${contradiction.field}"`,
        payload: {
          field: contradiction.field,
          existingFact: contradiction.existingFact,
          newClaim: contradiction.newClaim,
          severity: contradiction.severity,
        },
        confidence,
        requiresConfirmation: true,
        routeTo: 'correction_authority',
      });

      if (contradiction.severity === 'high') {
        warnings.push({
          code: 'high_severity_contradiction',
          message: `High-severity conflict on "${contradiction.field}" — needs review before either claim is trusted.`,
          severity: 'high',
        });
      }
    }

    const confidence =
      proposedActions.length > 0
        ? proposedActions.reduce((sum, a) => sum + a.confidence, 0) / proposedActions.length
        : 0;

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

export const contradictionAgent = new ContradictionAgent();
