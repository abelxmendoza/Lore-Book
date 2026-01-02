import { logger } from '../../logger';
import type { StressCorrelation, SymptomEvent, SleepEvent, EnergyEvent } from './types';

/**
 * Computes correlations between stress and health metrics
 */
export class StressCorrelation {
  /**
   * Compute stress correlations
   */
  compute(
    stressSignals: number[],
    symptoms: SymptomEvent[],
    sleep: SleepEvent[],
    energy: EnergyEvent[]
  ): StressCorrelation {
    try {
      if (stressSignals.length === 0) {
        return {
          stressLevel: 0,
          symptomCorrelation: 0,
          sleepCorrelation: 0,
          energyCorrelation: 0,
          confidence: 0,
        };
      }

      const stressLevel = stressSignals.reduce((a, b) => a + b, 0) / stressSignals.length;

      // Align data by timestamp for correlation
      const symptomIntensities = this.alignByTimestamp(stressSignals, symptoms.map(s => s.intensity), symptoms.map(s => s.timestamp));
      const sleepHours = this.alignByTimestamp(stressSignals, sleep.map(s => s.hours || 0), sleep.map(s => s.timestamp));
      const energyLevels = this.alignByTimestamp(stressSignals, energy.map(e => e.level), energy.map(e => e.timestamp));

      const symptomCorr = this.correlate(stressSignals, symptomIntensities);
      const sleepCorr = this.correlate(stressSignals, sleepHours);
      const energyCorr = this.correlate(stressSignals, energyLevels);

      // Calculate confidence based on data availability
      const minLength = Math.min(
        stressSignals.length,
        symptoms.length,
        sleep.length,
        energy.length
      );
      const confidence = Math.min(1, minLength / 10); // More data = higher confidence

      return {
        stressLevel,
        symptomCorrelation: symptomCorr,
        sleepCorrelation: sleepCorr,
        energyCorrelation: energyCorr,
        confidence,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to compute stress correlations');
      return {
        stressLevel: 0,
        symptomCorrelation: 0,
        sleepCorrelation: 0,
        energyCorrelation: 0,
        confidence: 0,
      };
    }
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  correlate(a: number[], b: number[]): number {
    if (!a.length || !b.length || a.length !== b.length) return 0;

    const n = a.length;
    const avgA = a.reduce((x, y) => x + y, 0) / n;
    const avgB = b.reduce((x, y) => x + y, 0) / n;

    let num = 0;
    let denA = 0;
    let denB = 0;

    for (let i = 0; i < n; i++) {
      const diffA = a[i] - avgA;
      const diffB = b[i] - avgB;
      num += diffA * diffB;
      denA += Math.pow(diffA, 2);
      denB += Math.pow(diffB, 2);
    }

    const denominator = Math.sqrt(denA * denB);
    if (denominator === 0) return 0;

    return num / denominator;
  }

  /**
   * Align data by timestamp (simplified - matches by index)
   */
  private alignByTimestamp(
    reference: number[],
    values: number[],
    timestamps: string[]
  ): number[] {
    // For simplicity, use the values as-is if same length
    // In production, would align by actual timestamps
    if (values.length === reference.length) {
      return values;
    }

    // Pad or truncate to match reference length
    if (values.length < reference.length) {
      const padded = [...values];
      while (padded.length < reference.length) {
        padded.push(padded[padded.length - 1] || 0);
      }
      return padded;
    }

    return values.slice(0, reference.length);
  }
}

