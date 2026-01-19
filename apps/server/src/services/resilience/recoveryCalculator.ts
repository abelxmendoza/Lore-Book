import { logger } from '../../logger';

import type { SetbackSignal, RecoverySignal } from './types';

/**
 * Calculates recovery signals from setbacks
 * Detects upward movement after a setback
 */
export class RecoveryCalculator {
  /**
   * Calculate recovery signals from setbacks
   */
  calculateRecovery(
    setbacks: SetbackSignal[],
    entries: any[]
  ): RecoverySignal[] {
    const recovery: RecoverySignal[] = [];

    try {
      for (const setback of setbacks) {
        const setbackTime = new Date(setback.timestamp).getTime();

        // Find entries after the setback
        const afterEntries = entries
          .filter(e => {
            const entryTime = new Date(e.date || e.created_at || e.timestamp || 0).getTime();
            return entryTime > setbackTime;
          })
          .sort((a, b) => {
            const timeA = new Date(a.date || a.created_at || a.timestamp || 0).getTime();
            const timeB = new Date(b.date || b.created_at || b.timestamp || 0).getTime();
            return timeA - timeB;
          });

        if (afterEntries.length === 0) {
          // No recovery data yet
          recovery.push({
            timestamp: setback.timestamp,
            improvement: 0,
            setback_id: setback.id,
            recovery_duration_days: undefined,
          });
          continue;
        }

        // Find best sentiment after setback (recovery indicator)
        let bestSentiment = -1;
        let recoveryTime: string | undefined;

        for (const entry of afterEntries) {
          const sentiment = entry.sentiment || this.estimateSentiment(entry.content || entry.text || '');
          
          if (sentiment > bestSentiment) {
            bestSentiment = sentiment;
            recoveryTime = entry.date || entry.created_at || entry.timestamp;
          }
        }

        // Calculate improvement (how much better than the setback)
        const improvement = Math.max(0, Math.min(1, (bestSentiment + 1) / 2)); // Normalize -1 to +1 into 0 to 1

        // Calculate recovery duration
        let recoveryDurationDays: number | undefined;
        if (recoveryTime) {
          const recoveryTimeMs = new Date(recoveryTime).getTime();
          recoveryDurationDays = (recoveryTimeMs - setbackTime) / (1000 * 60 * 60 * 24);
        }

        recovery.push({
          timestamp: setback.timestamp,
          improvement,
          setback_id: setback.id,
          recovery_duration_days: recoveryDurationDays,
          metadata: {
            best_sentiment: bestSentiment,
            recovery_time: recoveryTime,
            entries_after: afterEntries.length,
          },
        });
      }

      logger.debug({ recoveries: recovery.length, setbacks: setbacks.length }, 'Calculated recovery signals');

      return recovery;
    } catch (error) {
      logger.error({ error }, 'Failed to calculate recovery');
      return [];
    }
  }

  /**
   * Estimate sentiment from text if not provided
   */
  private estimateSentiment(text: string): number {
    const textLower = text.toLowerCase();

    // Negative indicators
    const negativeMarkers = [
      'anxious', 'depressed', 'sad', 'angry', 'frustrated', 'disappointed', 'upset', 'worried',
      'hurt', 'pain', 'exhausted', 'tired', 'stressed', 'overwhelmed', 'hopeless', 'empty',
    ];
    const negativeCount = negativeMarkers.filter(m => textLower.includes(m)).length;

    // Positive indicators
    const positiveMarkers = [
      'happy', 'glad', 'excited', 'great', 'wonderful', 'amazing', 'love', 'enjoyed', 'fun',
      'good', 'better', 'best', 'proud', 'grateful', 'thankful', 'blessed', 'lucky',
      'pleased', 'satisfied', 'content', 'relieved', 'calm', 'peaceful', 'recovered', 'feeling better',
    ];
    const positiveCount = positiveMarkers.filter(m => textLower.includes(m)).length;

    // Calculate sentiment (-1 to +1)
    if (negativeCount === 0 && positiveCount === 0) return 0;
    const total = negativeCount + positiveCount;
    return (positiveCount - negativeCount) / total;
  }
}

