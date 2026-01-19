import { logger } from '../../logger';

import { ConflictClassifier } from './conflictClassifier';
import { ConflictEmbedding } from './conflictEmbedding';
import { ConflictExtractor } from './conflictExtractor';
import { ConflictParser } from './conflictParser';
import { ConflictScorer } from './conflictScorer';
import { ConflictStorage } from './storageService';
import type { Conflict } from './types';

/**
 * Main Conflict Resolver Engine
 * Extracts, parses, classifies, scores, and resolves conflicts
 */
export class ConflictResolver {
  private extractor: ConflictExtractor;
  private parser: ConflictParser;
  private classifier: ConflictClassifier;
  private scorer: ConflictScorer;
  private embedding: ConflictEmbedding;
  private storage: ConflictStorage;

  constructor() {
    this.extractor = new ConflictExtractor();
    this.parser = new ConflictParser();
    this.classifier = new ConflictClassifier();
    this.scorer = new ConflictScorer();
    this.embedding = new ConflictEmbedding();
    this.storage = new ConflictStorage();
  }

  /**
   * Process conflicts from context
   */
  async process(ctx: { entries: any[]; user: { id: string } }): Promise<{ conflicts: any[] }> {
    try {
      logger.debug({ userId: ctx.user.id, entries: ctx.entries.length }, 'Processing conflicts');

      // Step 1: Extract conflict signals
      const signals = this.extractor.detect(ctx.entries);

      if (signals.length === 0) {
        logger.debug({ userId: ctx.user.id }, 'No conflict signals found');
        return { conflicts: [] };
      }

      const conflictsOut: any[] = [];

      // Step 2: Process each signal
      for (const signal of signals) {
        try {
          // Step 2a: Parse signal into structured conflict
          const parsed = await this.parser.parse(signal.text);

          // Step 2b: Classify conflict
          const classified = this.classifier.classify(parsed);

          // Step 2c: Score conflict intensity
          classified.intensity = this.scorer.score(classified);

          // Step 2d: Generate embedding
          const embed = await this.embedding.embed({
            summary: classified.summary,
            trigger: classified.trigger,
            outcome: classified.outcome,
          });

          // Step 2e: Save conflict
          const saved = await this.storage.saveConflict(
            ctx.user.id,
            signal.memoryId,
            classified,
            embed,
            signal.timestamp
          );

          conflictsOut.push(saved);
        } catch (error) {
          logger.error({ error, signal: signal.memoryId }, 'Error processing conflict signal');
          // Continue with next signal
        }
      }

      logger.info(
        {
          userId: ctx.user.id,
          conflicts: conflictsOut.length,
        },
        'Processed conflicts'
      );

      return { conflicts: conflictsOut };
    } catch (error) {
      logger.error({ error, userId: ctx.user.id }, 'Error processing conflicts');
      throw error;
    }
  }
}

