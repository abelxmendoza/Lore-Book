/**
 * Relationship salience — which bonds carry the most current weight, from
 * the combination of interest, attachment, and attention. Competing
 * relationships are expected: several can be salient at once, and the
 * ranking never forces a single romantic target.
 */
import type { RelationshipSnapshot } from './relationshipCognitionTypes';

export type SalientRelationship = {
  snapshot: RelationshipSnapshot;
  salience: number;
  why: string;
};

function describe(snapshot: RelationshipSnapshot): string {
  const parts: string[] = [];
  if (snapshot.interest.score >= 40) parts.push('active interest');
  if (snapshot.emotionalAttachment.score >= 0.5) parts.push('strong attachment');
  if (snapshot.attention.thinkingScore >= 0.4) parts.push('often on your mind');
  if (snapshot.trajectory.direction === 'growing') parts.push('growing');
  if (snapshot.trajectory.direction === 'rekindling') parts.push('rekindling');
  if (snapshot.romanticStage.stage === 'moving_on') parts.push('being processed');
  return parts.join(', ') || 'part of your story';
}

export function rankRelationshipSalience(
  snapshots: RelationshipSnapshot[],
  opts: { max?: number; minSalience?: number } = {},
): SalientRelationship[] {
  const max = opts.max ?? 5;
  const minSalience = opts.minSalience ?? 0.15;

  return snapshots
    .map((snapshot) => {
      const salience =
        (snapshot.interest.score / 100) * 0.4 +
        snapshot.emotionalAttachment.score * 0.35 +
        snapshot.attention.thinkingScore * 0.25;
      return {
        snapshot,
        salience: Math.round(salience * 100) / 100,
        why: describe(snapshot),
      };
    })
    .filter((item) => item.salience >= minSalience)
    .sort((a, b) => b.salience - a.salience)
    .slice(0, max);
}
