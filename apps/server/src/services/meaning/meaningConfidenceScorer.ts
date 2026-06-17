/**
 * Meaning confidence scoring and per-object confirmation rules.
 */
import type {
  Factuality,
  IdentityCollision,
  MeaningAmbiguity,
  MeaningResolutionResult,
  ResolvedEntity,
  ResolvedRelationship,
} from './meaningResolutionTypes';
import { isFamilyOrRomantic } from './relationshipResolutionService';

export function scoreMeaningConfidence(input: {
  entities: ResolvedEntity[];
  relationships: ResolvedRelationship[];
  certaintyLevel: number;
  identityCollisions: IdentityCollision[];
  ambiguities: MeaningAmbiguity[];
  contradictions: MeaningResolutionResult['contradictions'];
}): number {
  const scores: number[] = [input.certaintyLevel];

  if (input.entities.length) {
    scores.push(avg(input.entities.map((e) => e.confidence)));
  }
  if (input.relationships.length) {
    scores.push(avg(input.relationships.map((r) => r.confidence)));
  }

  let score = avg(scores);
  score -= input.identityCollisions.length * 0.15;
  score -= input.ambiguities.length * 0.04;
  score -= input.contradictions.length * 0.1;

  return clamp(score);
}

export function applyConfirmationRules(
  entities: ResolvedEntity[],
  relationships: ResolvedRelationship[],
  factuality: Factuality
): void {
  for (const e of entities) {
    if (e.isSelf || e.kind === 'ORGANIZATION') {
      e.requiresConfirmation = true;
    }
    if (factuality !== 'fact') {
      e.requiresConfirmation = true;
    }
  }

  for (const r of relationships) {
    if (isFamilyOrRomantic(r.role)) {
      r.requiresConfirmation = true;
    }
    if (factuality !== 'fact') {
      r.requiresConfirmation = true;
    }
  }
}

export function allowsMemoryWrite(result: MeaningResolutionResult): boolean {
  if (result.factuality === 'hypothetical' || result.factuality === 'desire' || result.factuality === 'question') {
    return false;
  }
  if (result.identityCollisions.length > 0) return false;
  if (result.contradictions.length > 0) return false;
  return result.factuality === 'fact' || result.factuality === 'opinion' || result.factuality === 'uncertain';
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, Math.round(n * 1000) / 1000));
}
