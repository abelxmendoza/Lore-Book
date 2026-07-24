/**
 * Match a candidate against the existing Skills Book registry.
 */

import { normalizeSkillKey } from './skillIdentity';
import type { KnownSkillRecord } from './skillCognitionTypes';
import { resolveSkillCanonical } from './skillCanonicalResolver';

export type SkillSimilarityMatch = {
  match?: KnownSkillRecord;
  score: number;
  method: 'exact' | 'alias' | 'canonical' | 'fuzzy' | 'none';
  reasons: string[];
};

function tokenSet(s: string): Set<string> {
  return new Set(
    normalizeSkillKey(s)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function findSimilarExistingSkill(
  span: string,
  knownSkills: KnownSkillRecord[] = [],
): SkillSimilarityMatch {
  const reasons: string[] = [];
  if (!knownSkills.length) {
    return { score: 0, method: 'none', reasons: ['no_registry'] };
  }

  const canonical = resolveSkillCanonical(span);
  const spanKey = normalizeSkillKey(span);
  const canonKey = normalizeSkillKey(canonical.canonicalTitle);
  const aliasKeys = new Set([
    spanKey,
    canonKey,
    ...canonical.aliases.map(normalizeSkillKey),
  ]);

  for (const rec of knownSkills) {
    const nameKey = normalizeSkillKey(rec.name);
    if (nameKey === spanKey || nameKey === canonKey) {
      reasons.push(`exact:${rec.name}`);
      return { match: rec, score: 1, method: 'exact', reasons };
    }
    for (const al of rec.aliases ?? []) {
      if (aliasKeys.has(normalizeSkillKey(al)) || normalizeSkillKey(al) === spanKey) {
        reasons.push(`alias:${rec.name}`);
        return { match: rec, score: 0.95, method: 'alias', reasons };
      }
    }
    // Existing name matches our canonical group
    if (aliasKeys.has(nameKey)) {
      reasons.push(`canonical_match:${rec.name}`);
      return { match: rec, score: 0.92, method: 'canonical', reasons };
    }
  }

  // Fuzzy token overlap
  let best: SkillSimilarityMatch = { score: 0, method: 'none', reasons: ['no_match'] };
  const spanTokens = tokenSet(canonical.canonicalTitle);
  for (const rec of knownSkills) {
    const score = jaccard(spanTokens, tokenSet(rec.name));
    if (score > best.score) {
      best = {
        match: rec,
        score,
        method: 'fuzzy',
        reasons: [`fuzzy:${rec.name}:${score.toFixed(2)}`],
      };
    }
  }

  if (best.score >= 0.72) return best;
  return { score: 0, method: 'none', reasons: ['below_threshold'] };
}
