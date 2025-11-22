import { logger } from '../../logger';

/**
 * Detects risk zones and toxicity
 */
export class RiskZones {
  /**
   * Compute toxicity score
   * Emotional harm + behavior derailment = toxicity
   */
  compute(emotionalImpact: number, behavioralImpact: number): number {
    try {
      // Emotional harm component (negative emotional impact)
      const emo = emotionalImpact < 0 ? Math.abs(emotionalImpact) : 0;

      // Behavioral derailment component (negative behavioral impact)
      const beh = behavioralImpact < 0 ? Math.abs(behavioralImpact) : 0;

      // Combined toxicity (weighted average)
      const toxicity = (emo * 0.6 + beh * 0.4) / 1.0;

      // Clamp between 0 and 1
      return Math.max(0, Math.min(1, toxicity));
    } catch (error) {
      logger.error({ error }, 'Failed to compute toxicity score');
      return 0;
    }
  }

  /**
   * Compute uplift score (opposite of toxicity)
   */
  computeUplift(emotionalImpact: number, behavioralImpact: number): number {
    try {
      // Positive emotional impact
      const emo = emotionalImpact > 0 ? emotionalImpact : 0;

      // Positive behavioral impact
      const beh = behavioralImpact > 0 ? behavioralImpact : 0;

      // Combined uplift (weighted average)
      const uplift = (emo * 0.6 + beh * 0.4) / 1.0;

      // Clamp between 0 and 1
      return Math.max(0, Math.min(1, uplift));
    } catch (error) {
      logger.error({ error }, 'Failed to compute uplift score');
      return 0;
    }
  }

  /**
   * Determine risk level
   */
  getRiskLevel(toxicityScore: number): 'low' | 'medium' | 'high' | 'critical' {
    if (toxicityScore >= 0.8) return 'critical';
    if (toxicityScore >= 0.6) return 'high';
    if (toxicityScore >= 0.4) return 'medium';
    return 'low';
  }
}

