import type { Recommendation } from '../recommendation/types';

import type { Intervention } from './types';

/**
 * Bridges interventions to recommendations
 * Converts interventions into actionable recommendations
 */
export class RecommenderBridge {
  /**
   * Convert intervention to recommendation format
   */
  async toRecommendations(
    intervention: Intervention,
    userId: string
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    // Map intervention severity to recommendation priority
    const severityToPriority: Record<string, number> = {
      critical: 10,
      high: 8,
      medium: 6,
      low: 4,
    };

    // Map intervention type to recommendation type
    const typeMapping: Record<string, string> = {
      mood_spiral: 'reflection_question',
      negative_pattern: 'action',
      identity_drift: 'reflection_question',
      relationship_drift: 'relationship_checkin',
      abandoned_goal: 'goal_reminder',
      contradiction: 'continuity_followup',
      risk_event: 'action',
      contextual_warning: 'reflection_question',
    };

    const recommendationType = typeMapping[intervention.type] || 'reflection_question';

    recommendations.push({
      user_id: userId,
      type: recommendationType as any,
      title: this.generateTitle(intervention),
      description: intervention.message,
      context: {
        intervention_id: intervention.id,
        intervention_type: intervention.type,
        severity: intervention.severity,
      },
      priority: severityToPriority[intervention.severity] || 5,
      confidence: intervention.confidence,
      source_engine: 'intervention',
      source_data: {
        intervention: intervention,
      },
      status: 'pending',
      expires_at: this.calculateExpiration(intervention),
    });

    return recommendations;
  }

  /**
   * Generate recommendation title from intervention
   */
  private generateTitle(intervention: Intervention): string {
    const titles: Record<string, string> = {
      mood_spiral: 'Address Declining Mood',
      negative_pattern: 'Break Negative Pattern',
      identity_drift: 'Reflect on Identity Changes',
      relationship_drift: 'Check In on Relationship',
      abandoned_goal: 'Revisit Abandoned Goal',
      contradiction: 'Resolve Contradiction',
      risk_event: 'Address Risk Event',
      contextual_warning: 'Review Warning',
    };

    return titles[intervention.type] || 'Intervention Required';
  }

  /**
   * Calculate expiration date based on severity
   */
  private calculateExpiration(intervention: Intervention): string {
    const now = new Date();
    const daysToExpire: Record<string, number> = {
      critical: 1, // Critical interventions expire in 1 day
      high: 3,
      medium: 7,
      low: 14,
    };

    const days = daysToExpire[intervention.severity] || 7;
    now.setDate(now.getDate() + days);
    return now.toISOString();
  }

  /**
   * Convert multiple interventions to recommendations
   */
  async toRecommendationsBatch(
    interventions: Intervention[],
    userId: string
  ): Promise<Recommendation[]> {
    const allRecommendations: Recommendation[] = [];

    for (const intervention of interventions) {
      const recommendations = await this.toRecommendations(intervention, userId);
      allRecommendations.push(...recommendations);
    }

    return allRecommendations;
  }
}

