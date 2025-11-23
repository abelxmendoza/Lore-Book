import { logger } from '../../logger';
import type { RawEmotionSignal } from './types';

/**
 * Clusters emotion signals by time windows
 */
export class EmotionClusterizer {
  private readonly TIME_WINDOW_MINUTES = 90; // 90-minute merge window

  /**
   * Group signals by time window
   */
  group(signals: RawEmotionSignal[]): RawEmotionSignal[][] {
    if (signals.length === 0) return [];

    try {
      // Sort signals by timestamp
      const sorted = [...signals].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const clusters: RawEmotionSignal[][] = [];
      let bucket: RawEmotionSignal[] = [sorted[0]];

      for (let i = 1; i < sorted.length; i++) {
        const prev = bucket[bucket.length - 1];
        const cur = sorted[i];

        const prevTime = new Date(prev.timestamp).getTime();
        const curTime = new Date(cur.timestamp).getTime();
        const diffMinutes = (curTime - prevTime) / (1000 * 60);

        if (diffMinutes <= this.TIME_WINDOW_MINUTES) {
          // Within time window - add to bucket
          bucket.push(cur);
        } else {
          // Outside time window - start new bucket
          clusters.push(bucket);
          bucket = [cur];
        }
      }

      // Add final bucket
      if (bucket.length > 0) {
        clusters.push(bucket);
      }

      logger.debug({ clusters: clusters.length, signals: signals.length }, 'Clustered emotion signals');

      return clusters;
    } catch (error) {
      logger.error({ error }, 'Failed to cluster emotion signals');
      return [];
    }
  }
}

