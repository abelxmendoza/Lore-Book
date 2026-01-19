import { logger } from '../../logger';

import { NarrativeBuilder } from './narrativeBuilder';
import { NarrativeStorage } from './narrativeStorage';
import type { Narrative, NarrativeType, NarrativeStyle, NarrativeQuery } from './types';

/**
 * Main Narrative Engine
 * Builds coherent narratives from memories
 */
export class NarrativeEngine {
  private builder: NarrativeBuilder;
  private storage: NarrativeStorage;

  constructor() {
    this.builder = new NarrativeBuilder();
    this.storage = new NarrativeStorage();
  }

  /**
   * Build and save narrative
   */
  async buildNarrative(
    userId: string,
    entryIds: string[],
    type: NarrativeType = 'chronological',
    style: NarrativeStyle = 'reflective',
    save: boolean = true
  ): Promise<Narrative | null> {
    try {
      logger.debug({ userId, entryIds: entryIds.length, type, style }, 'Building narrative');

      // Build narrative
      const narrative = await this.builder.buildNarrative(
        userId,
        entryIds,
        type,
        style
      );

      if (!narrative) {
        return null;
      }

      // Save if requested
      if (save) {
        const saved = await this.storage.saveNarrative(narrative);
        if (saved) {
          return saved;
        }
      }

      return narrative;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to build narrative');
      return null;
    }
  }

  /**
   * Get narrative by ID
   */
  async getNarrative(narrativeId: string, userId: string): Promise<Narrative | null> {
    return this.storage.getNarrative(narrativeId, userId);
  }

  /**
   * Query narratives
   */
  async queryNarratives(userId: string, query: NarrativeQuery): Promise<Narrative[]> {
    return this.storage.queryNarratives(userId, query);
  }

  /**
   * Update narrative status
   */
  async updateStatus(
    narrativeId: string,
    status: 'draft' | 'complete' | 'archived'
  ): Promise<boolean> {
    return this.storage.updateStatus(narrativeId, status);
  }

  /**
   * Get narrative statistics
   */
  async getStats(userId: string) {
    return this.storage.getStats(userId);
  }
}

