import cron from 'node-cron';

import { logger } from '../logger';
import { supabaseAdmin } from '../services/supabaseClient';

/**
 * Accessibility Decay Job — autobiographical memory salience decay.
 *
 * Each day, journal_entries.accessibility_score decays by DECAY_RATE toward FLOOR.
 * Entries that are retrieved frequently counteract decay via bump_retrieval_count RPC
 * (+0.05 per retrieval, capped at 1.0). The net effect: memories you revisit stay
 * accessible; memories you never revisit fade toward a 0.1 floor rather than 0.
 *
 * Runs daily at 2:00 AM.
 */

const DECAY_RATE = 0.02; // 2% per day — ~50 days to reach floor from 1.0 without retrieval
const FLOOR = 0.1;

class AccessibilityDecayJob {
  async runDecay(): Promise<void> {
    try {
      logger.info({ decayRate: DECAY_RATE, floor: FLOOR }, 'Starting accessibility decay job');

      const { data, error } = await supabaseAdmin.rpc('apply_accessibility_decay', {
        decay_rate: DECAY_RATE,
        floor_val: FLOOR,
      });

      if (error) {
        logger.error({ error }, 'Accessibility decay RPC failed');
        return;
      }

      logger.info({ updatedCount: data }, 'Accessibility decay job completed');
    } catch (error) {
      logger.error({ error }, 'Accessibility decay job failed');
    }
  }

  register(): void {
    cron.schedule('0 2 * * *', async () => {
      await this.runDecay();
    });
    logger.info('Accessibility decay job registered (runs daily at 2:00 AM)');
  }
}

export const accessibilityDecayJob = new AccessibilityDecayJob();
