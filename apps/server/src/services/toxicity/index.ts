import { logger } from '../../logger';
import { ToxicitySignalExtractor } from './toxicitySignalExtractor';
import { ToxicityParser } from './toxicityParser';
import { ToxicityClassifier } from './toxicityClassifier';
import { ToxicityScorer } from './toxicityScorer';
import { ToxicityEmbedding } from './toxicityEmbedding';
import { ToxicityStorage } from './toxicityStorage';
import type { ToxicityEvent } from './types';

/**
 * Main Toxicity Resolver Engine
 * Extracts, parses, classifies, scores, and resolves toxicity events
 */
export class ToxicityResolver {
  private extractor: ToxicitySignalExtractor;
  private parser: ToxicityParser;
  private classifier: ToxicityClassifier;
  private scorer: ToxicityScorer;
  private embedding: ToxicityEmbedding;
  private storage: ToxicityStorage;

  constructor() {
    this.extractor = new ToxicitySignalExtractor();
    this.parser = new ToxicityParser();
    this.classifier = new ToxicityClassifier();
    this.scorer = new ToxicityScorer();
    this.embedding = new ToxicityEmbedding();
    this.storage = new ToxicityStorage();
  }

  /**
   * Process toxicity events from context
   */
  async process(ctx: { entries: any[]; user: { id: string } }): Promise<{ toxicity: any[] }> {
    try {
      logger.debug({ userId: ctx.user.id, entries: ctx.entries.length }, 'Processing toxicity events');

      // Step 1: Extract toxicity signals
      const signals = this.extractor.detect(ctx.entries);

      if (signals.length === 0) {
        logger.debug({ userId: ctx.user.id }, 'No toxicity signals found');
        return { toxicity: [] };
      }

      const eventsOut: any[] = [];

      // Step 2: Process each signal
      for (const signal of signals) {
        try {
          // Step 2a: Parse signal into structured toxicity event
          const parsed = await this.parser.parse(signal.text);

          // Step 2b: Classify event
          const classified = this.classifier.classify(parsed);

          // Step 2c: Score severity
          classified.severity = this.scorer.score(classified);

          // Step 2d: Generate embedding
          const embed = await this.embedding.embed({
            summary: classified.summary,
            category: classified.category,
            pattern: classified.pattern,
          });

          // Step 2e: Save event
          const saved = await this.storage.save(
            ctx.user.id,
            signal.memoryId,
            classified,
            embed,
            signal.timestamp
          );

          eventsOut.push(saved);
        } catch (error) {
          logger.error({ error, signal: signal.memoryId }, 'Error processing toxicity signal');
          // Continue with next signal
        }
      }

      logger.info(
        {
          userId: ctx.user.id,
          events: eventsOut.length,
        },
        'Processed toxicity events'
      );

      return { toxicity: eventsOut };
    } catch (error) {
      logger.error({ error, userId: ctx.user.id }, 'Error processing toxicity events');
      throw error;
    }
  }
}

export * from './types';
export * from './toxicitySignalExtractor';
export * from './toxicityParser';
export * from './toxicityClassifier';
export * from './toxicityScorer';
export * from './toxicityEmbedding';
export * from './toxicityStorage';

