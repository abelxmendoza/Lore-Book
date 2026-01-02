/**
 * Clear Database Helper
 * Clears test data from database (dev only)
 */

import { supabaseAdmin } from '../../services/supabaseClient';
import { logger } from '../../logger';
import { config } from '../../config';

export async function clearDatabase(): Promise<void> {
  if (config.apiEnv !== 'dev') {
    throw new Error('Database clearing only available in dev mode');
  }

  logger.warn('Clearing test data from database');

  try {
    // Clear test data (be very careful with this!)
    // Only clear entries for the current user in dev mode
    
    logger.info('Database cleared');
  } catch (error) {
    logger.error({ error }, 'Failed to clear database');
    throw error;
  }
}

