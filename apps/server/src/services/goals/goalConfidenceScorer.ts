import type { GoalDurability, GoalKind } from './goalTypes';
import type { GoalModality } from './goalModalityResolver';

export function scoreGoalConfidence(input: {
  kind: GoalKind;
  modality: GoalModality;
  explicitIntent: boolean;
  durability: GoalDurability;
  semanticComplete: boolean;
  hardBlocked: boolean;
}): number {
  if (input.hardBlocked) return Math.min(0.49, input.modality.weight);
  let score = 0.36 + input.modality.weight * 0.34;
  if (input.explicitIntent) score += 0.18;
  if (input.durability === 'DURABLE') score += 0.08;
  if (input.semanticComplete) score += 0.06;
  if (input.kind === 'TASK') score -= 0.04;
  return Math.max(0, Math.min(0.98, score));
}
