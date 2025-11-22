import { logger } from '../../logger';

/**
 * Detects breakthroughs (sudden upward jumps)
 */
export class BreakthroughDetector {
  /**
   * Detect if there's a breakthrough (sudden jump)
   * Returns true if the last value shows significant increase
   */
  detect(values: number[], threshold: number = 0.2): boolean {
    if (values.length < 2) return false;

    try {
      const diff = values[values.length - 1] - values[values.length - 2];
      return diff > threshold;
    } catch (error) {
      logger.error({ error }, 'Failed to detect breakthrough');
      return false;
    }
  }

  /**
   * Detect major breakthrough (very large jump)
   */
  detectMajor(values: number[], threshold: number = 0.4): boolean {
    if (values.length < 2) return false;

    try {
      const diff = values[values.length - 1] - values[values.length - 2];
      return diff > threshold;
    } catch (error) {
      logger.error({ error }, 'Failed to detect major breakthrough');
      return false;
    }
  }

  /**
   * Detect breakthrough pattern (multiple consecutive increases)
   */
  detectPattern(values: number[], minIncreases: number = 3): boolean {
    if (values.length < minIncreases + 1) return false;

    try {
      const recent = values.slice(-(minIncreases + 1));
      let increases = 0;

      for (let i = 1; i < recent.length; i++) {
        if (recent[i] > recent[i - 1]) {
          increases++;
        }
      }

      return increases >= minIncreases;
    } catch (error) {
      logger.error({ error }, 'Failed to detect breakthrough pattern');
      return false;
    }
  }

  /**
   * Calculate breakthrough magnitude
   */
  calculateMagnitude(values: number[]): number {
    if (values.length < 2) return 0;

    try {
      const diff = values[values.length - 1] - values[values.length - 2];
      return Math.max(0, diff);
    } catch (error) {
      logger.error({ error }, 'Failed to calculate breakthrough magnitude');
      return 0;
    }
  }
}

