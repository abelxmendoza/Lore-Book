/**
 * EntityResolver — entity-first planning stage.
 *
 * Resolves detected name mentions to canonical entity IDs BEFORE planning, so
 * the plan (and every executor) anchors on IDs instead of raw text. Wraps the
 * existing foundation entity index (characters + locations + organizations,
 * including aliases) — one batched load, no new query patterns.
 */

import { logger } from '../../logger';
import { loadFoundationEntityIndex } from '../../services/chat/foundationEntityIndex';

import type { ResolvedQueryEntity } from './QueryTypes';

/** Same normalization the index uses for its keys. */
function normalize(name: string): string {
  return name.trim().toLowerCase();
}

export type EntityIndexLoader = (
  userId: string,
) => Promise<Map<string, { id: string; type: string }>>;

export class EntityResolver {
  constructor(private readonly loadIndex: EntityIndexLoader = loadFoundationEntityIndex) {}

  /**
   * Resolve mentions against the canonical index.
   * - exact key hit → confidence 1.0 (covers canonical names AND aliases —
   *   both are indexed under the same keyspace; alias hits report 'alias'
   *   when the key differs from the mention's best exact-name candidates)
   * - partial (mention is a prefix/word of a known name, or vice versa)
   *   → confidence 0.6, with ambiguity candidates when several match
   * - no match → 'unresolved' with confidence 0
   */
  async resolve(userId: string, mentions: string[]): Promise<ResolvedQueryEntity[]> {
    if (mentions.length === 0) return [];

    let index: Map<string, { id: string; type: string }>;
    try {
      index = await this.loadIndex(userId);
    } catch (error) {
      logger.warn({ error, userId }, 'entity resolver: index load failed — mentions stay unresolved');
      return mentions.map((mention) => ({ mention, confidence: 0, method: 'unresolved' as const }));
    }

    return mentions.map((mention) => this.resolveOne(mention, index));
  }

  private resolveOne(
    mention: string,
    index: Map<string, { id: string; type: string }>,
  ): ResolvedQueryEntity {
    const key = normalize(mention);
    if (!key) return { mention, confidence: 0, method: 'unresolved' };

    const exact = index.get(key);
    if (exact) {
      return {
        mention,
        id: exact.id,
        canonicalName: mention,
        type: exact.type,
        confidence: 1,
        method: 'exact',
      };
    }

    // Partial matching: known name contains the mention as a whole word
    // ("Renna" → "Renna Vega"), or the mention contains a known name
    // ("Tío Juan's place" → "Tío Juan"). Word-boundary to avoid substrings.
    const candidates: Array<{ id: string; name: string; type: string; score: number }> = [];
    for (const [name, ref] of index) {
      let score = 0;
      if (containsWord(name, key)) score = key.length / name.length; // mention ⊂ name
      else if (containsWord(key, name)) score = name.length / key.length; // name ⊂ mention
      if (score > 0) {
        candidates.push({ id: ref.id, name, type: ref.type, score });
      }
    }

    if (candidates.length === 0) {
      return { mention, confidence: 0, method: 'unresolved' };
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    // Ambiguity scoring: a clear winner resolves; a near-tie stays ambiguous
    // (confidence discounted, candidates preserved for the caller to decide).
    const runnerUp = candidates[1];
    const ambiguous = runnerUp !== undefined && runnerUp.score >= best.score * 0.9 && runnerUp.id !== best.id;

    return {
      mention,
      id: ambiguous ? undefined : best.id,
      canonicalName: ambiguous ? undefined : best.name,
      type: ambiguous ? undefined : best.type,
      confidence: ambiguous ? 0.4 : Math.min(0.6 + best.score * 0.3, 0.85),
      method: 'partial',
      candidates: candidates.slice(0, 5),
    };
  }
}

function containsWord(haystack: string, needle: string): boolean {
  if (!haystack.includes(needle)) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?:$|[\\s,'’])`, 'i').test(haystack);
}

export const entityResolver = new EntityResolver();
