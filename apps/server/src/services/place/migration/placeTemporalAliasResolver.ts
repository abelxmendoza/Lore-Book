/**
 * Resolve time-dependent aliases like "my home" / "home" without creating permanent Places.
 */

import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { TemporalPlaceAlias } from './placeMigrationTypes';

export type ResidenceCandidate = {
  id: string;
  name: string;
  type?: string | null;
  aliases?: string[] | null;
};

/**
 * Attempt to resolve a temporal home alias against known residences.
 * Returns unresolved alias when evidence is insufficient — never invents certainty.
 */
export function resolveTemporalPlaceAlias(
  alias: string,
  residences: ResidenceCandidate[],
  evidenceText = '',
): TemporalPlaceAlias {
  const key = normalizeNameKey(alias);
  const base: TemporalPlaceAlias = {
    alias: alias.trim() || 'my home',
    confidence: 0.3,
    evidenceIds: [],
  };

  if (!['my home', 'home', 'at home', 'the house'].includes(key)) {
    return { ...base, confidence: 0.2 };
  }

  const text = evidenceText.toLowerCase();
  const scored = residences
    .filter((r) => /home|house|residence|apartment/i.test(`${r.name} ${r.type ?? ''}`))
    .map((r) => {
      let score = 0.35;
      const nameKey = normalizeNameKey(r.name);
      if (text.includes(nameKey) || (r.aliases ?? []).some((a) => text.includes(normalizeNameKey(a)))) {
        score += 0.35;
      }
      if (/\b(?:abuela|grandma|mom|mother)\b/i.test(r.name) && new RegExp(r.name.split(/\s+/)[0] ?? '', 'i').test(evidenceText)) {
        score += 0.15;
      }
      return { r, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 0.6) {
    return {
      ...base,
      confidence: 0.35,
    };
  }

  return {
    alias: base.alias,
    resolvedPlaceId: best.r.id,
    resolvedPlaceName: best.r.name,
    confidence: Math.min(0.85, best.score),
    evidenceIds: [],
  };
}
