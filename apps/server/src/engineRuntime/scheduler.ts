import * as cron from 'node-cron';
import PQueue from 'p-queue';

import { logger } from '../logger';
import { supabaseAdmin } from '../services/supabaseClient';
import { memoryConsolidationService } from '../services/compiler/memoryConsolidationService';

import { EngineOrchestrator } from './orchestrator';

// Global concurrency cap for the nightly engine run.
// Prevents OOM and API rate-limit exhaustion when the active user count grows.
// At 10 concurrent users × ~20 engine calls each = 200 parallel LLM calls max.
// Raise this only after verifying OpenAI rate limits can sustain the load.
const SCHEDULER_CONCURRENCY = 10;

/**
 * Engine Scheduler
 * Runs engines daily/weekly for recalculations
 */
export function startEngineScheduler(): void {
  logger.info('Starting engine scheduler');

  const orchestrator = new EngineOrchestrator();

  // Daily recalculation at 2am
  cron.schedule('0 2 * * *', async () => {
    logger.info('Running scheduled daily engine recalculation');

    try {
      // Get active users from journal entries (last 90 days)
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const { data: entries, error } = await supabaseAdmin
        .from('journal_entries')
        .select('user_id')
        .gte('date', cutoff.toISOString())
        .limit(5000);

      if (error) {
        logger.error({ error }, 'Error fetching users for scheduled run');
        return;
      }

      const users = [...new Set((entries || []).map((e: { user_id: string }) => e.user_id))]
        .map((id) => ({ id }));

      if (users.length === 0) {
        logger.info('No active users found for scheduled run');
        return;
      }

      logger.info({ userCount: users.length, concurrency: SCHEDULER_CONCURRENCY }, 'Running engines for all users');

      // PQueue enforces a hard concurrency ceiling across all users.
      // Without this, Promise.all() on 1000+ users causes OOM and thundering-herd
      // on the OpenAI API. Each slot runs one full orchestrator.runAll() to completion
      // before the next user is admitted.
      const queue = new PQueue({ concurrency: SCHEDULER_CONCURRENCY });

      for (const user of users as Array<{ id: string }>) {
        queue.add(() =>
          orchestrator.runAll(user.id, true).catch((err) => {
            logger.error({ error: err, userId: user.id }, 'Error running scheduled engines');
          })
        );
      }

      await queue.onIdle();

      logger.info({ userCount: users.length }, 'Completed scheduled engine runs');

      // Sweep any entry_ir rows stuck in PENDING (pipeline failed mid-flight, server restarted, etc.)
      // Runs after engine queue drains to avoid competing for API quota.
      for (const user of users as Array<{ id: string }>) {
        memoryConsolidationService.sweepPendingForUser(user.id).catch((err) => {
          logger.warn({ err, userId: user.id }, 'IR consolidation sweep failed for user (non-critical)');
        });
      }
    } catch (error) {
      logger.error({ error }, 'Error in scheduled engine run');
    }
  });

  logger.info('Engine scheduler started');
}

