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
import { queryBookEntities } from '../../services/entities/bookEntityQueryService';
import {
  resolveMention,
  type ResolutionCandidate,
} from '../../services/entities/entityResolutionCore';

import type { ResolvedQueryEntity } from './QueryTypes';

export type EntityIndexLoader = (
  userId: string,
) => Promise<Map<string, { id: string; type: string }>>;

async function loadBookEntityIndex(userId: string): Promise<Map<string, { id: string; type: string }>> {
  const response = await queryBookEntities(userId, { limit: 100 });
  const index = new Map<string, { id: string; type: string }>();
  for (const entity of response.entities) {
    index.set(entity.name.trim().toLowerCase(), { id: entity.id, type: entity.type });
    for (const alias of entity.aliases) {
      index.set(alias.trim().toLowerCase(), { id: entity.id, type: entity.type });
    }
  }
  return index;
}

function normalizeForScan(value: string): string {
  return value.toLocaleLowerCase().normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export class EntityResolver {
  constructor(
    private readonly loadIndex: EntityIndexLoader = loadFoundationEntityIndex,
    private readonly loadBookIndex: EntityIndexLoader = loadBookEntityIndex,
  ) {}

  /**
   * Resolve mentions through the shared EntityResolutionCore. The foundation
   * index remains only a candidate source; this adapter no longer owns an
   * independent exact/partial/ambiguity scoring algorithm.
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

    const candidates = this.toCandidates(index);
    return mentions.map((mention) => this.resolveOne(mention, candidates));
  }

  /**
   * Resolve classifier mentions plus canonical names and aliases that actually
   * occur in the full query. This catches graph wording such as
   * "Who introduced me to Marcus?" where the legacy prefix extractor does not
   * identify the trailing name.
   */
  async resolveMessage(
    userId: string,
    message: string,
    mentions: string[] = [],
  ): Promise<ResolvedQueryEntity[]> {
    let foundation = new Map<string, { id: string; type: string }>();
    let books = new Map<string, { id: string; type: string }>();
    const [foundationResult, booksResult] = await Promise.allSettled([
      this.loadIndex(userId),
      this.loadBookIndex(userId),
    ]);
    if (foundationResult.status === 'fulfilled') foundation = foundationResult.value;
    else logger.warn({ error: foundationResult.reason, userId }, 'query entity resolver: foundation index degraded');
    if (booksResult.status === 'fulfilled') books = booksResult.value;
    else logger.warn({ error: booksResult.reason, userId }, 'query entity resolver: Book index degraded');

    const index = new Map([...books, ...foundation]);
    if (index.size === 0) {
      return mentions.map((mention) => ({ mention, confidence: 0, method: 'unresolved' as const }));
    }
    const normalizedMessage = ` ${normalizeForScan(message)} `;
    const discovered: string[] = [];
    const seenIds = new Set<string>();
    const labels = [...index.entries()]
      .filter(([label]) => normalizeForScan(label).length >= 2)
      .sort(([left], [right]) => right.length - left.length);
    for (const [label, ref] of labels) {
      const normalizedLabel = normalizeForScan(label);
      if (!normalizedMessage.includes(` ${normalizedLabel} `) || seenIds.has(ref.id)) continue;
      discovered.push(label);
      seenIds.add(ref.id);
      if (discovered.length >= 12) break;
    }
    const allMentions = [...new Set([...mentions, ...discovered])];
    const candidates = this.toCandidates(index);
    return allMentions.map((mention) => this.resolveOne(mention, candidates));
  }

  private toCandidates(
    index: Map<string, { id: string; type: string }>,
  ): ResolutionCandidate[] {
    const byId = new Map<string, ResolutionCandidate>();
    for (const [label, ref] of index) {
      const existing = byId.get(ref.id);
      if (existing) {
        if (label !== existing.name && !existing.aliases?.includes(label)) {
          existing.aliases = [...(existing.aliases ?? []), label];
        }
      } else {
        byId.set(ref.id, {
          id: ref.id,
          name: label,
          aliases: [],
          type: ref.type,
        });
      }
    }
    return [...byId.values()];
  }

  private resolveOne(
    mention: string,
    candidates: ResolutionCandidate[],
  ): ResolvedQueryEntity {
    if (!mention.trim()) return { mention, confidence: 0, method: 'unresolved' };
    const result = resolveMention(mention, candidates);
    if (!result.resolvedId) {
      const ranked = result.ranked.slice(0, 5).map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        type: candidates.find((entry) => entry.id === candidate.id)?.type ?? 'unknown',
        score: candidate.score,
      }));
      return {
        mention,
        confidence: result.confidence,
        method: 'unresolved',
        ...(ranked.length ? { candidates: ranked } : {}),
      };
    }

    const resolved = candidates.find((candidate) => candidate.id === result.resolvedId);
    const selectedMethod = result.trace.selectedMethod;
    return {
      mention,
      id: result.resolvedId,
      canonicalName: resolved?.name ?? mention,
      type: resolved?.type,
      confidence: result.confidence,
      method: selectedMethod === 'alias' ? 'alias' : 'exact',
      candidates: result.ranked.slice(0, 5).map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        type: candidates.find((entry) => entry.id === candidate.id)?.type ?? 'unknown',
        score: candidate.score,
      })),
    };
  }
}

export const entityResolver = new EntityResolver();
