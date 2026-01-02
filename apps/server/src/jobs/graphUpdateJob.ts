import cron from 'node-cron';

import { logger } from '../logger';
import { knowledgeGraphService } from '../services/knowledgeGraphService';
import { supabaseAdmin } from '../services/supabaseClient';

/**
 * Weekly Graph Update Job
 * Re-clusters memory components and updates graph edge weights
 */
class GraphUpdateJob {
  /**
   * Update graph for a user
   */
  async updateGraphForUser(userId: string): Promise<void> {
    try {
      logger.info({ userId }, 'Updating knowledge graph');

      // Get recent components (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('id')
        .eq('user_id', userId)
        .gte('date', thirtyDaysAgo.toISOString());

      if (!entries || entries.length === 0) {
        logger.debug({ userId }, 'No recent entries for graph update');
        return;
      }

      const entryIds = entries.map(e => e.id);

      const { data: components } = await supabaseAdmin
        .from('memory_components')
        .select('*')
        .in('journal_entry_id', entryIds)
        .limit(500); // Limit for performance

      if (!components || components.length === 0) {
        logger.debug({ userId }, 'No components for graph update');
        return;
      }

      // Rebuild edges for recent components
      const edges = await knowledgeGraphService.batchBuildEdges(components, userId);

      logger.info({ userId, componentCount: components.length, edgeCount: edges.length }, 'Graph updated');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to update graph for user');
    }
  }

  /**
   * Update graph for all active users
   */
  async updateGraphForAllUsers(): Promise<void> {
    try {
      logger.info('Starting weekly graph update for all users');

      // Get all active users
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
      const batchSize = 3; // Smaller batch size for graph updates (more intensive)
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);

        await Promise.all(
          batch.map(userId => this.updateGraphForUser(userId))
        );

        // Delay between batches
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      logger.info('Weekly graph update completed');
    } catch (error) {
      logger.error({ error }, 'Failed to update graph for all users');
    }
  }

  /**
   * Register weekly cron job
   */
  register(): void {
    // Run weekly on Sunday at 3:00 AM
    cron.schedule('0 3 * * 0', async () => {
      logger.info('Running weekly graph update job');
      await this.updateGraphForAllUsers();
    });

    logger.info('Weekly graph update job registered (runs Sundays at 3:00 AM)');
  }
}

export const graphUpdateJob = new GraphUpdateJob();

