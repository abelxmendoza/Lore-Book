import { logger } from '../../logger';

import type { IdentityDimension, IdentityConflict, IdentityStability, IdentityProjection } from './identityTypes';

/**
 * Builds identity summary
 */
export class IdentitySummary {
  /**
   * Build summary from dimensions, conflicts, stability, and projection
   */
  build(
    dimensions: IdentityDimension[],
    conflicts: IdentityConflict[],
    stability: IdentityStability,
    projection: IdentityProjection
  ): string {
    try {
      const dimensionList =
        dimensions.length > 0
          ? dimensions.map((d) => `• ${d.name} (score: ${d.score.toFixed(2)})`).join('\n')
          : '• No dominant dimensions detected';

      const conflictList =
        conflicts.length > 0
          ? conflicts.map((c) => `• ${c.conflictName}`).join('\n')
          : '• No major conflicts detected';

      const anchorList =
        stability.anchors.length > 0
          ? stability.anchors.map((a) => `• ${a.substring(0, 100)}${a.length > 100 ? '...' : ''}`).join('\n')
          : '• No stable anchors identified';

      const trajectory =
        projection.trajectory.length > 0
          ? projection.trajectory.join(' → ')
          : 'Unknown';

      const summary = `
Your identity is shaped by these dominant dimensions:

${dimensionList}

Internal Conflicts:

${conflictList}

Stability Anchors:

${anchorList}

Predicted Identity Trajectory:

→ ${trajectory}

Leading to: ${projection.predictedIdentity}

This identity core represents the essence of who you are, based on patterns detected across your journal entries. The dimensions reflect your dominant traits, conflicts reveal internal tensions, anchors show your stable foundations, and the trajectory suggests where your identity is heading.
      `.trim();

      return summary;
    } catch (error) {
      logger.error({ error }, 'Error building identity summary');
      return 'Identity summary could not be generated.';
    }
  }
}

