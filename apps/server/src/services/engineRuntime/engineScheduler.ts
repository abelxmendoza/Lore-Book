import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import { EngineOrchestrator } from './engineOrchestrator';

/**
 * Engine Scheduler
 * Runs engines daily/weekly for recalculations
 */
export function startEngineScheduler(): void {
  logger.info('Starting engine scheduler');

  // Daily recalculation at 2am
  // Using a simple interval for now (can be replaced with node-cron if needed)
  const scheduleDaily = () => {
    const now = new Date();
    const targetHour = 2;
    const targetMinute = 0;

    const scheduleNext = () => {
      const next = new Date();
      next.setHours(targetHour, targetMinute, 0, 0);
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }

      const msUntilNext = next.getTime() - Date.now();
      setTimeout(() => {
        runDailyEngines();
        scheduleNext();
      }, msUntilNext);
    };

    scheduleNext();
  };

  scheduleDaily();
}

/**
 * Run engines for all users
 */
async function runDailyEngines(): Promise<void> {
  logger.info('Running daily engine recalculation');

  try {
    // Get all active users
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id')
      .limit(1000); // Process in batches

    if (error) {
      logger.error({ error }, 'Failed to fetch users for daily engine run');
      return;
    }

    if (!users || users.length === 0) {
      logger.info('No users found for daily engine run');
      return;
    }

    const orchestrator = new EngineOrchestrator();

    // Run engines for each user (can be parallelized)
    for (const user of users) {
      orchestrator
        .runAll(user.id, true)
        .then(() => {
          logger.debug({ userId: user.id }, 'Daily engine run completed');
        })
        .catch((err) => {
          logger.error({ error: err, userId: user.id }, 'Daily engine run failed');
        });
    }

    logger.info({ userCount: users.length }, 'Daily engine run scheduled for all users');
  } catch (error) {
    logger.error({ error }, 'Error in daily engine run');
  }
}

