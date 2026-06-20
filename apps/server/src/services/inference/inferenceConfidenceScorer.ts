/**
 * Aggregate confidence scoring for inference association results.
 */
import type { InferenceAssociationResult } from './inferenceAssociationTypes';

export function scoreInferenceConfidence(result: Omit<InferenceAssociationResult, 'confidence'>): number {
  const scores: number[] = [];

  for (const p of result.inferredPeople) scores.push(p.confidence);
  for (const g of result.inferredGroups) scores.push(g.confidence);
  for (const c of result.inferredCommunities) scores.push(c.confidence);
  for (const s of result.inferredSkills) scores.push(s.confidence);
  for (const h of result.inferredHobbies) scores.push(h.confidence);
  for (const r of result.inferredRelationships) scores.push(r.confidence);
  for (const e of result.inferredEvents) scores.push(e.confidence);

  if (result.ambiguities.length) {
    scores.push(Math.max(0.3, 1 - result.ambiguities.length * 0.05));
  }

  if (!scores.length) return 0.35;

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.max(0, Math.min(1, Math.round(avg * 1000) / 1000));
}

export function allInferencesRequireReview(
  result: Pick<
    InferenceAssociationResult,
    | 'inferredPeople'
    | 'inferredGroups'
    | 'inferredSkills'
    | 'inferredHobbies'
    | 'inferredRelationships'
    | 'inferredCommunities'
  >
): boolean {
  const items = [
    ...result.inferredPeople,
    ...result.inferredGroups,
    ...result.inferredSkills,
    ...result.inferredHobbies,
    ...result.inferredRelationships,
    ...result.inferredCommunities,
  ];
  return items.every((i) => i.inferredNotConfirmed === true);
}
