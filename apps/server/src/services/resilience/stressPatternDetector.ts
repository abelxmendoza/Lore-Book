import { logger } from '../../logger';
import type { ResilienceTimelinePoint } from './types';

/**
 * Detects repeating high-stress cycles
 */
export class StressPatternDetector {
  /**
   * Detect high stress periods from timeline
   */
  detect(timeline: ResilienceTimelinePoint[]): string[] {
    const stressPeriods: string[] = [];

    try {
      // Filter for high stress periods (setback > 0.5)
      const highStress = timeline.filter(p => p.setback > 0.5);

      for (const point of highStress) {
        stressPeriods.push(point.timestamp);
      }

      logger.debug({ periods: stressPeriods.length }, 'Detected stress periods');

      return stressPeriods;
    } catch (error) {
      logger.error({ error }, 'Failed to detect stress patterns');
      return [];
    }
  }

  /**
   * Detect chronic stress patterns (repeated high stress)
   */
  detectChronicStress(timeline: ResilienceTimelinePoint[]): {
    isChronic: boolean;
    periods: string[];
    frequency: number; // stress periods per month
    message: string;
  } {
    const highStressPeriods = this.detect(timeline);

    if (highStressPeriods.length === 0) {
      return {
        isChronic: false,
        periods: [],
        frequency: 0,
        message: 'No chronic stress patterns detected.',
      };
    }

    // Calculate frequency (stress periods per month)
    if (timeline.length < 2) {
      return {
        isChronic: false,
        periods: highStressPeriods,
        frequency: highStressPeriods.length,
        message: `Detected ${highStressPeriods.length} high stress period(s).`,
      };
    }

    const first = new Date(timeline[0].timestamp);
    const last = new Date(timeline[timeline.length - 1].timestamp);
    const daysSpan = (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24);
    const monthsSpan = daysSpan / 30;

    const frequency = monthsSpan > 0 ? highStressPeriods.length / monthsSpan : highStressPeriods.length;

    // Chronic stress: more than 2 stress periods per month
    const isChronic = frequency > 2;

    return {
      isChronic,
      periods: highStressPeriods,
      frequency,
      message: isChronic
        ? `Chronic stress pattern detected: ${highStressPeriods.length} high stress periods (${frequency.toFixed(1)} per month). Consider stress management strategies.`
        : `Detected ${highStressPeriods.length} high stress period(s) (${frequency.toFixed(1)} per month).`,
    };
  }

  /**
   * Detect emotional cycling (repeated setbacks and recoveries)
   */
  detectEmotionalCycling(timeline: ResilienceTimelinePoint[]): {
    isCycling: boolean;
    cycleCount: number;
    averageCycleLength: number; // days
    message: string;
  } {
    if (timeline.length < 3) {
      return {
        isCycling: false,
        cycleCount: 0,
        averageCycleLength: 0,
        message: 'Insufficient data to detect emotional cycling.',
      };
    }

    try {
      // Find cycles: setback -> recovery -> setback pattern
      const cycles: number[] = [];
      let cycleStart: number | null = null;

      for (let i = 0; i < timeline.length - 1; i++) {
        const current = timeline[i];
        const next = timeline[i + 1];

        // Start of cycle: high setback
        if (current.setback > 0.5 && cycleStart === null) {
          cycleStart = i;
        }

        // End of cycle: recovery followed by another setback, or end of timeline
        if (cycleStart !== null && current.recovery > 0.3) {
          if (next.setback > 0.5 || i === timeline.length - 2) {
            const cycleLength = new Date(timeline[i].timestamp).getTime() - new Date(timeline[cycleStart].timestamp).getTime();
            cycles.push(cycleLength / (1000 * 60 * 60 * 24)); // Convert to days
            cycleStart = null;
          }
        }
      }

      const isCycling = cycles.length >= 2;
      const averageCycleLength = cycles.length > 0
        ? cycles.reduce((sum, c) => sum + c, 0) / cycles.length
        : 0;

      return {
        isCycling,
        cycleCount: cycles.length,
        averageCycleLength,
        message: isCycling
          ? `Emotional cycling detected: ${cycles.length} cycles with average length of ${averageCycleLength.toFixed(1)} days.`
          : 'No clear emotional cycling pattern detected.',
      };
    } catch (error) {
      logger.error({ error }, 'Failed to detect emotional cycling');
      return {
        isCycling: false,
        cycleCount: 0,
        averageCycleLength: 0,
        message: 'Unable to analyze emotional cycling.',
      };
    }
  }
}

