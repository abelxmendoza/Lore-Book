import { logger } from '../logger';
import { supabaseAdmin } from '../services/supabaseClient';
import { generateRecommendationsForUser } from '../workers/recommendationWorker';

/**
 * Scheduled job to generate recommendations for all active users
 * Runs daily at 6 AM
 */
export const runRecommendationJob = async (): Promise<void> => {
  try {
    logger.info('Starting recommendation generation job');

    // Get all active users (users who have journal entries in the last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: activeUsers, error } = await supabaseAdmin
      .from('journal_entries')
      .select('user_id')
      .gte('date', thirtyDaysAgo.toISOString())
      .order('user_id');

    if (error) {
      logger.error({ error }, 'Failed to fetch active users');
      return;
    }

    if (!activeUsers || activeUsers.length === 0) {
      logger.info('No active users found');
      return;
    }

    // Get unique user IDs
    const userIds = [...new Set(activeUsers.map(u => u.user_id))];

    logger.info({ userCount: userIds.length }, 'Generating recommendations for active users');

    // Generate recommendations for each user (with concurrency limit)
    const concurrency = 5;
    for (let i = 0; i < userIds.length; i += concurrency) {
      const batch = userIds.slice(i, i + concurrency);

      await Promise.allSettled(
        batch.map(userId => generateRecommendationsForUser(userId))
      );
    }

    logger.info({ userCount: userIds.length }, 'Completed recommendation generation job');
  } catch (error) {
    logger.error({ error }, 'Recommendation job failed');
    throw error;
  }
};

