import * as cron from 'node-cron';

import { logger } from '../logger';
import { supabaseAdmin } from '../services/supabaseClient';
import { memoryConsolidationService } from '../services/compiler/memoryConsolidationService';

import { EngineOrchestrator } from './orchestrator';

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
      // Get all users (adjust query based on your schema)
      const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('id');

      if (error) {
        logger.error({ error }, 'Error fetching users for scheduled run');
        return;
      }

      if (!users || users.length === 0) {
        logger.info('No active users found for scheduled run');
        return;
      }

      logger.info({ userCount: users.length }, 'Running engines for all users');

      // Run engines for each user (in parallel, but with rate limiting)
      // Use save=true to cache results for chat system
      const promises = users.map((user) =>
        orchestrator.runAll(user.id, true).catch((err) => {
          logger.error({ error: err, userId: user.id }, 'Error running scheduled engines');
        })
      );

      await Promise.all(promises);

      logger.info({ userCount: users.length }, 'Completed scheduled engine runs');

      // Sweep any entry_ir rows stuck in PENDING (pipeline failed mid-flight, server restarted, etc.)
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

