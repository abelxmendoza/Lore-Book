import { Intervention, InterventionContext } from '../types';

/**
 * Detects contradictions in statements/actions
 */
export class ContradictionDetector {
  detect(ctx: InterventionContext): Intervention[] {
    const interventions: Intervention[] = [];

    try {
      const contradictions = ctx.continuity?.contradictions || [];
      
      for (const contradiction of contradictions) {
        // Determine severity based on contradiction type
        let severity: 'low' | 'medium' | 'high' = 'low';
        if (contradiction.type === 'action_contradiction' || contradiction.type === 'goal_contradiction') {
          severity = 'medium';
        } else if (contradiction.type === 'value_contradiction' || contradiction.type === 'identity_contradiction') {
          severity = 'high';
        }

        interventions.push({
          id: crypto.randomUUID(),
          type: 'contradiction',
          severity,
          confidence: contradiction.confidence || 0.6,
          message: `You contradicted a previous statement: ${contradiction.description || contradiction.text || 'contradiction detected'}.`,
          timestamp: new Date().toISOString(),
          related_events: contradiction.relatedEventIds || contradiction.eventIds,
          context: {
            contradiction_type: contradiction.type,
            contradiction_details: contradiction,
          },
        });
      }
    } catch (error) {
      // Silently fail
    }

    return interventions;
  }
}

