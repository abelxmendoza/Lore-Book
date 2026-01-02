import type { ArchetypeSignal, ArchetypeProfile } from './types';

/**
 * Calculates archetype profile from signals
 */
export class ProfileCalculator {
  /**
   * Compute archetype profile
   */
  calculate(signals: ArchetypeSignal[]): ArchetypeProfile {
    const distribution: Record<string, number> = {};

    // Sum confidence scores for each archetype
    for (const signal of signals) {
      if (!distribution[signal.label]) {
        distribution[signal.label] = 0;
      }
      distribution[signal.label] += signal.confidence;
    }

    // Sort by score
    const sorted = Object.entries(distribution).sort((a, b) => b[1] - a[1]);

    // Get dominant archetype
    const dominant = sorted.length > 0 ? sorted[0][0] : 'Unknown';

    // Get secondary archetypes (next 3)
    const secondary = sorted.slice(1, 4).map(([label]) => label);

    // Find shadow archetype
    const shadow = sorted.find(([label]) => label.includes('Shadow'))?.[0];

    return {
      user_id: signals[0]?.user_id || '',
      dominant,
      secondary,
      shadow,
      distribution,
    };
  }
}

