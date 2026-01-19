import { parseISO, isAfter } from 'date-fns';

import { logger } from '../../logger';

import type { Setback, ResilienceInsight, ResilienceContext } from './types';

/**
 * Analyzes emotional recovery after setbacks
 */
export class EmotionalRecoveryAnalyzer {
  /**
   * Analyze emotional recovery
   */
  analyze(setbacks: Setback[], ctx: ResilienceContext): ResilienceInsight[] {
    const insights: ResilienceInsight[] = [];

    try {
      const identityPulse = ctx.identity_pulse || {};
      const sentimentTrend = identityPulse.sentiment_trend || identityPulse.sentimentTrend || [];

      for (const setback of setbacks) {
        const recoveryData = this.getRecoveryData(setback, sentimentTrend);

        if (recoveryData.length === 0) continue;

        // Check for rising trend
        const isRising = this.isRisingTrend(recoveryData);

        if (isRising) {
          const recoveryStrength = this.calculateRecoveryStrength(recoveryData);

          insights.push({
            id: crypto.randomUUID(),
            type: 'emotional_recovery',
            message: this.generateRecoveryMessage(recoveryStrength),
            confidence: 0.9,
            timestamp: new Date().toISOString(),
            related_setback_id: setback.id,
            metadata: {
              recovery_strength: recoveryStrength,
              recovery_data_points: recoveryData.length,
              initial_sentiment: recoveryData[0]?.value || 0,
              current_sentiment: recoveryData[recoveryData.length - 1]?.value || 0,
            },
          });
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to analyze emotional recovery');
    }

    return insights;
  }

  /**
   * Get recovery data after setback
   */
  private getRecoveryData(setback: Setback, sentimentTrend: any[]): Array<{ timestamp: string; value: number }> {
    try {
      const setbackDate = parseISO(setback.timestamp);

      return sentimentTrend
        .filter(s => {
          const sDate = parseISO(s.timestamp || s.date);
          return isAfter(sDate, setbackDate);
        })
        .slice(0, 10) // Get first 10 data points after setback
        .map(s => ({
          timestamp: s.timestamp || s.date,
          value: s.value || s.sentiment || 0,
        }));
    } catch (error) {
      logger.error({ error }, 'Failed to get recovery data');
      return [];
    }
  }

  /**
   * Check if trend is rising
   */
  private isRisingTrend(recoveryData: Array<{ timestamp: string; value: number }>): boolean {
    if (recoveryData.length < 3) return false;

    // Check if first 5 points show consistent rise
    const firstFive = recoveryData.slice(0, 5);
    let risingCount = 0;

    for (let i = 1; i < firstFive.length; i++) {
      if (firstFive[i].value >= firstFive[i - 1].value) {
        risingCount++;
      }
    }

    // At least 3 out of 4 transitions should be rising
    return risingCount >= 3;
  }

  /**
   * Calculate recovery strength
   */
  private calculateRecoveryStrength(recoveryData: Array<{ timestamp: string; value: number }>): 'strong' | 'moderate' | 'weak' {
    if (recoveryData.length < 2) return 'weak';

    const initial = recoveryData[0].value;
    const final = recoveryData[recoveryData.length - 1].value;
    const improvement = final - initial;

    if (improvement >= 0.5) return 'strong';
    if (improvement >= 0.2) return 'moderate';
    return 'weak';
  }

  /**
   * Generate recovery message
   */
  private generateRecoveryMessage(strength: 'strong' | 'moderate' | 'weak'): string {
    switch (strength) {
      case 'strong':
        return 'Strong emotional recovery detected after setback. Your emotional trajectory shows significant improvement.';
      case 'moderate':
        return 'Emotional recovery detected after setback. Your emotional state is improving.';
      case 'weak':
        return 'Early signs of emotional recovery detected after setback.';
      default:
        return 'Emotional recovery detected after setback.';
    }
  }
}

