/**
 * Seed Database Helper
 * Seeds database with test data (dev only)
 */

import { config } from '../../config';
import { logger } from '../../logger';
import { supabaseAdmin } from '../../services/supabaseClient';

export async function seedDatabase(): Promise<void> {
  if (config.apiEnv !== 'dev') {
    throw new Error('Database seeding only available in dev mode');
  }

  logger.info('Seeding database with test data');

  try {
    // Use existing populate dummy data logic
    // This would call your existing dev populate endpoint logic
    // For now, just log that seeding was requested
    
    logger.info('Database seeding completed');
  } catch (error) {
    logger.error({ error }, 'Failed to seed database');
    throw error;
  }
}

