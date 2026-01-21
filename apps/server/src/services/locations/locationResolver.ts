import { logger } from '../../logger';

import { FuzzyLocationMatcher } from './fuzzyLocationMatcher';
import { LocationExtractor } from './locationExtractor';
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

        // Find matching existing location (fuzzy match)
        for (const ex of existing) {
          if (this.matcher.isDuplicate(loc, ex)) {
            match = ex;
            break;
          }
        }

        // If no fuzzy match, try context-based matching
        if (!match) {
          match = await this.findContextMatch(ctx.user.id, loc, existing);
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

  /**
   * Find context-based match for a location
   * Checks for same type + proximity target + temporal proximity
   */
  private async findContextMatch(
    userId: string,
    extracted: ExtractedLocation,
    existing: ResolvedLocation[]
  ): Promise<ResolvedLocation | null> {
    try {
      // Extract context from raw text if available
      const rawText = extracted.raw || '';
      
      // Look for proximity indicators and character associations
      const proximityPattern = /\b(by|near|at|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)'s\s+(house|home|place)\b/gi;
      const proximityMatch = rawText.match(proximityPattern);
      
      if (!proximityMatch && !extracted.type) {
        return null; // No context to match on
      }

      // Check existing locations for context matches
      for (const ex of existing) {
        // Same type
        if (extracted.type && ex.type && extracted.type.toLowerCase() === ex.type.toLowerCase()) {
          // Check if proximity targets match (if available)
          if (ex.metadata && typeof ex.metadata === 'object') {
            const exProximityTarget = (ex.metadata as any).proximity_target;
            if (exProximityTarget && proximityMatch) {
              const extractedTarget = proximityMatch[0].replace(/^(by|near|at|in)\s+/i, '').trim();
              if (exProximityTarget.toLowerCase().includes(extractedTarget.toLowerCase()) ||
                  extractedTarget.toLowerCase().includes(exProximityTarget.toLowerCase())) {
                // Temporal proximity check - within 30 days
                const exCreated = ex.created_at ? new Date(ex.created_at) : null;
                if (exCreated) {
                  const daysDiff = Math.abs((Date.now() - exCreated.getTime()) / (1000 * 60 * 60 * 24));
                  if (daysDiff < 30) {
                    return ex; // Context match within temporal window
                  }
                }
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      logger.warn({ error }, 'Context matching failed');
      return null;
    }
  }
}

