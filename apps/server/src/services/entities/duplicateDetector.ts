import { logger } from '../../logger';
import { EntityNormalizer } from './entityNormalizer';
import { FuzzyMatcher } from './fuzzyMatcher';
import type { ExtractedEntity, ResolvedEntity } from './types';

/**
 * Detects duplicate entities using fuzzy matching
 */
export class DuplicateDetector {
  private normalizer: EntityNormalizer;
  private matcher: FuzzyMatcher;

  constructor() {
    this.normalizer = new EntityNormalizer();
    this.matcher = new FuzzyMatcher();
  }

  /**
   * Find duplicates among extracted entities
   */
  async findDuplicates(
    extracted: ExtractedEntity[],
    existing: ResolvedEntity[]
  ): Promise<Array<{ extracted: ExtractedEntity; match?: ResolvedEntity }>> {
    const results: Array<{ extracted: ExtractedEntity; match?: ResolvedEntity }> = [];

    try {
      for (const ent of extracted) {
        const normalized = this.normalizer.normalize(ent.raw);
        let match: ResolvedEntity | undefined;

        // Check against existing entities
        for (const ex of existing) {
          // Check canonical name
          const exNormalized = this.normalizer.normalize(ex.canonical);
          if (this.matcher.isDuplicate(normalized, exNormalized)) {
            match = ex;
            break;
          }

          // Check aliases
          for (const alias of ex.aliases) {
            const aliasNormalized = this.normalizer.normalize(alias);
            if (this.matcher.isDuplicate(normalized, aliasNormalized)) {
              match = ex;
              break;
            }
          }

          if (match) break;
        }

        results.push({ extracted: ent, match });
      }

      logger.debug({ extracted: extracted.length, matches: results.filter(r => r.match).length }, 'Found duplicates');

      return results;
    } catch (error) {
      logger.error({ error }, 'Failed to find duplicates');
      return extracted.map(e => ({ extracted: e }));
    }
  }
}

