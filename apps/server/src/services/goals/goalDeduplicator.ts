import { normalizeNameKey } from '../../utils/nameNormalization';
import type { GoalCandidate, GoalMatchResult } from './goalTypes';

function tokens(value: string): Set<string> {
  return new Set(normalizeNameKey(value).split(/\s+/).filter((w) => w.length > 2));
}

export function findGoalMatches(
  candidate: GoalCandidate,
  existing: GoalCandidate[],
): GoalMatchResult[] {
  const incoming = tokens(candidate.canonicalTitle);
  return existing.flatMap((item) => {
    const current = tokens(item.canonicalTitle);
    const overlap = [...incoming].filter((token) => current.has(token)).length;
    const similarity = overlap / Math.max(1, Math.max(incoming.size, current.size));
    if (similarity < 0.5) return [];
    const relationship =
      similarity >= 0.85 ? 'DUPLICATE'
        : candidate.kind === 'TASK' && item.kind !== 'TASK' ? 'CHILD'
          : item.kind === 'TASK' && candidate.kind !== 'TASK' ? 'PARENT'
            : 'RELATED';
    return [{ candidateId: item.id, similarity, relationship }];
  });
}
