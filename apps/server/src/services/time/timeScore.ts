import { logger } from '../../logger';

import type { TimeBlock, ProcrastinationSignal, EnergyCurvePoint, TimeScore } from './types';

/**
 * Computes overall time management scores
 */
export class TimeScoreService {
  /**
   * Compute time score
   */
  compute(
    blocks: TimeBlock[],
    procrastination: ProcrastinationSignal[],
    energy: EnergyCurvePoint[]
  ): TimeScore {
    try {
      // Consistency: regularity of time blocks
      const consistency = this.computeConsistency(blocks);

      // Efficiency: inverse of procrastination
      const efficiency = this.computeEfficiency(procrastination);

      // Distribution: energy distribution throughout day
      const distribution = this.computeDistribution(energy);

      // Focus: percentage of focus activities
      const focus = this.computeFocus(blocks);

      // Overall weighted score
      const overall = (
        consistency * 0.25 +
        efficiency * 0.3 +
        distribution * 0.2 +
        focus * 0.25
      );

      logger.debug(
        {
          consistency,
          efficiency,
          distribution,
          focus,
          overall,
        },
        'Computed time score'
      );

      return {
        consistency,
        efficiency,
        distribution,
        focus,
        overall,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to compute time score');
      return {
        consistency: 0.5,
        efficiency: 0.5,
        distribution: 0.5,
        focus: 0.5,
        overall: 0.5,
      };
    }
  }

  /**
   * Compute consistency (regularity of time blocks)
   */
  private computeConsistency(blocks: TimeBlock[]): number {
    if (blocks.length < 2) return 0.3;

    // Sort by start time
    const sorted = [...blocks].sort((a, b) => {
      const dateA = new Date(a.start).getTime();
      const dateB = new Date(b.start).getTime();
      return dateA - dateB;
    });

    // Calculate time intervals between blocks
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const timeDiff = new Date(sorted[i].start).getTime() - new Date(sorted[i - 1].start).getTime();
      const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
      intervals.push(daysDiff);
    }

    // Consistency = inverse of coefficient of variation
    const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
    const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = avgInterval > 0 ? stdDev / avgInterval : 1;

    return Math.max(0, Math.min(1, 1 - coefficientOfVariation));
  }

  /**
   * Compute efficiency (inverse of procrastination)
   */
  private computeEfficiency(procrastination: ProcrastinationSignal[]): number {
    // More procrastination = lower efficiency
    const procrastinationRate = Math.min(1, procrastination.length / 15);
    return Math.max(0, 1 - procrastinationRate);
  }

  /**
   * Compute distribution (energy distribution throughout day)
   */
  private computeDistribution(energy: EnergyCurvePoint[]): number {
    if (energy.length === 0) return 0.5;

    // Count hours with meaningful activity (level > 0.4)
    const activeHours = energy.filter(e => e.level > 0.4).length;
    const distribution = activeHours / 24; // Normalize to 0-1

    return Math.min(1, distribution);
  }

  /**
   * Compute focus (percentage of focus activities)
   */
  private computeFocus(blocks: TimeBlock[]): number {
    if (blocks.length === 0) return 0.3;

    const focusCategories = ['coding', 'robotics', 'learning', 'work'];
    const focusBlocks = blocks.filter(b => focusCategories.includes(b.category));
    const focusRatio = focusBlocks.length / blocks.length;

    return focusRatio;
  }

  /**
   * Get time management category
   */
  getCategory(score: number): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
    if (score >= 0.8) return 'excellent';
    if (score >= 0.6) return 'good';
    if (score >= 0.4) return 'fair';
    if (score >= 0.2) return 'poor';
    return 'critical';
  }
}

