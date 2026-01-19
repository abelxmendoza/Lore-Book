import { logger } from '../../logger';

import { EventExtractor } from './eventExtractor';
import { FuzzyEventMatcher } from './fuzzyEventMatcher';
import { EventStorage } from './storageService';
import type { ResolvedEvent, ExtractedEvent } from './types';

/**
 * Main Event Resolver Engine
 * Extracts, matches, and resolves events across journal entries
 */
export class EventResolver {
  private extractor: EventExtractor;
  private matcher: FuzzyEventMatcher;
  private storage: EventStorage;

  constructor() {
    this.extractor = new EventExtractor();
    this.matcher = new FuzzyEventMatcher();
    this.storage = new EventStorage();
  }

  /**
   * Process events from context
   */
  async process(ctx: { entries: any[]; user: { id: string } }): Promise<ResolvedEvent[]> {
    try {
      logger.debug({ userId: ctx.user.id, entries: ctx.entries.length }, 'Processing events');

      // Step 1: Extract events
      const extracted = await this.extractor.extract(ctx.entries);
      extracted.forEach(e => { e.userId = ctx.user.id; });

      // Step 2: Load existing events
      const existing = await this.storage.loadAll(ctx.user.id);

      // Step 3: Resolve events
      const resolved: ResolvedEvent[] = [];

      for (const ev of extracted) {
        let match: ResolvedEvent | null = null;

        // Find matching existing event
        for (const ex of existing) {
          if (this.matcher.isDuplicate(ev, ex)) {
            match = ex;
            break;
          }
        }

        if (match) {
          // Link to existing event
          await this.storage.linkEvent(match.id, ev);
          resolved.push(match);
        } else {
          // Create new event
          const created = await this.storage.createEvent(ctx.user.id, {
            canonical_title: this.buildTitle(ev),
            summary: ev.raw.slice(0, 400),
            start_time: ev.timestamp || undefined,
            embedding: ev.embedding.length > 0 ? ev.embedding : undefined,
            confidence: 1.0,
          });

          await this.storage.linkEvent(created.id, ev);
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
        'Processed events'
      );

      return resolved;
    } catch (error) {
      logger.error({ error, userId: ctx.user?.id }, 'Failed to process events');
      return [];
    }
  }

  /**
   * Build canonical title for event
   */
  private buildTitle(ev: ExtractedEvent): string {
    if (ev.location) {
      return `Event at ${ev.location}`;
    }

    if (ev.timestamp) {
      const date = new Date(ev.timestamp);
      return `Event on ${date.toLocaleDateString()}`;
    }

    if (ev.keywords.length > 0) {
      return ev.keywords.slice(0, 3).join(', ');
    }

    return 'Event';
  }
}

