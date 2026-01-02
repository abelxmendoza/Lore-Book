import { logger } from '../../logger';
import { LocationExtractor } from './locationExtractor';
import { FuzzyLocationMatcher } from './fuzzyLocationMatcher';
import { LocationStorage } from './storageService';
import type { ResolvedLocation, ExtractedLocation } from './types';

/**
 * Main Location Resolver Engine
 * Extracts, matches, and resolves locations across journal entries
 */
export class LocationResolver {
  private extractor: LocationExtractor;
  private matcher: FuzzyLocationMatcher;
  private storage: LocationStorage;

  constructor() {
    this.extractor = new LocationExtractor();
    this.matcher = new FuzzyLocationMatcher();
    this.storage = new LocationStorage();
  }

  /**
   * Process locations from context
   */
  async process(ctx: { entries: any[]; user: { id: string } }): Promise<ResolvedLocation[]> {
    try {
      logger.debug({ userId: ctx.user.id, entries: ctx.entries.length }, 'Processing locations');

      // Step 1: Extract locations
      const extracted = await this.extractor.extract(ctx.entries);
      extracted.forEach(l => { l.userId = ctx.user.id; });

      // Step 2: Load existing locations
      const existing = await this.storage.loadAll(ctx.user.id);

      // Step 3: Resolve locations
      const resolved: ResolvedLocation[] = [];

      for (const loc of extracted) {
        if (!loc.extractedName) continue;

        let match: ResolvedLocation | null = null;

        // Find matching existing location
        for (const ex of existing) {
          if (this.matcher.isDuplicate(loc, ex)) {
            match = ex;
            break;
          }
        }

        if (match) {
          // Link to existing location
          await this.storage.linkLocation(match.id, loc);
          resolved.push(match);
        } else {
          // Create new location
          const created = await this.storage.createLocation(ctx.user.id, {
            name: loc.extractedName,
            normalized_name: loc.normalizedName || loc.extractedName.toLowerCase(),
            type: loc.type || null,
            embedding: loc.embedding.length > 0 ? loc.embedding : undefined,
            confidence: 1.0,
          });

          await this.storage.linkLocation(created.id, loc);
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
        'Processed locations'
      );

      return resolved;
    } catch (error) {
      logger.error({ error, userId: ctx.user?.id }, 'Failed to process locations');
      return [];
    }
  }
}

