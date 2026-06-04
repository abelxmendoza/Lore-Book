import { logger } from '../logger';
import { memoryExtractionService, NotMemoryWorthyError } from '../services/memoryExtractionService';
import { supabaseAdmin } from '../services/supabaseClient';

// Maximum extraction attempts before a session is abandoned.
const MAX_ATTEMPTS = 3;

/**
 * Extraction state machine:
 *   null / pending  → ready for first attempt
 *   processing      → currently being worked on
 *   completed       → journal entry written successfully
 *   skipped         → content not memory-worthy; re-evaluated after 24 h
 *   failed          → real error; retried up to MAX_ATTEMPTS times
 *   abandoned       → failed MAX_ATTEMPTS times; human review needed
 */
class MemoryExtractionWorker {
  private isRunning = false;
  private readonly BATCH_SIZE = 10;
  private readonly PROCESSING_INTERVAL_MS = 60000; // 1 minute

  start(): void {
    if (this.isRunning) {
      logger.warn('Memory extraction worker already running');
      return;
    }

    this.isRunning = true;
    logger.info('Memory extraction worker started');

    this.processBatch().catch(error => {
      logger.error({ error }, 'Error in initial memory extraction batch');
    });

    setInterval(() => {
      if (this.isRunning) {
        this.processBatch().catch(error => {
          logger.error({ error }, 'Error in scheduled memory extraction batch');
        });
      }
    }, this.PROCESSING_INTERVAL_MS);
  }

  stop(): void {
    this.isRunning = false;
    logger.info('Memory extraction worker stopped');
  }

