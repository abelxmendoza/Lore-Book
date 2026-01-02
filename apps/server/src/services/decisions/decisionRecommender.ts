import { logger } from '../../logger';
import type { DecisionInsight } from './types';

/**
 * Generates recommendations from decision insights
 */
export class DecisionRecommender {
  /**
   * Generate recommendations from insights
   */
  recommend(insights: DecisionInsight[]): Array<{
    title: string;
    type: string;
    confidence: number;
    urgency: 'low' | 'medium' | 'high';
    decision_id: string;
    message: string;
  }> {
    const recommendations: Array<{
      title: string;
      type: string;
      confidence: number;
      urgency: 'low' | 'medium' | 'high';
      decision_id: string;
      message: string;
    }> = [];

    for (const insight of insights) {
      const urgency = this.determineUrgency(insight);
      const title = this.generateTitle(insight);

      recommendations.push({
        title,
        type: 'decision_support',
        confidence: insight.confidence,
        urgency,
        decision_id: insight.decision_id,
        message: insight.message,
      });
    }

    return recommendations;
  }

  /**
   * Determine urgency from insight
   */
  private determineUrgency(insight: DecisionInsight): 'low' | 'medium' | 'high' {
    switch (insight.type) {
      case 'risk_warning':
        const riskLevel = insight.metadata?.risk_level || 0.5;
        if (riskLevel >= 0.8) return 'high';
        if (riskLevel >= 0.6) return 'medium';
        return 'medium';
      case 'consequence_prediction':
        return 'medium';
      case 'pattern_detected':
        return 'low';
      case 'similar_decision':
        return 'low';
      case 'decision_detected':
        return 'low';
      case 'recommendation':
        return 'medium';
      default:
        return 'medium';
    }
  }

  /**
   * Generate recommendation title
   */
  private generateTitle(insight: DecisionInsight): string {
    switch (insight.type) {
      case 'risk_warning':
        return 'Decision Risk Warning';
      case 'consequence_prediction':
        return 'Consequence Prediction';
      case 'pattern_detected':
        return 'Decision Pattern Detected';
      case 'similar_decision':
        return 'Similar Decision Found';
      case 'decision_detected':
        return 'Decision Outcome Mapped';
      case 'recommendation':
        return 'Decision Guidance';
      default:
        return 'Decision Insight';
    }
  }
}

