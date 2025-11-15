import cron from 'node-cron';

import { logger } from '../logger';
import { memoryService } from '../services/memoryService';

export const registerSyncJob = () => {
  cron.schedule('30 2 * * *', async () => {
    logger.info('Running nightly Lore Keeper sync');
    // Placeholder. In production we would iterate over active users.
    // This example demonstrates how a summary job could be wired.
    try {
      // Implement multi-tenant summary logic via Supabase functions if needed.
    } catch (error) {
      logger.error({ error }, 'Nightly sync failed');
    }
  });
};
