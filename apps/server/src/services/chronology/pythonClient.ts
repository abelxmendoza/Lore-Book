import { logger } from '../../logger';
import { spawnPython } from '../../utils/pythonBridge';
import type { Event, PythonAnalyticsResult } from './types';

/**
 * Client for Python analytics service
 */
export class PythonAnalyticsClient {
  /**
   * Run advanced analytics on events using Python service
   */
  async runAdvancedAnalytics(events: Event[]): Promise<PythonAnalyticsResult> {
    try {
      // Prepare events for Python (serialize to JSON-compatible format)
      const eventsPayload = events.map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        endTimestamp: e.endTimestamp,
        content: e.content,
        embedding: e.embedding,
        metadata: e.metadata || {},
      }));

      const result = await spawnPython('lorekeeper.chronology.analytics:analyze', {
        events: eventsPayload,
      });

      return result as PythonAnalyticsResult;
    } catch (error) {
      logger.warn({ error }, 'Python analytics failed, returning empty result');
      // Return empty result on failure
      return {
        clusters: { labels: [] },
        causality: { causal_links: [] },
        alignment: { alignment_score: 0.0 },
        patterns: [],
      };
    }
  }
}

