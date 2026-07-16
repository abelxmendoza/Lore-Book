/**
 * Entity Gravity — measures narrative importance, not truth.
 */
import type { EntityGravityInput, EntityGravityScore } from './narrativeAnchorTypes';

const WEIGHTS = {
  mentionCount: 0.22,
  threadCount: 0.14,
  daysMentioned: 0.10,
  emotionalWeight: 0.12,
  eventParticipation: 0.10,
  relationshipStrength: 0.12,
  communityMembership: 0.10,
  narrativeImportance: 0.10,
} as const;

function normMention(count: number): number {
  if (!Number.isFinite(count)) return 0;
  if (count <= 0) return 0;
  if (count >= 20) return 1;
  return Math.min(1, count / 20);
}

function normThread(count: number): number {
  if (!Number.isFinite(count)) return 0;
  if (count <= 0) return 0;
  if (count >= 8) return 1;
  return Math.min(1, count / 8);
}

function normDays(days: number): number {
  if (!Number.isFinite(days)) return 0;
  if (days <= 0) return 0;
  if (days >= 30) return 1;
  return Math.min(1, days / 30);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function computeEntityGravity(input: EntityGravityInput): EntityGravityScore {
  const components = {
    mentionCount: normMention(input.mentionCount),
    threadCount: normThread(input.threadCount),
    daysMentioned: normDays(input.daysMentioned),
    emotionalWeight: clamp01(input.emotionalWeight),
    eventParticipation: clamp01(input.eventParticipation),
    relationshipStrength: clamp01(input.relationshipStrength),
    communityMembership: clamp01(input.communityMembership),
    narrativeImportance: clamp01(input.narrativeImportance),
  };

  let gravityScore = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    gravityScore += weight * components[key as keyof typeof components];
  }

  // Role boost: best_friend, bandmate, etc. increase narrative pull
  const roles = input.roles ?? [];
  const roleBoost = roles.some((r) => /best.?friend|partner|spouse|founder|lead/i.test(r)) ? 0.08 : 0;
  gravityScore = clamp01(gravityScore + roleBoost);

  return {
    entityId: input.entityId,
    entityType: input.entityType,
    name: input.name,
    gravityScore: Math.round(gravityScore * 100) / 100,
    components,
    roles,
  };
}

export function computeGravityBatch(inputs: EntityGravityInput[]): EntityGravityScore[] {
  return inputs.map(computeEntityGravity).sort((a, b) => b.gravityScore - a.gravityScore);
}

export function gravityByEntityId(scores: EntityGravityScore[]): Map<string, EntityGravityScore> {
  return new Map(scores.map((s) => [s.entityId, s]));
}
