import { logger } from '../../logger';
import type { MythMotif } from './mythTypes';

/**
 * Builds narrative summaries from themes and motifs
 */
export class MythNarrativeBuilder {
  /**
   * Build narrative summary
   */
  build(themes: string[], motifs: MythMotif[]): string {
    try {
      const motifList = motifs
        .map((m) => `• ${m.motifType} (${m.elements.length} event${m.elements.length !== 1 ? 's' : ''})`)
        .join('\n');

      const summary = `
This inner mythology reflects your internal story:

- Themes: ${themes.length > 0 ? themes.join(', ') : 'General life journey'}

- Motifs detected: ${motifs.length > 0 ? motifs.map((m) => m.motifType).join(', ') : 'None'}

You appear to be navigating a world shaped by:

${motifList || '• General life experiences'}

This mythology represents the archetypal patterns and symbolic meanings that emerge from your experiences, revealing the deeper narrative structure of your personal journey.
      `.trim();

      return summary;
    } catch (error) {
      logger.error({ error }, 'Error building narrative');
      return 'Inner mythology narrative could not be generated.';
    }
  }
}

