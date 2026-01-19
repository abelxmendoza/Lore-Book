import { logger } from '../../logger';
import { spawnPython } from '../../utils/pythonBridge';

import type { Intervention } from './types';

/**
 * Python client for deep intervention analysis
 */
export class PythonInterventionClient {
  /**
   * Run deep analysis using Python analytics
   */
  async runDeepAnalysis(events: any[]): Promise<Intervention[]> {
    try {
      if (!events || events.length === 0) {
        return [];
      }

      // Use existing Python bridge
      const result = await spawnPython('intervention.analytics:analyze', {
        events: events.map(e => ({
          id: e.id,
          timestamp: e.date || e.timestamp,
          content: e.content,
          embedding: e.embedding || [],
        })),
      });

      // Convert Python results to Intervention format
      const interventions: Intervention[] = [];

      if (result?.interventions && Array.isArray(result.interventions)) {
        for (const pyIntervention of result.interventions) {
          interventions.push({
            id: crypto.randomUUID(),
            type: this.mapPythonType(pyIntervention.type),
            severity: this.mapPythonSeverity(pyIntervention.severity),
            confidence: pyIntervention.confidence || 0.7,
            message: pyIntervention.message || pyIntervention.description || 'Pattern detected',
            timestamp: new Date().toISOString(),
            context: {
              python_analysis: pyIntervention,
            },
          });
        }
      }

      logger.debug(
        { interventions: interventions.length },
        'Python intervention analysis complete'
      );

      return interventions;
    } catch (error) {
      logger.error({ error }, 'Failed to run Python intervention analysis');
      // Return empty array on error - don't break intervention processing
      return [];
    }
  }

  /**
   * Map Python intervention type to TypeScript type
   */
  private mapPythonType(pythonType: string): Intervention['type'] {
    const typeMap: Record<string, Intervention['type']> = {
      mood_spiral: 'mood_spiral',
      negative_pattern: 'negative_pattern',
      identity_drift: 'identity_drift',
      relationship_drift: 'relationship_drift',
      abandoned_goal: 'abandoned_goal',
      contradiction: 'contradiction',
      risk_event: 'risk_event',
      contextual_warning: 'contextual_warning',
    };

    return typeMap[pythonType] || 'contextual_warning';
  }

  /**
   * Map Python severity to TypeScript severity
   */
  private mapPythonSeverity(pythonSeverity: string): Intervention['severity'] {
    const severityMap: Record<string, Intervention['severity']> = {
      critical: 'critical',
      high: 'high',
      medium: 'medium',
      low: 'low',
    };

    return severityMap[pythonSeverity] || 'medium';
  }
}

