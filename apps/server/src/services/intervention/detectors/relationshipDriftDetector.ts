import { Intervention, InterventionContext } from '../types';

/**
 * Detects relationship drift
 */
export class RelationshipDriftDetector {
  detect(ctx: InterventionContext): Intervention[] {
    const interventions: Intervention[] = [];

    try {
      // Check relationship dynamics
      const relationshipDynamics = ctx.relationshipDynamics;
      
      if (Array.isArray(relationshipDynamics)) {
        for (const rel of relationshipDynamics) {
          // Check for declining health
          if (rel.health?.overall_health === 'poor' || rel.health?.overall_health === 'critical') {
            const severity = rel.health.overall_health === 'critical' ? 'critical' : 'high';
            
            interventions.push({
              id: crypto.randomUUID(),
              type: 'relationship_drift',
              severity: severity as any,
              confidence: rel.health.confidence_score || 0.7,
              message: `Your relationship with ${rel.person_name} appears to be in ${rel.health.overall_health} health. ${rel.health.concerns?.join(' ') || 'Consider addressing this.'}`,
              timestamp: new Date().toISOString(),
              context: {
                person_name: rel.person_name,
                health_score: rel.health.health_score,
                concerns: rel.health.concerns,
              },
            });
          }

          // Check for declining stage
          if (rel.lifecycle?.current_stage === 'declining' || rel.lifecycle?.current_stage === 'distant') {
            interventions.push({
              id: crypto.randomUUID(),
              type: 'relationship_drift',
              severity: 'medium',
              confidence: rel.lifecycle.stage_confidence || 0.7,
              message: `Your relationship with ${rel.person_name} seems to be ${rel.lifecycle.current_stage}. Last interaction was ${rel.metrics?.last_interaction_days_ago || 'unknown'} days ago.`,
              timestamp: new Date().toISOString(),
              context: {
                person_name: rel.person_name,
                current_stage: rel.lifecycle.current_stage,
                last_interaction_days: rel.metrics?.last_interaction_days_ago,
              },
            });
          }
        }
      }

      // Check relationship analytics for drifting relationships
      const drifting = ctx.relationshipAnalytics?.drifting || [];
      for (const rel of drifting) {
        interventions.push({
          id: crypto.randomUUID(),
          type: 'relationship_drift',
          severity: (rel.severity || 'medium') as any,
          confidence: rel.confidence || 0.6,
          message: `Your relationship with ${rel.person || rel.name} seems to be drifting.`,
          timestamp: new Date().toISOString(),
          context: {
            person: rel.person || rel.name,
            drift_details: rel,
          },
        });
      }
    } catch (error) {
      // Silently fail
    }

    return interventions;
  }
}

