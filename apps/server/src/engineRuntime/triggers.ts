import { logger } from '../logger';

import { EngineOrchestrator } from './orchestrator';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000; // 5 seconds

/**
 * Retry helper with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  delayMs: number = RETRY_DELAY_MS
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        const backoffDelay = delayMs * Math.pow(2, attempt - 1); // Exponential backoff
        logger.warn(
          { attempt, maxRetries, backoffDelay, error: lastError },
          'Engine trigger failed, retrying'
        );
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Engine Triggers
 * Runs when new journal entries are saved
 * Includes retry logic for reliability
 */
export async function onNewEntry(userId: string, entryId: string): Promise<void> {
  try {
    logger.debug({ userId, entryId }, 'Triggering engine processing for new entry');

    const orchestrator = new EngineOrchestrator();

    // Fire off engine processing asynchronously (don't block)
    // Use save=true to cache results for chat system
    // Include retry logic for reliability
    retryWithBackoff(
      () => orchestrator.runAll(userId, true),
      MAX_RETRIES,
      RETRY_DELAY_MS
    )
      .then(() => {
        logger.debug({ userId, entryId }, 'Engine processing completed successfully');
      })
      .catch((err) => {
        logger.error(
          { error: err, userId, entryId, retries: MAX_RETRIES },
          'Engine runtime error after all retries'
        );
        // Don't throw - this is fire-and-forget
      });

    logger.debug({ userId, entryId }, 'Engine processing triggered');
  } catch (error) {
    logger.error({ error, userId, entryId }, 'Error triggering engine processing');
    // Don't throw - this is fire-and-forget
  }
}

