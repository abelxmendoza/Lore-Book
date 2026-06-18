/**
 * MEMORY AGENT (v1 — deterministic)
 *
 * Decides what from a message is worth remembering by reading the meaning
 * resolution output the pipeline already produced. No LLM calls.
 *
 *   durable   → high-confidence memory review candidates → proposed mutation
 *   context   → lower-confidence candidates → observation only
 *   noise     → nothing worth proposing
 *
 * The agent is PURE: it reads the pipeline result and returns a result. It does
 * not write anything — the orchestrator persists proposed actions (and the
 * Memory Review Queue performs the eventual confirmed write).
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
import { MEANING_HARD_FACT_CONFIDENCE } from '../../meaning/meaningResolutionTypes';

/** Below this, a candidate is treated as transient context, not durable memory. */
const DURABLE_CONFIDENCE_FLOOR = 0.6;

class MemoryAgent implements LoreAgent {
  readonly name = 'MemoryAgent';

  shouldRun(input: Omit<LoreAgentInput, 'tools'>): boolean {
    const meaning = input.pipelineResult.meaning;
    if (!meaning) return false;
    // Questions rarely carry durable facts; skip unless candidates exist anyway.
    if (meaning.factuality === 'question' && meaning.memoryReviewCandidates.length === 0) {
      return false;
    }
    return meaning.memoryReviewCandidates.length > 0;
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
        detail: `factuality=${meaning?.factuality ?? 'unknown'}, candidates=${meaning?.memoryReviewCandidates.length ?? 0}`,
        sourceFile: 'apps/server/src/services/meaning/meaningResolutionService.ts',
      },
    ];

    const candidates = meaning?.memoryReviewCandidates ?? [];

    for (const candidate of candidates) {
      const candidateEvidence: LoreAgentEvidence[] = [
        {
          kind: 'message',
          ref: input.messageId,
          detail: candidate.source || 'meaning resolution candidate',
        },
      ];

      const durable =
        candidate.confidence >= DURABLE_CONFIDENCE_FLOOR && meaning?.factuality !== 'hypothetical';

      observations.push({
        kind: durable ? 'durable_memory_candidate' : 'context_memory_candidate',
        summary: durable
          ? `Worth remembering: "${candidate.claim}" (${candidate.category})`
          : `Transient context, not proposing: "${candidate.claim}" (${candidate.category})`,
        confidence: candidate.confidence,
        evidence: candidateEvidence,
      });

      if (!durable) continue;

      const action: LoreAgentProposedAction = {
        type: 'propose_memory_mutation',
        label: `Remember: ${candidate.claim}`,
        payload: {
          claim: candidate.claim,
          category: candidate.category,
          source: candidate.source,
          messageId: input.messageId,
          isHardFact: candidate.confidence >= MEANING_HARD_FACT_CONFIDENCE,
        },
        confidence: candidate.confidence,
        requiresConfirmation: true,
        routeTo: 'memory_review_queue',
      };
      proposedActions.push(action);
    }

    if (candidates.length > 0 && proposedActions.length === 0) {
      warnings.push({
        code: 'no_durable_candidates',
        message: 'Memory candidates existed but none crossed the durable-confidence floor.',
        severity: 'low',
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

export const memoryAgent = new MemoryAgent();
