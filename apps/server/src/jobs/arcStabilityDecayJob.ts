import cron from 'node-cron';

import { logger } from '../logger';
import { arcStabilityService } from '../services/arcStabilityService';

/**
 * Arc Stability Decay Job
 *
 * Applies a slow daily decay to inferred life arc stability scores.
 * User-created arcs never decay (enforced in the SQL function).
 * Arcs not retrieved recently drift toward a 0.3 floor over months.
 *
 * Retrieval (via bumpArcsForEntries) counteracts decay: an arc whose
 * entries are revisited regularly stabilizes at 0.8–0.95.
 *
 * decay_rate = 0.005 → ~0.5% per day → ~14% per month.
 * An arc at 0.5 confidence reaches the 0.3 floor in ~47 days without retrieval.
 *
 * Runs daily at 3:30 AM (after accessibility decay at 2:00 AM).
 */
class ArcStabilityDecayJob {
  async runDecay(): Promise<void> {
    try {
      const updated = await arcStabilityService.applyDecay(0.005, 0.3);
      logger.info({ updated }, 'Arc stability decay completed');
    } catch (error) {
      logger.error({ error }, 'Arc stability decay job failed');
    }
  }

  register(): void {
    cron.schedule('30 3 * * *', async () => {
      await this.runDecay();
    });
    logger.info('Arc stability decay job registered (runs daily at 3:30 AM)');
  }
}

export const arcStabilityDecayJob = new ArcStabilityDecayJob();
