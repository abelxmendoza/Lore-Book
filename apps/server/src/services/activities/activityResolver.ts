import { logger } from '../../logger';

import { ActivityExtractor } from './activityExtractor';
import { FuzzyActivityMatcher } from './fuzzyActivityMatcher';
import { ActivityStorage } from './storageService';
import type { ResolvedActivity, ExtractedActivity } from './types';

/**
 * Main Activity Resolver Engine
 * Extracts, matches, and resolves activities across journal entries
 */
export class ActivityResolver {
  private extractor: ActivityExtractor;
  private matcher: FuzzyActivityMatcher;
  private storage: ActivityStorage;

  constructor() {
    this.extractor = new ActivityExtractor();
    this.matcher = new FuzzyActivityMatcher();
    this.storage = new ActivityStorage();
  }

  /**
   * Process activities from context
   */
  async process(ctx: { entries: any[]; user: { id: string } }): Promise<ResolvedActivity[]> {
    try {
      logger.debug({ userId: ctx.user.id, entries: ctx.entries.length }, 'Processing activities');

      // Step 1: Extract activities
      const extracted = await this.extractor.extract(ctx.entries);
      extracted.forEach(a => { a.userId = ctx.user.id; });

      // Step 2: Load existing activities
      const existing = await this.storage.loadAll(ctx.user.id);

      // Step 3: Resolve activities
      const resolved: ResolvedActivity[] = [];

      for (const act of extracted) {
        if (!act.extractedName) continue;

        let match: ResolvedActivity | null = null;

        // Find matching existing activity
        for (const ex of existing) {
          if (this.matcher.isDuplicate(act, ex)) {
            match = ex;
            break;
          }
        }

        if (match) {
          // Link to existing activity
          await this.storage.linkActivity(match.id, act);
          resolved.push(match);
        } else {
          // Create new activity
          const created = await this.storage.createActivity(ctx.user.id, {
            name: act.extractedName,
            normalized_name: act.normalizedName || act.extractedName.toLowerCase().replace(/\s+/g, '_'),
            category: act.category || null,
            intensity: act.intensity || null,
            embedding: act.embedding.length > 0 ? act.embedding : undefined,
            metadata: {},
          });

          await this.storage.linkActivity(created.id, act);
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
        'Processed activities'
      );

      return resolved;
    } catch (error) {
      logger.error({ error, userId: ctx.user?.id }, 'Failed to process activities');
      return [];
    }
  }
}

