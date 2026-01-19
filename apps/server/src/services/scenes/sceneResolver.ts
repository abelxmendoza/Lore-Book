import { logger } from '../../logger';

import { SceneEmbedding } from './sceneEmbedding';
import { SceneExtractor } from './sceneExtractor';
import { SceneNormalizer } from './sceneNormalizer';
import { SceneParser } from './sceneParser';
import { SceneSegmenter } from './sceneSegmenter';
import { SceneStorage } from './storageService';
import type { Scene } from './types';

/**
 * Main Scene Resolver Engine
 * Extracts, segments, parses, normalizes, and resolves scenes
 */
export class SceneResolver {
  private extractor: SceneExtractor;
  private parser: SceneParser;
  private segmenter: SceneSegmenter;
  private normalizer: SceneNormalizer;
  private embedding: SceneEmbedding;
  private storage: SceneStorage;

  constructor() {
    this.extractor = new SceneExtractor();
    this.parser = new SceneParser();
    this.segmenter = new SceneSegmenter();
    this.normalizer = new SceneNormalizer();
    this.embedding = new SceneEmbedding();
    this.storage = new SceneStorage();
  }

  /**
   * Process scenes from context
   */
  async process(ctx: { entries: any[]; user: { id: string } }): Promise<{ scenes: any[] }> {
    try {
      logger.debug({ userId: ctx.user.id, entries: ctx.entries.length }, 'Processing scenes');

      // Step 1: Extract scene signals
      const signals = this.extractor.detect(ctx.entries);

      if (signals.length === 0) {
        logger.debug({ userId: ctx.user.id }, 'No scene signals found');
        return { scenes: [] };
      }

      const scenesOut: any[] = [];

      // Step 2: Process each signal
      for (const signal of signals) {
        try {
          // Step 2a: Segment long entries into multiple scenes
          const segments = this.segmenter.segment(signal.text);

          // Step 2b: Process each segment
          for (const segment of segments) {
            // Step 2c: Parse segment into structured scene
            const parsed = await this.parser.parse(segment);

            // Step 2d: Normalize scene data
            const normalized = this.normalizer.normalize(parsed);

            // Step 2e: Generate embedding
            const embed = await this.embedding.embed({
              summary: normalized.summary,
              title: normalized.title,
            });

            // Step 2f: Save scene
            const saved = await this.storage.saveScene(
              ctx.user.id,
              signal.memoryId,
              normalized,
              embed,
              signal.timestamp
            );

            scenesOut.push(saved);
          }
        } catch (error) {
          logger.error({ error, signal: signal.memoryId }, 'Error processing scene signal');
          // Continue with next signal
        }
      }

      logger.info(
        {
          userId: ctx.user.id,
          scenes: scenesOut.length,
        },
        'Processed scenes'
      );

      return { scenes: scenesOut };
    } catch (error) {
      logger.error({ error, userId: ctx.user.id }, 'Error processing scenes');
      throw error;
    }
  }
}

