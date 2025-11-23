import { logger } from '../../logger';
import type { RawSceneSignal } from './types';

/**
 * Extracts raw scene signals from journal entries
 */
export class SceneExtractor {
  /**
   * Detect scene signals from entries
   * For V1, we treat each entry as a potential scene
   */
  detect(entries: any[]): RawSceneSignal[] {
    const signals: RawSceneSignal[] = [];

    try {
      for (const entry of entries) {
        if (!entry.text || !entry.id || !entry.timestamp) continue;

        // Filter out very short entries (likely not scenes)
        if (entry.text.trim().length < 50) continue;

        signals.push({
          memoryId: entry.id,
          text: entry.text,
          timestamp: entry.timestamp,
        });
      }

      logger.debug({ count: signals.length }, 'Extracted scene signals');
    } catch (error) {
      logger.error({ error }, 'Error extracting scene signals');
    }

    return signals;
  }
}

