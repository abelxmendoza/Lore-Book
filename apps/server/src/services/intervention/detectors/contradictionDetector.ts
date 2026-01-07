import { Intervention, InterventionContext } from '../types';

/**
 * Detects narrative divergence in statements/actions
 * Observational only - does not judge truth or honesty
 */
export class ContradictionDetector {
  detect(ctx: InterventionContext): Intervention[] {
    const interventions: Intervention[] = [];

    try {
      const contradictions = ctx.continuity?.contradictions || [];
      
      for (const contradiction of contradictions) {
        // Determine severity based on narrative divergence type
        let severity: 'low' | 'medium' | 'high' = 'low';
        if (contradiction.type === 'action_contradiction' || contradiction.type === 'goal_contradiction') {
          severity = 'medium';
        } else if (contradiction.type === 'value_contradiction' || contradiction.type === 'identity_contradiction') {
          severity = 'high';
        }

        // Observational language - no accusations
        const earlierDescription = contradiction.description || contradiction.text || 'earlier entries';
        const message = `Your descriptions have varied over time. Earlier entries suggest: ${earlierDescription}. This appears as narrative divergence, not a judgment of truth.`;

        interventions.push({
          id: crypto.randomUUID(),
          type: 'contradiction',
          severity,
          confidence: contradiction.confidence || 0.6,
          message,
          timestamp: new Date().toISOString(),
          related_events: contradiction.relatedEventIds || contradiction.eventIds,
          context: {
            contradiction_type: contradiction.type,
            contradiction_details: contradiction,
            narrative_state: 'diverging', // Flag as narrative state, not truth state
          },
        });
      }
    } catch (error) {
      // Silently fail
    }

    return interventions;
  }
}

