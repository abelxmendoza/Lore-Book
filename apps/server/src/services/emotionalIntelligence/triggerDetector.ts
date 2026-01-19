import { logger } from '../../logger';

import type { EmotionSignal, TriggerEvent, TriggerType } from './types';

/**
 * Finds patterns that consistently provoke emotional spikes
 */
export class TriggerDetector {
  /**
   * Detect trigger events from emotion signals
   */
  detect(signals: EmotionSignal[]): TriggerEvent[] {
    const triggers: TriggerEvent[] = [];

    try {
      const triggerPatterns: Array<{ type: TriggerType; regex: RegExp }> = [
        { type: 'relationship', regex: /(her|him|they|friends|girlfriend|boyfriend|crush|partner|ex|relationship)/i },
        { type: 'rejection', regex: /(ignored|rejected|didn't text|ghosted|left me|abandoned|dismissed|turned down)/i },
        { type: 'failure', regex: /(failed|lost|messed up|screwed up|didn't make it|didn't get|missed|blew it)/i },
        { type: 'identity_threat', regex: /(i'm not enough|i feel like a loser|nobody respects me|i'm worthless|i'm a failure|i'm pathetic)/i },
        { type: 'conflict', regex: /(argued|fought|confrontation|disagreement|dispute|quarrel|clash)/i },
        { type: 'stress_load', regex: /(too much|overwhelmed|can't handle|too many|drowning|swamped|buried)/i },
        { type: 'rumination', regex: /(thinking too much|can't stop thinking|overthinking|dwelling|obsessing|stuck in my head)/i },
        { type: 'social_comparison', regex: /(everyone else|i'm behind|they're better|others have|why can't i|i'm not like)/i },
        { type: 'loss', regex: /(lost|gone|died|passed away|left|missing|absence)/i },
        { type: 'change', regex: /(change|different|new|transition|shift|moved|relocated)/i },
        { type: 'uncertainty', regex: /(uncertain|unknown|not sure|unclear|confused|don't know|unpredictable)/i },
        { type: 'criticism', regex: /(criticized|judged|attacked|blamed|fault|wrong|mistake|error)/i },
      ];

      for (const signal of signals) {
        // Only check high-intensity emotions for triggers
        if (signal.intensity < 0.5) continue;

        for (const pattern of triggerPatterns) {
          if (pattern.regex.test(signal.evidence)) {
            // Calculate confidence based on intensity and pattern match
            const confidence = Math.min(1, signal.intensity * signal.weight * 0.9);

            triggers.push({
              id: `trigger_${signal.id}_${pattern.type}_${Date.now()}`,
              emotion: signal,
              triggerType: pattern.type,
              pattern: pattern.regex.toString(),
              confidence,
              timestamp: signal.timestamp,
              metadata: {
                emotion_intensity: signal.intensity,
                emotion_type: signal.emotion,
              },
            });
          }
        }
      }

      logger.debug({ triggers: triggers.length, signals: signals.length }, 'Detected trigger events');

      return triggers;
    } catch (error) {
      logger.error({ error }, 'Failed to detect triggers');
      return [];
    }
  }

  /**
   * Get trigger frequency by type
   */
  getTriggerFrequency(triggers: TriggerEvent[]): Record<TriggerType, number> {
    const frequency: Record<string, number> = {};

    for (const trigger of triggers) {
      frequency[trigger.triggerType] = (frequency[trigger.triggerType] || 0) + 1;
    }

    return frequency as Record<TriggerType, number>;
  }

  /**
   * Get most common triggers
   */
  getTopTriggers(triggers: TriggerEvent[], topN: number = 5): Array<{ trigger: TriggerType; count: number }> {
    const frequency = this.getTriggerFrequency(triggers);

    return Object.entries(frequency)
      .map(([trigger, count]) => ({ trigger: trigger as TriggerType, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);
  }
}

