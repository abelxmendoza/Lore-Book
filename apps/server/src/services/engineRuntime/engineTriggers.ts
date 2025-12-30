import { logger } from '../../logger';
import { EngineOrchestrator } from './engineOrchestrator';

/**
 * Engine Triggers
 * Runs when new journal entries are saved
 */
export async function onNewEntry(userId: string, entryId: string): Promise<void> {
  logger.debug({ userId, entryId }, 'Triggering engines on new entry');

  const orchestrator = new EngineOrchestrator();

  // Fire off engine processing asynchronously (don't block entry save)
  orchestrator
    .runAll(userId, true)
    .then(() => {
      logger.debug({ userId, entryId }, 'Engines completed after new entry');
    })
    .catch((err) => {
      logger.error({ error: err, userId, entryId }, 'Engine runtime error after new entry');
    });
}

