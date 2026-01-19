/**
 * Value Evolution Job
 * Periodically evolves values for all users based on conversations
 */

import cron from 'node-cron';

import { logger } from '../logger';
import { goalValueAlignmentService } from '../services/goalValueAlignmentService';
import { supabaseAdmin } from '../services/supabaseClient';

class ValueEvolutionJob {
  /**
   * Evolve values for a single user
   */
  async evolveForUser(userId: string): Promise<void> {
    try {
      logger.debug({ userId }, 'Evolving values for user');
      const result = await goalValueAlignmentService.evolveValues(userId);
      
      if (result.events > 0) {
        logger.info(
          { userId, updated: result.updated.length, newValues: result.newValues.length, events: result.events },
          'Value evolution completed for user'
        );
      }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to evolve values for user');
    }
  }

  /**
   * Evolve values for all active users
   */
  async evolveForAllUsers(): Promise<void> {
    try {
      logger.info('Starting value evolution for all users');

      // Get all active users (users with recent activity)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('id')
        .or(`last_active_at.gte.${thirtyDaysAgo.toISOString()},last_active_at.is.null`);

      if (error) {
        logger.error({ error }, 'Failed to fetch users for value evolution');
        return;
      }

      if (!users || users.length === 0) {
        logger.info('No active users found for value evolution');
        return;
      }

      logger.info({ userCount: users.length }, 'Evolving values for all active users');

      // Process users in batches to avoid overwhelming the system
      const batchSize = 10;
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        await Promise.all(
          batch.map(user => this.evolveForUser(user.id))
        );
        
        // Small delay between batches
        if (i + batchSize < users.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      logger.info({ userCount: users.length }, 'Completed value evolution for all users');
    } catch (error) {
      logger.error({ error }, 'Failed to evolve values for all users');
    }
  }

  /**
   * Register periodic cron job
   */
  register(): void {
    // Run daily at 4:00 AM (after other engines have run)
    cron.schedule('0 4 * * *', async () => {
      logger.info('Running daily value evolution job');
      await this.evolveForAllUsers();
    });

    logger.info('Daily value evolution job registered (runs at 4:00 AM)');
  }
}

export const valueEvolutionJob = new ValueEvolutionJob();

