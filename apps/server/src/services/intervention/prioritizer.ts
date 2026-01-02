import { Intervention } from './types';

/**
 * Prioritizes interventions by severity and confidence
 */
export class InterventionPrioritizer {
  /**
   * Sort interventions by priority (severity first, then confidence)
   */
  prioritize(interventions: Intervention[]): Intervention[] {
    const severityOrder: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    return interventions.sort((a, b) => {
      // First sort by severity
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) {
        return severityDiff;
      }

      // Then by confidence (higher confidence = higher priority)
      return b.confidence - a.confidence;
    });
  }

  /**
   * Filter interventions by minimum severity
   */
  filterBySeverity(
    interventions: Intervention[],
    minSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low'
  ): Intervention[] {
    const severityOrder: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    const minOrder = severityOrder[minSeverity];
    return interventions.filter(
      i => severityOrder[i.severity] >= minOrder
    );
  }

  /**
   * Get top N interventions
   */
  getTopN(interventions: Intervention[], n: number): Intervention[] {
    const prioritized = this.prioritize(interventions);
    return prioritized.slice(0, n);
  }
}

