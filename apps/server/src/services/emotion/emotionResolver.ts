import { logger } from '../../logger';
import { embeddingService } from '../embeddingService';

import { EmotionClassifier } from './emotionClassifier';
import { EmotionClusterizer } from './emotionClusterizer';
import { EmotionExtractor } from './emotionExtractor';
import { EmotionIntensity } from './emotionIntensity';
import { EmotionStorage } from './storageService';
import { TriggerExtractor } from './triggerExtractor';
import type { EmotionEventResolved, RawEmotionSignal } from './types';

/**
 * Main Emotion Resolver Engine
 * Extracts, classifies, clusters, and resolves emotions
 */
export class EmotionResolver {
  private extractor: EmotionExtractor;
  private classifier: EmotionClassifier;
  private intensity: EmotionIntensity;
  private clusterizer: EmotionClusterizer;
  private triggerExtractor: TriggerExtractor;
  private storage: EmotionStorage;

  constructor() {
    this.extractor = new EmotionExtractor();
    this.classifier = new EmotionClassifier();
    this.intensity = new EmotionIntensity();
    this.clusterizer = new EmotionClusterizer();
    this.triggerExtractor = new TriggerExtractor();
    this.storage = new EmotionStorage();
  }

  /**
   * Process emotions from context
   */
  async process(ctx: { entries: any[]; user: { id: string } }): Promise<EmotionEventResolved[]> {
    try {
      logger.debug({ userId: ctx.user.id, entries: ctx.entries.length }, 'Processing emotions');

      // Step 1: Extract raw emotion signals
      const signals = this.extractor.extract(ctx.entries);

      if (signals.length === 0) {
        logger.debug({ userId: ctx.user.id }, 'No emotion signals found');
        return [];
      }

      // Step 2: Cluster signals by time window
      const clusters = this.clusterizer.group(signals);

      // Step 3: Process each cluster
      const results: EmotionEventResolved[] = [];

      for (const bucket of clusters) {
        // Combine text from cluster
        const text = bucket.map(b => b.text).join('\n');

        // Classify emotion
        const classification = await this.classifier.classify(text);

        // Compute intensity
        const intensity = this.intensity.compute(text);

        // Extract triggers
        const triggers = this.triggerExtractor.extract(text);

        // Get embedding
        let embedding: number[] = [];
        try {
          embedding = await embeddingService.embedText(text);
        } catch (error) {
          logger.warn({ error }, 'Failed to get embedding for emotion');
        }

        // Create emotion event
        const event: EmotionEventResolved = {
          emotion: classification.emotion,
          subtype: classification.subtype,
          intensity,
          polarity: classification.polarity,
          triggers: [...new Set(triggers)],
          embedding: embedding.length > 0 ? embedding : undefined,
          startTime: bucket[0].timestamp,
          endTime: bucket[bucket.length - 1].timestamp,
          confidence: 0.9,
          metadata: { raw: bucket },
        };

        // Save event
        const saved = await this.storage.saveEvent(ctx.user.id, event, bucket);
        results.push(saved);
      }

      logger.info(
        {
          userId: ctx.user.id,
          signals: signals.length,
          clusters: clusters.length,
          resolved: results.length,
        },
        'Processed emotions'
      );

      return results;
    } catch (error) {
      logger.error({ error, userId: ctx.user?.id }, 'Failed to process emotions');
      return [];
    }
  }
}

