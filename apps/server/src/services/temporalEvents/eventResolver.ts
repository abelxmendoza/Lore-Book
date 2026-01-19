import { logger } from '../../logger';
import { embeddingService } from '../embeddingService';

import { EventAssembler } from './eventAssembler';
import { EventExtractor } from './eventExtractor';
import { FuzzyEventMatcher } from './fuzzyEventMatcher';
import { EventStorage } from './storageService';
import type { ResolvedEvent, TemporalSignal } from './types';

/**
 * Main Temporal Event Resolver Engine
 * Assembles temporal signals into unified events
 */
export class TemporalEventResolver {
  private extractor: EventExtractor;
  private assembler: EventAssembler;
  private matcher: FuzzyEventMatcher;
  private storage: EventStorage;

  constructor() {
    this.extractor = new EventExtractor();
    this.assembler = new EventAssembler();
    this.matcher = new FuzzyEventMatcher();
    this.storage = new EventStorage();
  }

  /**
   * Process temporal events from context
   */
  async process(ctx: {
    entries: any[];
    user: { id: string };
    entities?: any[];
    locations?: any[];
    activities?: any[];
  }): Promise<ResolvedEvent[]> {
    try {
      logger.debug({ userId: ctx.user.id, entries: ctx.entries.length }, 'Processing temporal events');

      // Step 1: Extract temporal signals
      const signals = await this.extractor.extract(ctx);

      if (signals.length === 0) {
        logger.debug({ userId: ctx.user.id }, 'No temporal signals found');
        return [];
      }

      // Step 2: Group signals into time buckets
      const buckets = this.assembler.group(signals);

      // Step 3: Load existing events
      const existing = await this.storage.loadAll(ctx.user.id);

      // Step 4: Resolve events
      const resolved: ResolvedEvent[] = [];

      for (const bucket of buckets) {
        // Assemble bucket into candidate event
        const assembled = this.assembler.assemble(bucket);

        const summary = assembled.text.slice(0, 400);
        const title = this.deriveTitle(assembled);

        // Get embedding
        let embedding: number[] = [];
        try {
          embedding = await embeddingService.embedText(summary);
        } catch (error) {
          logger.warn({ error }, 'Failed to get embedding for event');
        }

        const candidate: ResolvedEvent = {
          title,
          summary,
          type: this.detectType(assembled),
          startTime: assembled.start,
          endTime: assembled.end,
          confidence: 0.9,
          people: assembled.people,
          locations: assembled.locations,
          activities: assembled.activities,
          embedding: embedding.length > 0 ? embedding : undefined,
          metadata: { raw: assembled },
        };

        // Find matching existing event
        let match: ResolvedEvent | null = null;
        for (const ex of existing) {
          if (this.matcher.isDuplicate(candidate, ex)) {
            match = ex;
            break;
          }
        }

        let finalEvent: ResolvedEvent;

        if (match) {
          // Link to existing event
          finalEvent = await this.storage.linkToExisting(match, bucket, candidate);
        } else {
          // Create new event
          finalEvent = await this.storage.createEvent(ctx.user.id, candidate, bucket);
        }

        resolved.push(finalEvent);
      }

      logger.info(
        {
          userId: ctx.user.id,
          signals: signals.length,
          buckets: buckets.length,
          resolved: resolved.length,
          new: resolved.filter(r => !existing.find(e => e.id === r.id)).length,
        },
        'Processed temporal events'
      );

      return resolved;
    } catch (error) {
      logger.error({ error, userId: ctx.user?.id }, 'Failed to process temporal events');
      return [];
    }
  }

  /**
   * Derive title from assembled event
   */
  private deriveTitle(assembled: { activities: string[]; people: string[]; locations: string[] }): string {
    if (assembled.activities.length > 0) {
      const activity = assembled.activities[0].replace(/_/g, ' ');
      return activity.charAt(0).toUpperCase() + activity.slice(1);
    }

    if (assembled.people.length > 0) {
      return `Hangout with ${assembled.people.length} ${assembled.people.length === 1 ? 'person' : 'people'}`;
    }

    if (assembled.locations.length > 0) {
      const location = assembled.locations[0];
      return `Event at ${location}`;
    }

    return 'Untitled Event';
  }

  /**
   * Detect event type from assembled event
   */
  private detectType(assembled: { activities: string[]; locations: string[] }): string {
    const activitiesLower = assembled.activities.map(a => a.toLowerCase());
    const locationsLower = assembled.locations.map(l => l.toLowerCase());

    if (activitiesLower.some(a => a.includes('bjj') || a.includes('training'))) {
      return 'training_session';
    }

    if (activitiesLower.some(a => a.includes('coding') || a.includes('code'))) {
      return 'coding_session';
    }

    if (locationsLower.some(l => l.includes('club') || l.includes('bar')) ||
        activitiesLower.some(a => a.includes('club') || a.includes('bar'))) {
      return 'nightlife';
    }

    return 'general_event';
  }
}

