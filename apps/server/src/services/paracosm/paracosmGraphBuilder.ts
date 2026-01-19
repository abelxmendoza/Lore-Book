import { logger } from '../../logger';

import type { ParacosmElement } from './paracosmTypes';

/**
 * Builds graph nodes from paracosm elements
 */
export class ParacosmGraphBuilder {
  /**
   * Build graph nodes from elements
   */
  buildGraph(elements: ParacosmElement[]): Array<{
    id: string;
    node_type: string;
    label: string;
    embedding_text: string;
  }> {
    try {
      return elements.map((e) => ({
        id: e.id || '',
        node_type: 'paracosm',
        label: e.category,
        embedding_text: e.text,
      }));
    } catch (error) {
      logger.error({ error }, 'Error building paracosm graph');
      return [];
    }
  }
}

