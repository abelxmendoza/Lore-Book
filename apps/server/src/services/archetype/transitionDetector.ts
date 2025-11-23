import { logger } from '../../logger';
import type { ArchetypeSignal, ArchetypeTransition } from './types';

/**
 * Detects transitions between archetypes
 */
export class TransitionDetector {
  /**
   * Detect archetype transitions
   */
  detect(signals: ArchetypeSignal[]): ArchetypeTransition[] {
    const transitions: ArchetypeTransition[] = [];

    try {
      // Sort signals by timestamp
      const sorted = [...signals].sort((a, b) => {
        const timeA = new Date(a.timestamp || 0).getTime();
        const timeB = new Date(b.timestamp || 0).getTime();
        return timeA - timeB;
      });

      // Find transitions
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];

        if (prev.label !== curr.label) {
          const weight = (prev.confidence + curr.confidence) / 2;

          transitions.push({
            id: `transition_${prev.id}_${curr.id}`,
            user_id: prev.user_id,
            from: prev.label,
            to: curr.label,
            weight,
            evidence: [prev.evidence, curr.evidence],
            timestamp: curr.timestamp,
            metadata: {
              from_signal_id: prev.id,
              to_signal_id: curr.id,
            },
          });
        }
      }

      logger.debug({ transitions: transitions.length }, 'Detected archetype transitions');

      return transitions;
    } catch (error) {
      logger.error({ error }, 'Failed to detect transitions');
      return [];
    }
  }
}

