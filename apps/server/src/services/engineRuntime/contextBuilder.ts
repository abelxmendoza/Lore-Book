import { logger } from '../../logger';
import { memoryService } from '../memoryService';
import type { MemoryEntry } from '../../types';

export interface EngineContext {
  entries: MemoryEntry[];
  relationships?: any[];
  goals?: any[];
  habits?: any[];
  now: Date;
}

/**
 * Builds shared context for all engines
 * Loads everything engines need using one shared call
 */
export async function buildEngineContext(userId: string): Promise<EngineContext> {
  try {
    // Fetch journal entries
    const entries = await memoryService.searchEntries(userId, {
      limit: 10000, // Get a large sample for comprehensive analysis
    });

    // TODO: Add relationships, goals, habits when those services are available
    // const relationships = await relationshipService.getRelationships(userId);
    // const goals = await goalService.getGoals(userId);
    // const habits = await habitService.getHabits(userId);

    return {
      entries,
      relationships: [],
      goals: [],
      habits: [],
      now: new Date(),
    };
  } catch (error) {
    logger.error({ error, userId }, 'Failed to build engine context');
    throw error;
  }
}

