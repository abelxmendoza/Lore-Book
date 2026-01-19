import { randomUUID } from 'crypto';

import { logger } from '../../logger';

import type { ParacosmElement, ParacosmCluster } from './paracosmTypes';

/**
 * Clusters paracosm elements and extracts themes
 */
export class ParacosmScoring {
  /**
   * Cluster elements by category and similarity
   */
  cluster(elements: ParacosmElement[]): ParacosmCluster[] {
    try {
      // Group by category
      const groups = new Map<string, ParacosmElement[]>();

      for (const element of elements) {
        if (!groups.has(element.category)) {
          groups.set(element.category, []);
        }
        groups.get(element.category)!.push(element);
      }

      // Create clusters
      const clusters: ParacosmCluster[] = [];

      for (const [category, categoryElements] of groups.entries()) {
        if (categoryElements.length === 0) continue;

        clusters.push({
          id: randomUUID(),
          label: this.formatLabel(category),
          elements: categoryElements,
          themes: this.extractThemes(categoryElements),
        });
      }

      logger.debug({ count: clusters.length }, 'Created paracosm clusters');
      return clusters;
    } catch (error) {
      logger.error({ error }, 'Error clustering paracosm elements');
      return [];
    }
  }

  /**
   * Extract themes from elements
   */
  private extractThemes(elements: ParacosmElement[]): string[] {
    const themes: string[] = [];
    const combined = elements.map((e) => e.text).join(' ').toLowerCase();

    // Theme detection patterns
    if (/future|destiny|tomorrow|ahead|coming/i.test(combined)) {
      themes.push('future');
    }
    if (/fear|threat|danger|worried|anxious|afraid/i.test(combined)) {
      themes.push('fear');
    }
    if (/love|crush|romantic|relationship|dating/i.test(combined)) {
      themes.push('romantic');
    }
    if (/fight|battle|conflict|war|combat/i.test(combined)) {
      themes.push('conflict');
    }
    if (/fantasy|fiction|magic|supernatural|unreal/i.test(combined)) {
      themes.push('fantasy');
    }
    if (/success|achievement|victory|win|triumph/i.test(combined)) {
      themes.push('success');
    }
    if (/escape|freedom|liberation|break free/i.test(combined)) {
      themes.push('escape');
    }
    if (/power|control|dominance|strength/i.test(combined)) {
      themes.push('power');
    }
    if (/connection|friendship|belonging|community/i.test(combined)) {
      themes.push('connection');
    }
    if (/identity|self|who i am|becoming/i.test(combined)) {
      themes.push('identity');
    }

    return themes.length > 0 ? themes : ['general'];
  }

  /**
   * Format category label for display
   */
  private formatLabel(category: string): string {
    return category
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

