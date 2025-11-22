import { Intervention, InterventionContext } from '../types';

/**
 * Detects negative behavioral loops
 */
export class NegativeLoopDetector {
  detect(ctx: InterventionContext): Intervention[] {
    const interventions: Intervention[] = [];

    try {
      // Check insight engine for negative loops
      const negativeLoops = ctx.insightEngine?.negativeLoops || 
                           ctx.insightEngine?.behavioralLoops?.filter((l: any) => l.type === 'negative') || [];

      for (const loop of negativeLoops) {
        const severity = loop.severity || 
          (loop.frequency > 5 ? 'high' : loop.frequency > 3 ? 'medium' : 'low');

        interventions.push({
          id: crypto.randomUUID(),
          type: 'negative_pattern',
          severity: severity as any,
          confidence: loop.confidence || 0.85,
          message: `A negative behavioral loop detected: ${loop.pattern || loop.description || 'recurring negative pattern'}. This pattern has appeared ${loop.frequency || loop.count || 'multiple'} times.`,
          timestamp: new Date().toISOString(),
          related_events: loop.relatedEventIds || loop.eventIds,
          context: {
            loop_pattern: loop.pattern || loop.description,
            frequency: loop.frequency || loop.count,
            loop_details: loop,
          },
        });
      }

      // Check shadow engine for suppressed patterns
      const shadowPatterns = ctx.shadowEngine?.suppressedPatterns || [];
      for (const pattern of shadowPatterns) {
        if (pattern.severity === 'high' || pattern.frequency > 3) {
          interventions.push({
            id: crypto.randomUUID(),
            type: 'negative_pattern',
            severity: 'high',
            confidence: pattern.confidence || 0.7,
            message: `A suppressed or shadow pattern detected: ${pattern.description || pattern.pattern}. This may need attention.`,
            timestamp: new Date().toISOString(),
            context: {
              pattern: pattern,
            },
          });
        }
      }
    } catch (error) {
      // Silently fail
    }

    return interventions;
  }
}

