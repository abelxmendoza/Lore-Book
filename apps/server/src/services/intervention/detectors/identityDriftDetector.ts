import { Intervention, InterventionContext } from '../types';

/**
 * Detects identity drift
 */
export class IdentityDriftDetector {
  detect(ctx: InterventionContext): Intervention[] {
    const interventions: Intervention[] = [];

    try {
      const identityDrift = ctx.continuity?.identityDrift;
      
      if (identityDrift?.isDrifting) {
        const severity = identityDrift.severity || 
          (identityDrift.confidence > 0.8 ? 'high' : 
           identityDrift.confidence > 0.6 ? 'medium' : 'low');

        interventions.push({
          id: crypto.randomUUID(),
          type: 'identity_drift',
          severity: severity as any,
          confidence: identityDrift.confidence || 0.7,
          message: 'There\'s a significant shift in how you describe yourself over time. This could indicate growth, but may also signal confusion or loss of self.',
          timestamp: new Date().toISOString(),
          context: {
            drift_details: identityDrift,
            dimensions_changed: identityDrift.dimensionsChanged,
          },
        });
      }

      // Check for identity contradictions
      const identityContradictions = ctx.continuity?.identityContradictions || [];
      for (const contradiction of identityContradictions) {
        interventions.push({
          id: crypto.randomUUID(),
          type: 'identity_drift',
          severity: 'medium',
          confidence: 0.6,
          message: `You've expressed conflicting views about yourself: ${contradiction.description || 'identity contradiction detected'}.`,
          timestamp: new Date().toISOString(),
          context: {
            contradiction: contradiction,
          },
        });
      }
    } catch (error) {
      // Silently fail
    }

    return interventions;
  }
}