  async processBatch(): Promise<{ processed: number; errors: number; skipped: number }> {
    const stats = { processed: 0, errors: 0, skipped: 0 };

    try {
      const staleThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const skipReevalThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Sessions eligible for processing:
      //   • Never attempted (status null or 'pending')
      //   • Failed with attempts remaining (status 'failed', attempts < MAX_ATTEMPTS)
      //   • Skipped more than 24h ago (re-evaluate in case more messages arrived)
      // Restricted to sessions that are ended or stale (> 30 min old).
      const { data: sessions, error } = await supabaseAdmin
        .from('conversation_sessions')
        .select('id, user_id, ended_at, metadata')
        .or(`ended_at.not.is.null,created_at.lt.${staleThreshold}`)
        .or([
          'metadata->>extractionStatus.is.null',
          'metadata->>extractionStatus.eq.pending',
          `and(metadata->>extractionStatus.eq.failed,metadata->>extractionAttempts.lt.${MAX_ATTEMPTS})`,
          `metadata->>extractionStatus.eq.failed`, // also catch sessions without attempts counter
          `and(metadata->>extractionStatus.eq.skipped,metadata->>extractionSkippedAt.lt.${skipReevalThreshold})`,
        ].join(','))
        .order('created_at', { ascending: true })
        .limit(this.BATCH_SIZE);

      if (error) {
        const err = error as { message?: string; details?: string; code?: string };
        if (
          err.message?.includes('fetch failed') ||
          err.details?.includes('ENOTFOUND') ||
          err.message?.includes('ECONNREFUSED')
        ) {
          logger.debug({ hint: 'Supabase unreachable. Worker will retry on next interval.' }, 'Skipping session fetch');
        } else if (err.code === 'PGRST205' || err.message?.includes('Could not find the table')) {
          logger.debug({ hint: 'conversation_sessions table not found. Run migrations.' }, 'Skipping session fetch');
        } else {
          logger.error({ error }, 'Failed to fetch sessions for processing');
        }
        return stats;
      }

      if (!sessions || sessions.length === 0) {
        logger.debug('No sessions to process');
        return stats;
      }

      logger.info({ count: sessions.length }, 'Processing memory extraction batch');

      for (const session of sessions) {
        const meta = (session.metadata as Record<string, unknown>) || {};
        const attempts = (meta.extractionAttempts as number) ?? 0;

        // Abandon sessions that have already exceeded the attempt budget.
        if (attempts >= MAX_ATTEMPTS && meta.extractionStatus === 'failed') {
          await supabaseAdmin
            .from('conversation_sessions')
            .update({
              metadata: {
                ...meta,
                extractionStatus: 'abandoned',
                extractionAbandonedAt: new Date().toISOString(),
              },
            })
            .eq('id', session.id);
          logger.warn({ sessionId: session.id, attempts }, 'Session abandoned after max extraction attempts');
          stats.errors++;
          continue;
        }

        try {
          // Mark as processing
          await supabaseAdmin
            .from('conversation_sessions')
            .update({
              metadata: {
                ...meta,
                extractionStatus: 'processing',
                extractionStartedAt: new Date().toISOString(),
                extractionAttempts: attempts + 1,
              },
            })
            .eq('id', session.id);

          const result = await memoryExtractionService.extractMemory({
            sessionId: session.id,
            userId: session.user_id,
            immediate: false,
          });

          await supabaseAdmin
            .from('conversation_sessions')
            .update({
              metadata: {
                ...meta,
                extractionStatus: 'completed',
                extractionCompletedAt: new Date().toISOString(),
                extractionConfidence: result.extractionConfidence,
                journalEntryId: result.journalEntry.id,
                componentCount: result.components.length,
                extractionAttempts: attempts + 1,
              },
            })
            .eq('id', session.id);

          stats.processed++;
          logger.info(
            {
              sessionId: session.id,
              userId: session.user_id,
              entryId: result.journalEntry.id,
              componentCount: result.components.length,
              attempt: attempts + 1,
            },
            'Successfully extracted memory from session'
          );
        } catch (error) {
          if (error instanceof NotMemoryWorthyError) {
            // Content is thin but not broken — mark skipped, re-evaluate after 24h.
            stats.skipped++;
            logger.info({ sessionId: session.id, reason: error.message }, 'Session skipped (not memory-worthy)');
            try {
              await supabaseAdmin
                .from('conversation_sessions')
                .update({
                  metadata: {
                    ...meta,
                    extractionStatus: 'skipped',
                    extractionSkipReason: error.message,
                    extractionSkippedAt: new Date().toISOString(),
                    extractionAttempts: attempts + 1,
                  },
                })
                .eq('id', session.id);
            } catch (updateError) {
              logger.error({ error: updateError }, 'Failed to mark session as skipped');
            }
          } else {
            // Real error — increment failure counter, abandon if over budget.
            stats.errors++;
            const newAttempts = attempts + 1;
            const nextStatus = newAttempts >= MAX_ATTEMPTS ? 'abandoned' : 'failed';
            logger.error({ error, sessionId: session.id, attempt: newAttempts, nextStatus }, 'Failed to extract memory from session');
            try {
              await supabaseAdmin
                .from('conversation_sessions')
                .update({
                  metadata: {
                    ...meta,
                    extractionStatus: nextStatus,
                    extractionError: error instanceof Error ? error.message : 'Unknown error',
                    extractionFailedAt: new Date().toISOString(),
                    extractionAttempts: newAttempts,
                  },
                })
                .eq('id', session.id);
            } catch (updateError) {
              logger.error({ error: updateError }, 'Failed to update session error status');
            }
          }
        }
      }
    } catch (error) {
      logger.error({ error }, 'Error in memory extraction batch processing');
    }

    logger.info(stats, 'Memory extraction batch completed');
    return stats;
  }

  async processSession(sessionId: string, userId: string): Promise<void> {
    try {
      await memoryExtractionService.extractMemory({
        sessionId,
        userId,
        immediate: true,
      });
      logger.info({ sessionId, userId }, 'Successfully processed session');
    } catch (error) {
      logger.error({ error, sessionId, userId }, 'Failed to process session');
      throw error;
    }
  }

  async queueSession(sessionId: string): Promise<void> {
    try {
      const { data: session } = await supabaseAdmin
        .from('conversation_sessions')
        .select('metadata')
        .eq('id', sessionId)
        .single();

      if (!session) {
        throw new Error('Session not found');
      }

      await supabaseAdmin
        .from('conversation_sessions')
        .update({
          metadata: {
            ...(session.metadata as Record<string, unknown> || {}),
            extractionStatus: 'pending',
            extractionAttempts: 0,
            extractionQueuedAt: new Date().toISOString(),
          },
        })
        .eq('id', sessionId);

      logger.info({ sessionId }, 'Session queued for memory extraction');
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to queue session');
      throw error;
    }
  }
}

export const memoryExtractionWorker = new MemoryExtractionWorker();
