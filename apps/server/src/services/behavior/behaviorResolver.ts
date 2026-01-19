import { logger } from '../../logger';
import { embeddingService } from '../embeddingService';

import { BehaviorExtractor } from './behaviorExtractor';
import { BehaviorNormalizer } from './behaviorNormalizer';
import { LoopDetector } from './loopDetector';
import { BehaviorPatternStats } from './patternStats';
import { BehaviorStorage } from './storageService';
import type { BehaviorLoop, BehaviorStats, NormalizedBehavior, RawBehaviorSignal } from './types';

/**
 * Main Behavior Resolver Engine
 * Extracts, normalizes, detects loops, and resolves behaviors
 */
export class BehaviorResolver {
  private extractor: BehaviorExtractor;
  private normalizer: BehaviorNormalizer;
  private loopDetector: LoopDetector;
  private stats: BehaviorPatternStats;
  private storage: BehaviorStorage;

  constructor() {
    this.extractor = new BehaviorExtractor();
    this.normalizer = new BehaviorNormalizer();
    this.loopDetector = new LoopDetector();
    this.stats = new BehaviorPatternStats();
    this.storage = new BehaviorStorage();
  }

  /**
   * Process behaviors from context
   */
  async process(ctx: { entries: any[]; user: { id: string } }): Promise<{
    events: any[];
    loops: BehaviorLoop[];
    stats: BehaviorStats;
  }> {
    try {
      logger.debug({ userId: ctx.user.id, entries: ctx.entries.length }, 'Processing behaviors');

      // Step 1: Extract raw behavior signals
      const rawSignals = this.extractor.extract(ctx.entries);

      if (rawSignals.length === 0) {
        logger.debug({ userId: ctx.user.id }, 'No behavior signals found');
        return {
          events: [],
          loops: [],
          stats: {},
        };
      }

      // Step 2: Normalize behaviors
      const normalized: NormalizedBehavior[] = [];

      for (const signal of rawSignals) {
        const info = await this.normalizer.normalize(signal.text, signal.behavior);
        const embedding = await embeddingService.embedText(signal.text);

        normalized.push({
          behavior: info.behavior,
          subtype: info.subtype,
          intensity: 0.5, // V1: default, future: calculate from text
          polarity: info.polarity,
          embedding,
          timestamp: signal.timestamp,
          evidence: signal.text,
          confidence: 0.9,
        });
      }

      // Step 3: Save behaviors
      const savedEvents = await this.storage.saveBehaviors(ctx.user.id, normalized, rawSignals);

      // Step 4: Detect loops
      const loops = this.loopDetector.detect(normalized);

      // Step 5: Save loops
      await this.storage.saveLoops(ctx.user.id, loops);

      // Step 6: Compute stats
      const stats = this.stats.compute(normalized);

      logger.info(
        {
          userId: ctx.user.id,
          events: savedEvents.length,
          loops: loops.length,
        },
        'Processed behaviors'
      );

      return {
        events: savedEvents,
        loops,
        stats,
      };
    } catch (error) {
      logger.error({ error, userId: ctx.user.id }, 'Error processing behaviors');
      throw error;
    }
  }
}

