import { logger } from '../../logger';

/**
 * Detects plateaus in growth (flattening curves)
 */
export class PlateauDetector {
  /**
   * Detect if values are plateauing
   * Returns true if the last N values show minimal variation
   */
  detect(values: number[], windowSize: number = 3, threshold: number = 0.05): boolean {
    if (values.length < windowSize) return false;

    try {
      const last = values.slice(-windowSize);
      const range = Math.max(...last) - Math.min(...last);

      // Plateau if range is very small (values are flat)
      return range < threshold;
    } catch (error) {
      logger.error({ error }, 'Failed to detect plateau');
      return false;
    }
  }

  /**
   * Detect stagnation zone (extended plateau)
   */
  detectStagnation(values: number[], windowSize: number = 5, threshold: number = 0.05): boolean {
    if (values.length < windowSize) return false;

    try {
      const last = values.slice(-windowSize);
      const range = Math.max(...last) - Math.min(...last);
      const average = last.reduce((a, b) => a + b, 0) / last.length;

      // Stagnation: flat values that are also low
      return range < threshold && average < 0.3;
    } catch (error) {
      logger.error({ error }, 'Failed to detect stagnation');
      return false;
    }
  }

  /**
   * Calculate plateau duration (how long values have been flat)
   */
  calculateDuration(values: number[], threshold: number = 0.05): number {
    if (values.length < 2) return 0;

    try {
      let duration = 0;

      // Work backwards from the end
      for (let i = values.length - 1; i >= 1; i--) {
        const diff = Math.abs(values[i] - values[i - 1]);
        if (diff < threshold) {
          duration++;
        } else {
          break;
        }
      }

      return duration;
    } catch (error) {
      logger.error({ error }, 'Failed to calculate plateau duration');
      return 0;
    }
  }
}

