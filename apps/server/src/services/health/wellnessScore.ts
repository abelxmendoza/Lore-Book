import { logger } from '../../logger';
import type { SymptomEvent, SleepEvent, EnergyEvent, RecoveryPrediction, WellnessScore } from './types';

/**
 * Computes overall wellness scores
 */
export class WellnessScoreService {
  /**
   * Compute wellness score
   */
  compute(
    symptoms: SymptomEvent[],
    sleep: SleepEvent[],
    energy: EnergyEvent[],
    recovery: RecoveryPrediction
  ): WellnessScore {
    try {
      // Physical score: inverse of symptom intensity
      const physical = this.computePhysicalScore(symptoms);

      // Mental score: based on energy levels
      const mental = this.computeMentalScore(energy);

      // Sleep score: based on hours and quality
      const sleepScore = this.computeSleepScore(sleep);

      // Recovery score: inverse of recovery days
      const recoveryScore = this.computeRecoveryScore(recovery);

      // Overall weighted score
      const overall = (
        physical * 0.3 +
        mental * 0.25 +
        sleepScore * 0.25 +
        recoveryScore * 0.2
      );

      return {
        physical,
        mental,
        sleep: sleepScore,
        recovery: recoveryScore,
        overall,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to compute wellness score');
      return {
        physical: 0.5,
        mental: 0.5,
        sleep: 0.5,
        recovery: 0.5,
        overall: 0.5,
      };
    }
  }

  /**
   * Compute physical wellness score
   */
  private computePhysicalScore(symptoms: SymptomEvent[]): number {
    if (symptoms.length === 0) return 0.8; // No symptoms = good physical health

    const avgIntensity = symptoms.reduce((a, b) => a + b.intensity, 0) / symptoms.length;
    return Math.max(0, 1 - avgIntensity);
  }

  /**
   * Compute mental wellness score
   */
  private computeMentalScore(energy: EnergyEvent[]): number {
    if (energy.length === 0) return 0.5;

    const avgEnergy = energy.reduce((a, b) => a + b.level, 0) / energy.length;
    return avgEnergy;
  }

  /**
   * Compute sleep wellness score
   */
  private computeSleepScore(sleep: SleepEvent[]): number {
    if (sleep.length === 0) return 0.5;

    // Calculate based on hours and quality
    const hoursScores: number[] = [];
    const qualityScores: number[] = [];

    for (const event of sleep) {
      if (event.hours !== null) {
        // Optimal sleep: 7-9 hours
        const hours = event.hours;
        let hoursScore = 0;
        if (hours >= 7 && hours <= 9) {
          hoursScore = 1.0;
        } else if (hours >= 6 && hours <= 10) {
          hoursScore = 0.8;
        } else if (hours >= 5 && hours <= 11) {
          hoursScore = 0.6;
        } else {
          hoursScore = 0.4;
        }
        hoursScores.push(hoursScore);
      }

      if (event.quality !== null) {
        qualityScores.push(event.quality);
      }
    }

    // Combine hours and quality scores
    const avgHoursScore = hoursScores.length > 0
      ? hoursScores.reduce((sum, s) => sum + s, 0) / hoursScores.length
      : 0.5;
    const avgQualityScore = qualityScores.length > 0
      ? qualityScores.reduce((sum, s) => sum + s, 0) / qualityScores.length
      : 0.5;

    // Weighted average (hours 60%, quality 40%)
    return (avgHoursScore * 0.6 + avgQualityScore * 0.4);
  }

  /**
   * Compute recovery wellness score
   */
  private computeRecoveryScore(recovery: RecoveryPrediction): number {
    if (recovery.expectedDaysToRecover === 0) return 1.0; // No recovery needed

    // Inverse relationship: fewer days = higher score
    // Normalize: 0 days = 1.0, 14+ days = 0.0
    const normalized = Math.max(0, 1 - (recovery.expectedDaysToRecover / 14));
    return normalized;
  }

  /**
   * Get wellness category
   */
  getCategory(score: number): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
    if (score >= 0.8) return 'excellent';
    if (score >= 0.6) return 'good';
    if (score >= 0.4) return 'fair';
    if (score >= 0.2) return 'poor';
    return 'critical';
  }
}

