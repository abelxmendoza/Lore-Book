import { logger } from '../../logger';

import type { ToxicityEvent } from './types';

/**
 * Classifies and normalizes toxicity events
 */
export class ToxicityClassifier {
  private readonly validEntityTypes = ['person', 'place', 'situation', 'general'];
  private readonly validCategories = [
    'jealousy',
    'manipulation',
    'aggression',
    'chaos',
    'betrayal',
    'disrespect',
    'hostility',
    'instability',
    'sabotage',
    'dominance',
    'danger',
    'general',
  ];

  /**
   * Classify and normalize toxicity event
   */
  classify(event: ToxicityEvent): ToxicityEvent {
    try {
      const normalizedName = event.entityName?.trim().toLowerCase() || 'unknown';

      const entityType = this.validEntityTypes.includes(event.entityType?.toLowerCase())
        ? event.entityType.toLowerCase()
        : 'general';

      const category = this.validCategories.includes(event.category?.toLowerCase())
        ? event.category.toLowerCase()
        : 'general';

      const severity = Math.min(1, Math.max(0, event.severity || 0));

      return {
        ...event,
        entityType,
        entityName: normalizedName,
        category,
        severity,
      };
    } catch (error) {
      logger.error({ error, event }, 'Error classifying toxicity event');
      return event;
    }
  }
}

