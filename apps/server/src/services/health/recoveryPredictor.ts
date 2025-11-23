import { logger } from '../../logger';
import type { SymptomEvent, RecoveryPrediction } from './types';

/**
 * Predicts recovery time from symptoms
 */
export class RecoveryPredictor {
  /**
   * Predict recovery from symptoms
   */
  predict(symptoms: SymptomEvent[]): RecoveryPrediction {
    try {
      if (symptoms.length === 0) {
        return {
          expectedDaysToRecover: 0,
          confidence: 0,
          predictedCurve: [],
          currentIntensity: 0,
        };
      }

      // Calculate average intensity
      const avgIntensity = symptoms.reduce((a, b) => a + b.intensity, 0) / symptoms.length;

      // Get most recent intensity
      const sorted = [...symptoms].sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateB - dateA; // Most recent first
      });
      const currentIntensity = sorted[0]?.intensity || avgIntensity;

      // Recovery time based on intensity and symptom type
      const recoveryDays = this.calculateRecoveryDays(symptoms, currentIntensity);

      // Generate predicted recovery curve
      const predictedCurve = this.generateRecoveryCurve(currentIntensity, recoveryDays);

      // Calculate confidence based on data quality
      const confidence = this.calculateConfidence(symptoms);

      return {
        expectedDaysToRecover: recoveryDays,
        confidence,
        predictedCurve,
        currentIntensity,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to predict recovery');
      return {
        expectedDaysToRecover: 7,
        confidence: 0.5,
        predictedCurve: [],
        currentIntensity: 0.5,
      };
    }
  }

  /**
   * Calculate recovery days based on symptoms
   */
  private calculateRecoveryDays(symptoms: SymptomEvent[], currentIntensity: number): number {
    // Base recovery time on intensity
    let baseDays = Math.round(currentIntensity * 10);

    // Adjust based on symptom types
    const symptomTypes = new Set(symptoms.map(s => s.type));

    // Longer recovery for certain types
    if (symptomTypes.has('injury')) {
      baseDays = Math.max(baseDays, 14); // Injuries take longer
    }
    if (symptomTypes.has('immune')) {
      baseDays = Math.max(baseDays, 7); // Illness recovery
    }
    if (symptomTypes.has('pain') && currentIntensity > 0.7) {
      baseDays = Math.max(baseDays, 10); // High pain takes longer
    }

    // Clamp to reasonable range (1-30 days)
    return Math.max(1, Math.min(30, baseDays));
  }

  /**
   * Generate predicted recovery curve
   */
  private generateRecoveryCurve(currentIntensity: number, days: number): number[] {
    const curve: number[] = [];

    for (let day = 0; day <= days; day++) {
      // Exponential decay model
      const progress = day / days;
      const intensity = currentIntensity * Math.pow(1 - progress, 1.5);
      curve.push(Math.max(0, intensity));
    }

    return curve;
  }

  /**
   * Calculate prediction confidence
   */
  private calculateConfidence(symptoms: SymptomEvent[]): number {
    if (symptoms.length === 0) return 0;

    // More symptoms = higher confidence (more data)
    const dataConfidence = Math.min(1, symptoms.length / 10);

    // Higher weight = higher confidence (better extraction)
    const avgWeight = symptoms.reduce((sum, s) => sum + s.weight, 0) / symptoms.length;
    const weightConfidence = avgWeight;

    // Combine confidences
    return (dataConfidence * 0.6 + weightConfidence * 0.4);
  }
}

