import { logger } from '../logger';
import { conversationService } from '../services/conversationService';
import { memoryExtractionService } from '../services/memoryExtractionService';
import { supabaseAdmin } from '../services/supabaseClient';

/**
 * Background worker for processing memory extraction jobs
 * Processes unparsed conversation sessions in batches
 */
class MemoryExtractionWorker {
  private isRunning = false;
  private readonly BATCH_SIZE = 10;
  private readonly PROCESSING_INTERVAL_MS = 60000; // 1 minute

  /**
   * Start the background worker
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Memory extraction worker already running');
      return;
    }

    this.isRunning = true;
    logger.info('Memory extraction worker started');

    // Process immediately, then schedule periodic processing
    this.processBatch().catch(error => {
      logger.error({ error }, 'Error in initial memory extraction batch');
    });

    // Schedule periodic processing
    setInterval(() => {
      if (this.isRunning) {
        this.processBatch().catch(error => {
          logger.error({ error }, 'Error in scheduled memory extraction batch');
        });
      }
    }, this.PROCESSING_INTERVAL_MS);
  }

  /**
   * Stop the background worker
   */
  stop(): void {
    this.isRunning = false;
    logger.info('Memory extraction worker stopped');
  }

  /**
   * Process a batch of unprocessed sessions
   */
  async processBatch(): Promise<{
    processed: number;
    errors: number;
    skipped: number;
  }> {
    const stats = {
      processed: 0,
      errors: 0,
      skipped: 0,
    };

    try {
      // Find sessions that ended but haven't been processed
      // We'll use metadata.extractionStatus to track processing
      const { data: sessions, error } = await supabaseAdmin
        .from('conversation_sessions')
        .select('id, user_id, ended_at, metadata')
        .not('ended_at', 'is', null)
        .or('metadata->>extractionStatus.is.null,metadata->>extractionStatus.eq.pending')
        .order('ended_at', { ascending: true })
        .limit(this.BATCH_SIZE);

      if (error) {
        logger.error({ error }, 'Failed to fetch sessions for processing');
        return stats;
      }

      if (!sessions || sessions.length === 0) {
        logger.debug('No sessions to process');
        return stats;
      }

      logger.info({ count: sessions.length }, 'Processing memory extraction batch');

      // Process each session
      for (const session of sessions) {
        try {
          // Mark as processing
          await supabaseAdmin
            .from('conversation_sessions')
            .update({
              metadata: {
                ...(session.metadata as Record<string, unknown> || {}),
                extractionStatus: 'processing',
                extractionStartedAt: new Date().toISOString(),
              },
            })
            .eq('id', session.id);

          // Extract memory
          const result = await memoryExtractionService.extractMemory({
            sessionId: session.id,
            userId: session.user_id,
            immediate: false, // Background processing
          });

          // Mark as completed
          await supabaseAdmin
            .from('conversation_sessions')
            .update({
              metadata: {
                ...(session.metadata as Record<string, unknown> || {}),
                extractionStatus: 'completed',
                extractionCompletedAt: new Date().toISOString(),
                extractionConfidence: result.extractionConfidence,
                journalEntryId: result.journalEntry.id,
                componentCount: result.components.length,
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
            },
            'Successfully extracted memory from session'
          );
        } catch (error) {
          stats.errors++;
          logger.error({ error, sessionId: session.id }, 'Failed to extract memory from session');

          // Mark as failed
          try {
            await supabaseAdmin
              .from('conversation_sessions')
              .update({
                metadata: {
                  ...(session.metadata as Record<string, unknown> || {}),
                  extractionStatus: 'failed',
                  extractionError: error instanceof Error ? error.message : 'Unknown error',
                  extractionFailedAt: new Date().toISOString(),
                },
              })
              .eq('id', session.id);
          } catch (updateError) {
            logger.error({ error: updateError }, 'Failed to update session error status');
          }
        }
      }
    } catch (error) {
      logger.error({ error }, 'Error in memory extraction batch processing');
    }

    logger.info(stats, 'Memory extraction batch completed');
    return stats;
  }

  /**
   * Process a specific session immediately
   */
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

  /**
   * Queue a session for processing
   */
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

