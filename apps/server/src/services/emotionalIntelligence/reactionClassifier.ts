import { logger } from '../../logger';

import type { EmotionSignal, ReactionPattern, ReactionType } from './types';

/**
 * Determines if emotional responses are healthy or maladaptive
 */
export class ReactionClassifier {
  /**
   * Classify reaction patterns from emotion signals
   */
  classify(signals: EmotionSignal[]): ReactionPattern[] {
    const patterns: ReactionPattern[] = [];

    try {
      for (const signal of signals) {
        const evidence = signal.evidence.toLowerCase();

        // Impulsive reactions (high intensity, immediate)
        if (signal.intensity > 0.8) {
          patterns.push({
            id: `reaction_${signal.id}_impulsive_${Date.now()}`,
            type: 'impulsive',
            evidence: signal.evidence.substring(0, 200),
            confidence: 0.7,
            timestamp: signal.timestamp,
            emotion: signal.emotion,
            metadata: {
              intensity: signal.intensity,
            },
          });
        }

        // Avoidant reactions (fear + avoidance behavior)
        if (signal.emotion === 'fear' && /(avoid|hid|ignored|ran away|escaped|withdrew|retreated)/i.test(evidence)) {
          patterns.push({
            id: `reaction_${signal.id}_avoidant_${Date.now()}`,
            type: 'avoidant',
            evidence: signal.evidence.substring(0, 200),
            confidence: 0.8,
            timestamp: signal.timestamp,
            emotion: signal.emotion,
            metadata: {
              intensity: signal.intensity,
            },
          });
        }

        // Ruminative reactions (stress/anxiety + overthinking)
        if ((signal.emotion === 'stress' || signal.emotion === 'anxiety') && 
            /(thinking too much|overthinking|can't stop thinking|dwelling|obsessing|ruminating|stuck in my head)/i.test(evidence)) {
          patterns.push({
            id: `reaction_${signal.id}_ruminative_${Date.now()}`,
            type: 'ruminative',
            evidence: signal.evidence.substring(0, 200),
            confidence: 0.8,
            timestamp: signal.timestamp,
            emotion: signal.emotion,
            metadata: {
              intensity: signal.intensity,
            },
          });
        }

        // Responsive reactions (moderate intensity, measured response)
        if (signal.intensity >= 0.3 && signal.intensity <= 0.6) {
          patterns.push({
            id: `reaction_${signal.id}_responsive_${Date.now()}`,
            type: 'responsive',
            evidence: signal.evidence.substring(0, 200),
            confidence: 0.6,
            timestamp: signal.timestamp,
            emotion: signal.emotion,
            metadata: {
              intensity: signal.intensity,
            },
          });
        }

        // Reactive reactions (high intensity, immediate, uncontrolled)
        if (signal.intensity > 0.7 && 
            /(immediately|right away|instantly|snapped|lost it|blew up|exploded)/i.test(evidence)) {
          patterns.push({
            id: `reaction_${signal.id}_reactive_${Date.now()}`,
            type: 'reactive',
            evidence: signal.evidence.substring(0, 200),
            confidence: 0.75,
            timestamp: signal.timestamp,
            emotion: signal.emotion,
            metadata: {
              intensity: signal.intensity,
            },
          });
        }

        // Suppressed reactions (emotion mentioned but not expressed)
        if ((signal.emotion === 'anger' || signal.emotion === 'sadness' || signal.emotion === 'fear') &&
            /(held it in|didn't show|kept quiet|bottled up|suppressed|hid my feelings)/i.test(evidence)) {
          patterns.push({
            id: `reaction_${signal.id}_suppressed_${Date.now()}`,
            type: 'suppressed',
            evidence: signal.evidence.substring(0, 200),
            confidence: 0.7,
            timestamp: signal.timestamp,
            emotion: signal.emotion,
            metadata: {
              intensity: signal.intensity,
            },
          });
        }

        // Adaptive reactions (healthy coping, processing, growth)
        if ((signal.emotion === 'calm' || signal.emotion === 'joy' || signal.emotion === 'gratitude') &&
            /(processed|worked through|dealt with|handled|managed|learned|grew|reflected)/i.test(evidence)) {
          patterns.push({
            id: `reaction_${signal.id}_adaptive_${Date.now()}`,
            type: 'adaptive',
            evidence: signal.evidence.substring(0, 200),
            confidence: 0.7,
            timestamp: signal.timestamp,
            emotion: signal.emotion,
            metadata: {
              intensity: signal.intensity,
            },
          });
        }
      }

      logger.debug({ patterns: patterns.length, signals: signals.length }, 'Classified reaction patterns');

      return patterns;
    } catch (error) {
      logger.error({ error }, 'Failed to classify reactions');
      return [];
    }
  }

  /**
   * Get reaction pattern distribution
   */
  getReactionDistribution(patterns: ReactionPattern[]): Record<ReactionType, number> {
    const distribution: Record<string, number> = {};

    for (const pattern of patterns) {
      distribution[pattern.type] = (distribution[pattern.type] || 0) + 1;
    }

    return distribution as Record<ReactionType, number>;
  }
}

