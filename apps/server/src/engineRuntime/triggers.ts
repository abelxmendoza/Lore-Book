import { logger } from '../logger';
import { EngineOrchestrator } from './orchestrator';

/**
 * Engine Triggers
 * Runs when new journal entries are saved
 */
export async function onNewEntry(userId: string, entryId: string): Promise<void> {
  try {
    logger.debug({ userId, entryId }, 'Triggering engine processing for new entry');

    const orchestrator = new EngineOrchestrator();

    // Fire off engine processing asynchronously (don't block)
    orchestrator.runAll(userId).catch((err) => {
      logger.error({ error: err, userId, entryId }, 'Engine runtime error');
    });

    logger.debug({ userId, entryId }, 'Engine processing triggered');
  } catch (error) {
    logger.error({ error, userId, entryId }, 'Error triggering engine processing');
  }
}

