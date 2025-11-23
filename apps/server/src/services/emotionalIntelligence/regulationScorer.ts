import { logger } from '../../logger';
import type { EmotionSignal, RegulationScore, ReactionPattern } from './types';

/**
 * Scores emotional regulation based on patterns
 */
export class RegulationScorer {
  /**
   * Compute regulation score from signals and reactions
   */
  compute(
    signals: EmotionSignal[],
    reactions?: ReactionPattern[]
  ): RegulationScore {
    try {
      if (signals.length === 0) {
        return this.getEmptyScore();
      }

      // Calculate average intensity
      const avgIntensity = signals.reduce((sum, s) => sum + s.intensity, 0) / signals.length;

      // Stability: lower average intensity = higher stability
      // Also consider variance (lower variance = more stable)
      const intensities = signals.map(s => s.intensity);
      const variance = this.calculateVariance(intensities);
      const stability = Math.max(0, Math.min(1, 1 - avgIntensity - variance * 0.5));

      // Modulation: ability to reduce intensity over time
      const modulation = this.calculateModulation(signals);

      // Delay: reaction delay before escalation (based on reaction patterns)
      const delay = this.calculateDelay(reactions || []);

      // Resilience: recovery speed (how quickly emotions return to baseline)
      const resilience = this.calculateResilience(signals);

      // Emotional flexibility: adaptive emotional responses
      const emotionalFlexibility = this.calculateFlexibility(reactions || []);

      // Overall EQ score (weighted average)
      const overall = (
        stability * 0.25 +
        modulation * 0.2 +
        delay * 0.15 +
        resilience * 0.2 +
        emotionalFlexibility * 0.2
      );

      return {
        stability,
        modulation,
        delay,
        resilience,
        emotionalFlexibility,
        overall,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to compute regulation score');
      return this.getEmptyScore();
    }
  }

  /**
   * Calculate variance of intensities
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * Calculate modulation (ability to reduce intensity)
   */
  private calculateModulation(signals: EmotionSignal[]): number {
    if (signals.length < 2) return 0.5;

    // Sort by timestamp
    const sorted = [...signals].sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return dateA - dateB;
    });

    // Check if intensity decreases after spikes
    let modulationCount = 0;
    let totalChecks = 0;

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];

      // If previous was high intensity, check if current is lower
      if (prev.intensity > 0.7) {
        totalChecks++;
        if (curr.intensity < prev.intensity) {
          modulationCount++;
        }
      }
    }

    return totalChecks > 0 ? modulationCount / totalChecks : 0.5;
  }

  /**
   * Calculate delay (reaction delay before escalation)
   */
  private calculateDelay(reactions: ReactionPattern[]): number {
    if (reactions.length === 0) return 0.5;

    // Count adaptive/responsive reactions vs reactive/impulsive
    const adaptive = reactions.filter(r => 
      r.type === 'adaptive' || r.type === 'responsive'
    ).length;

    const reactive = reactions.filter(r => 
      r.type === 'reactive' || r.type === 'impulsive'
    ).length;

    const total = reactions.length;
    if (total === 0) return 0.5;

    // Higher ratio of adaptive = higher delay score
    return adaptive / total;
  }

  /**
   * Calculate resilience (recovery speed)
   */
  private calculateResilience(signals: EmotionSignal[]): number {
    if (signals.length < 3) return 0.5;

    // Sort by timestamp
    const sorted = [...signals].sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return dateA - dateB;
    });

    // Find recovery patterns (high intensity followed by lower intensity)
    let recoveryCount = 0;
    let totalSpikes = 0;

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];

      // If previous was high intensity (spike)
      if (prev.intensity > 0.7) {
        totalSpikes++;

        // Check if recovered within reasonable time (next few entries)
        const timeDiff = new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();
        const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

        // Recovery within 3 days is good
        if (curr.intensity < prev.intensity && daysDiff <= 3) {
          recoveryCount++;
        }
      }
    }

    return totalSpikes > 0 ? recoveryCount / totalSpikes : 0.5;
  }

  /**
   * Calculate emotional flexibility (adaptive responses)
   */
  private calculateFlexibility(reactions: ReactionPattern[]): number {
    if (reactions.length === 0) return 0.5;

    // Count adaptive reactions
    const adaptive = reactions.filter(r => r.type === 'adaptive').length;
    const total = reactions.length;

    // Also consider variety of reaction types (more variety = more flexible)
    const uniqueTypes = new Set(reactions.map(r => r.type)).size;
    const varietyScore = Math.min(1, uniqueTypes / 5); // Normalize to 0-1

    const adaptiveScore = adaptive / total;
    
    // Combine adaptive score with variety score
    return (adaptiveScore * 0.7 + varietyScore * 0.3);
  }

  /**
   * Get empty regulation score
   */
  private getEmptyScore(): RegulationScore {
    return {
      stability: 0.5,
      modulation: 0.5,
      delay: 0.5,
      resilience: 0.5,
      emotionalFlexibility: 0.5,
      overall: 0.5,
    };
  }
}

