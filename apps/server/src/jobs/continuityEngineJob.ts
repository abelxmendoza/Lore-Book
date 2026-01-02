import cron from 'node-cron';

import { logger } from '../logger';
import { continuityService } from '../services/continuity/continuityService';
import { supabaseAdmin } from '../services/supabaseClient';

/**
 * Continuity Engine Background Job
 * Runs daily to detect contradictions, abandoned goals, arc shifts, identity drift, etc.
 */
class ContinuityEngineJob {
  /**
   * Run continuity analysis for a user
   */
  async runForUser(userId: string): Promise<void> {
    try {
      logger.info({ userId }, 'Running continuity analysis for user');
      const result = await continuityService.runContinuityAnalysis(userId);
      logger.info(
        { userId, eventCount: result.events.length, summary: result.summary },
        'Continuity analysis completed'
      );
    } catch (error) {
      logger.error({ error, userId }, 'Failed to run continuity analysis for user');
    }
  }

  /**
   * Run continuity analysis for all active users
   */
  async runForAllUsers(): Promise<void> {
    try {
      logger.info('Starting daily continuity analysis for all users');

      // Get all active users (users with recent entries)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('user_id')
        .gte('date', thirtyDaysAgo.toISOString())
        .limit(1000);

      if (!entries) {
        logger.info('No active users found');
        return;
      }

      const userIds = [...new Set(entries.map(e => e.user_id))];

      logger.info({ userCount: userIds.length }, 'Found active users');

      // Process users in batches
      const batchSize = 3; // Smaller batch size for intensive analysis
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);

        await Promise.all(batch.map(userId => this.runForUser(userId)));

        // Delay between batches
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      logger.info('Daily continuity analysis completed');
    } catch (error) {
      logger.error({ error }, 'Failed to run continuity analysis for all users');
    }
  }

  /**
   * Register daily cron job
   */
  register(): void {
    // Run daily at 3:00 AM
    cron.schedule('0 3 * * *', async () => {
      logger.info('Running daily continuity engine job');
      await this.runForAllUsers();
    });

    logger.info('Daily continuity engine job registered (runs at 3:00 AM)');
  }
}

export const continuityEngineJob = new ContinuityEngineJob();

