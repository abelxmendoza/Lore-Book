/**
 * MEMORY PIPELINE RECOVERY — Backfill Script
 *
 * Resets all conversation_sessions with extractionStatus='failed' back to
 * pending so the memoryExtractionWorker picks them up on the next cycle.
 *
 * Safe to run multiple times — only touches sessions in 'failed' state.
 * Does NOT delete any data.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/scripts/backfillFailedSessions.ts
 */

import { supabaseAdmin } from '../services/supabaseClient';
import { logger } from '../logger';

async function backfillFailedSessions(): Promise<void> {
  logger.info('Starting failed session backfill...');

  // 1. Audit current state
  const { data: statRows, error: statError } = await supabaseAdmin
    .from('conversation_sessions')
    .select('id, metadata')
    .eq('metadata->>extractionStatus', 'failed');

  if (statError) {
    logger.error({ error: statError }, 'Failed to query sessions');
    process.exit(1);
  }

  const failedSessions = statRows ?? [];
  logger.info({ count: failedSessions.length }, 'Found failed sessions to reset');

  if (failedSessions.length === 0) {
    logger.info('Nothing to backfill.');
    return;
  }

  // 2. Reset each session: clear status + attempts, preserve all other metadata
  let resetCount = 0;
  let errorCount = 0;

  for (const session of failedSessions) {
    const meta = (session.metadata as Record<string, unknown>) ?? {};
    const {
      extractionStatus: _s,
      extractionError: _e,
      extractionFailedAt: _f,
      extractionAttempts: _a,
      extractionStartedAt: _st,
      ...preservedMeta
    } = meta;

    const { error: updateError } = await supabaseAdmin
      .from('conversation_sessions')
      .update({
        metadata: {
          ...preservedMeta,
          extractionStatus: 'pending',
          extractionAttempts: 0,
          extractionQueuedAt: new Date().toISOString(),
          backfilledAt: new Date().toISOString(),
        },
      })
      .eq('id', session.id);

    if (updateError) {
      logger.error({ error: updateError, sessionId: session.id }, 'Failed to reset session');
      errorCount++;
    } else {
      resetCount++;
    }
  }

  logger.info({ resetCount, errorCount }, 'Backfill complete');

  // 3. Verify
  const { count: stillFailed } = await supabaseAdmin
    .from('conversation_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('metadata->>extractionStatus', 'failed');

  const { count: nowPending } = await supabaseAdmin
    .from('conversation_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('metadata->>extractionStatus', 'pending');

  logger.info(
    { stillFailed: stillFailed ?? 0, nowPending: nowPending ?? 0 },
    'Post-backfill state'
  );

  if ((stillFailed ?? 0) > 0) {
    logger.warn('Some sessions still in failed state — check logs above for errors');
    process.exit(1);
  }

  logger.info('All failed sessions reset to pending. Worker will process them on next cycle.');
}

backfillFailedSessions().catch((err) => {
  logger.error({ err }, 'Backfill script crashed');
  process.exit(1);
});
