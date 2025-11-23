import { logger } from '../../logger';
import { EntityExtractor } from './entityExtractor';
import { EntityNormalizer } from './entityNormalizer';
import { DuplicateDetector } from './duplicateDetector';
import { EntityStorage } from './storageService';
import type { ResolvedEntity, ExtractedEntity } from './types';

/**
 * Main Entity Resolver Engine
 * Extracts, normalizes, and resolves entities across journal entries
 */
export class EntityResolver {
  private extractor: EntityExtractor;
  private normalizer: EntityNormalizer;
  private detector: DuplicateDetector;
  private storage: EntityStorage;

  constructor() {
    this.extractor = new EntityExtractor();
    this.normalizer = new EntityNormalizer();
    this.detector = new DuplicateDetector();
    this.storage = new EntityStorage();
  }

  /**
   * Process entities from context
   */
  async process(ctx: { entries: any[]; user: { id: string } }): Promise<ResolvedEntity[]> {
    try {
      logger.debug({ userId: ctx.user.id, entries: ctx.entries.length }, 'Processing entities');

      // Step 1: Extract entities
      const extracted = this.extractor.extract(ctx.entries);
      extracted.forEach(e => { e.userId = ctx.user.id; });

      // Step 2: Load existing entities
      const existing = await this.storage.loadAll(ctx.user.id);

      // Step 3: Find duplicates
      const matches = await this.detector.findDuplicates(extracted, existing);

      // Step 4: Resolve entities
      const resolved: ResolvedEntity[] = [];

      for (const m of matches) {
        if (m.match) {
          // Entity already exists - link it
          await this.storage.linkEntity(m.match.id, m.extracted);

          // Check if we should add as alias
          const normalized = this.normalizer.normalize(m.extracted.raw);
          const canonicalNormalized = this.normalizer.normalize(m.match.canonical);
          
          if (normalized !== canonicalNormalized && !m.match.aliases.includes(m.extracted.raw)) {
            const newAliases = [...m.match.aliases, m.extracted.raw];
            await this.storage.updateAliases(m.match.id, newAliases);
            m.match.aliases = newAliases;
          }

          resolved.push(m.match);
        } else {
          // New entity - create it
          const normalized = this.normalizer.normalize(m.extracted.raw);
          const created = await this.storage.createEntity(ctx.user.id, {
            canonical_name: m.extracted.raw,
            aliases: [],
            type: m.extracted.type,
            confidence: 1.0,
          });

          await this.storage.linkEntity(created.id, m.extracted);
          resolved.push(created);
        }
      }

      logger.info(
        {
          userId: ctx.user.id,
          extracted: extracted.length,
          resolved: resolved.length,
          new: resolved.filter(r => !existing.find(e => e.id === r.id)).length,
        },
        'Processed entities'
      );

      return resolved;
    } catch (error) {
      logger.error({ error, userId: ctx.user?.id }, 'Failed to process entities');
      return [];
    }
  }
}

