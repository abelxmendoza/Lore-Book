/**
 * Decide whether a promoted scene needs omegaMemoryService.ingestText (1–3 LLM calls)
 * or can be assembled from units already extracted on the message path.
 *
 * Fail upward on uncertainty. Does not touch temporal authority.
 */

import { classifyMessageComplexity } from '../ingestion/messageComplexityGate';
import type { ExtractedUnit } from '../../types/conversationCentered';

export type AssemblyLlmDecision = {
  deterministic: boolean;
  reason: string;
  complexityClass: string;
  confidence: number;
};

const SIMPLE_CLASSES = new Set(['SIMPLE_EVENT', 'SIMPLE_FACT', 'ENTITY_MENTION']);

export function shouldAssembleDeterministically(
  sourceText: string,
  unitGroup: Array<Pick<ExtractedUnit, 'entity_ids' | 'temporal_context' | 'content'>>,
): AssemblyLlmDecision {
  const complexity = classifyMessageComplexity(sourceText);
  const groundedActors = unitGroup.some((u) => (u.entity_ids?.length ?? 0) > 0);
  const groundedOccurrence = unitGroup.some((u) => {
    const tc = u.temporal_context as { start_time?: string } | null | undefined;
    return Boolean(tc?.start_time);
  });
  const oneAction = complexity.features.sentenceCount <= 2 && complexity.features.conjunctionCount <= 1;

  if (complexity.failUpward || complexity.class === 'AMBIGUOUS' || complexity.class === 'MULTI_EVENT') {
    return {
      deterministic: false,
      reason: complexity.reasons[0] ?? 'fail_upward',
      complexityClass: complexity.class,
      confidence: complexity.confidence,
    };
  }

  if (complexity.class === 'TEMPORALLY_COMPLEX' || complexity.class === 'RELATIONSHIP_COMPLEX' || complexity.class === 'CORRECTION') {
    return {
      deterministic: false,
      reason: complexity.class.toLowerCase(),
      complexityClass: complexity.class,
      confidence: complexity.confidence,
    };
  }

  if (SIMPLE_CLASSES.has(complexity.class) && (groundedActors || oneAction) && complexity.confidence >= 0.72) {
    return {
      deterministic: true,
      reason: groundedActors ? 'grounded_unit_ir' : 'simple_scene',
      complexityClass: complexity.class,
      confidence: complexity.confidence,
    };
  }

  if (groundedActors && groundedOccurrence && oneAction && complexity.confidence >= 0.7) {
    return {
      deterministic: true,
      reason: 'grounded_actors_occurrence_action',
      complexityClass: complexity.class,
      confidence: complexity.confidence,
    };
  }

  return {
    deterministic: false,
    reason: 'uncertain_scene',
    complexityClass: complexity.class,
    confidence: complexity.confidence,
  };
}
