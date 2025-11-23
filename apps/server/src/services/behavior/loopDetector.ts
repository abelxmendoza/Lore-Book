import { logger } from '../../logger';
import type { BehaviorLoop, NormalizedBehavior } from './types';

/**
 * Detects behavior loops (recurring patterns)
 */
export class LoopDetector {
  private readonly MIN_OCCURRENCES = 3;
  private readonly WINDOW_DAYS = 45;

  /**
   * Detect behavior loops from normalized behaviors
   */
  detect(normalized: NormalizedBehavior[]): BehaviorLoop[] {
    const loops: BehaviorLoop[] = [];

    try {
      // Group behaviors by type
      const behaviorMap = new Map<string, NormalizedBehavior[]>();

      for (const behavior of normalized) {
        if (!behaviorMap.has(behavior.behavior)) {
          behaviorMap.set(behavior.behavior, []);
        }
        behaviorMap.get(behavior.behavior)!.push(behavior);
      }

      // Detect loops for each behavior type
      for (const [behavior, events] of behaviorMap.entries()) {
        if (events.length < this.MIN_OCCURRENCES) continue;

        // Sort by timestamp
        const sorted = [...events].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        const first = sorted[0].timestamp;
        const last = sorted[sorted.length - 1].timestamp;

        const diffDays =
          (new Date(last).getTime() - new Date(first).getTime()) / (1000 * 60 * 60 * 24);

        // Check if behaviors occur within the time window
        if (diffDays <= this.WINDOW_DAYS) {
          // Calculate confidence based on frequency
          const frequency = events.length / Math.max(diffDays, 1);
          const confidence = Math.min(0.7 + frequency * 0.1, 0.95);

          // Extract triggers and consequences from events
          const allTriggers = new Set<string>();
          const allConsequences = new Set<string>();

          // Try to extract from evidence (V1: simple extraction)
          for (const event of events) {
            const evidence = event.evidence.toLowerCase();
            if (evidence.match(/(lonely|bored|stressed)/i)) {
              allTriggers.add('emotional_state');
            }
            if (evidence.match(/(regret|shame|guilt)/i)) {
              allConsequences.add('negative_emotion');
            }
          }

          loops.push({
            loopName: `${behavior} loop`,
            category: 'behavior',
            behaviors: [behavior],
            triggers: Array.from(allTriggers),
            consequences: Array.from(allConsequences),
            occurrences: events.length,
            loopLength: 1,
            confidence,
            firstSeen: first,
            lastSeen: last,
          });
        }
      }

      logger.debug({ count: loops.length }, 'Detected behavior loops');
    } catch (error) {
      logger.error({ error }, 'Error detecting loops');
    }

    return loops;
  }
}

