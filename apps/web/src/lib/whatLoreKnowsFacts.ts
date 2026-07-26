/**
 * Client-side Current vs History + confirmation display helpers for What Lore Knows.
 * Mirrors server entityFactDedup heuristics (no shared package).
 */

const PAST_MARKERS =
  /\b(used to|in the past|formerly|previously|no longer|anymore|once|back then|years? ago|had been)\b/i;
const PRESENT_MARKERS =
  /\b(currently|now|these days|still|today|presently|right now)\b/i;

export function factTemporalPolarity(raw: string): 'past' | 'present' | 'neutral' {
  const text = raw.toLowerCase();
  const past =
    PAST_MARKERS.test(text) ||
    /\b(had|was|were|used to|worked|lived|dated|dyed|played|studied|moved|owned)\b/.test(text);
  const present =
    PRESENT_MARKERS.test(text) ||
    /\b(has|is|are|works|lives|dates|dyes|plays|studies|moves|owns)\b/.test(text);
  if (past && !present) return 'past';
  if (present && !past) return 'present';
  if (past && present) {
    if (PAST_MARKERS.test(text) && !PRESENT_MARKERS.test(text)) return 'past';
    if (PRESENT_MARKERS.test(text) && !PAST_MARKERS.test(text)) return 'present';
  }
  return 'neutral';
}

export type LoreFactLike = {
  fact: string;
  status?: string;
  previous_value?: string | null;
  mention_count?: number;
  metadata?: Record<string, unknown> | null;
};

export function isHistoryFact(fact: LoreFactLike): boolean {
  if (fact.status === 'contradicted') return true;
  return factTemporalPolarity(fact.fact) === 'past';
}

export function confirmationDisplayCount(fact: LoreFactLike): number {
  const ids =
    fact.metadata && Array.isArray(fact.metadata.evidence_ids)
      ? fact.metadata.evidence_ids
      : null;
  if (ids && ids.length > 0) return ids.length;
  const metaCount = fact.metadata?.confirmation_count;
  if (typeof metaCount === 'number' && metaCount > 0) return metaCount;
  return fact.mention_count ?? 0;
}

export function partitionCurrentHistoryFacts<T extends LoreFactLike>(facts: T[]): {
  current: T[];
  history: T[];
} {
  const current: T[] = [];
  const history: T[] = [];
  for (const f of facts) {
    if (isHistoryFact(f)) history.push(f);
    else current.push(f);
  }
  return { current, history };
}
