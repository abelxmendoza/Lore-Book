import cron from 'node-cron';

import { logger } from '../logger';
import { supabaseAdmin } from '../services/supabaseClient';
import { closeEpisodicEdges } from '../er/temporalEdgeService';

/**
 * Episodic Closure Job — Phase 2
 * Closes episodic temporal_edges that have had no evidence in EPISODIC_CLOSURE_DAYS.
 * Runs weekly (Sundays 3:00 AM).
 */
class EpisodicClosureJob {
  async closeEpisodicEdgesForAllUsers(): Promise<void> {
    try {
      logger.info('Starting episodic closure job');

      const { data: rows } = await supabaseAdmin
        .from('temporal_edges')
        .select('user_id')
        .limit(10000);

      const userIds = [...new Set((rows || []).map((r: { user_id: string }) => r.user_id))];

      if (userIds.length === 0) {
        logger.info('No users with temporal edges');
        return;
      }

      logger.info({ userCount: userIds.length }, 'Running episodic closure for users');

      const batchSize = 5;
      let totalClosed = 0;
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        const results = await Promise.all(batch.map((userId) => closeEpisodicEdges(userId)));
        totalClosed += results.reduce((a, b) => a + b, 0);
        await new Promise((r) => setTimeout(r, 500));
      }

      logger.info({ userCount: userIds.length, closed: totalClosed }, 'Episodic closure job completed');
    } catch (error) {
      logger.error({ error }, 'Episodic closure job failed');
    }
  }

  register(): void {
    cron.schedule('0 3 * * 0', async () => {
      logger.info('Running episodic closure job');
      await this.closeEpisodicEdgesForAllUsers();
    });
    logger.info('Episodic closure job registered (runs Sundays at 3:00 AM)');
  }
}

export const episodicClosureJob = new EpisodicClosureJob();
