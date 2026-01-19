import { logger } from '../logger';
import { AlignmentRegressorTrainer } from '../services/personalStrategy/supervised/trainers/trainAlignmentRegressor';
import { OutcomePredictorTrainer } from '../services/personalStrategy/supervised/trainers/trainOutcomePredictor';
import { PatternClassifierTrainer } from '../services/personalStrategy/supervised/trainers/trainPatternClassifier';
import { supabaseAdmin } from '../services/supabaseClient';

/**
 * Background job: Auto-train Personal Strategy Engine models
 * Runs weekly to retrain models with accumulated data
 */
export async function trainPersonalStrategyModels(): Promise<void> {
  try {
    logger.info('Starting Personal Strategy Engine model training');

    // Get all active users (users with entries in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: activeUsers } = await supabaseAdmin
      .from('journal_entries')
      .select('user_id')
      .gte('date', thirtyDaysAgo.toISOString())
      .not('user_id', 'is', null);

    const userIds = [...new Set((activeUsers || []).map(u => u.user_id))];

    logger.info({ userCount: userIds.length }, 'Training models for active users');

    const patternTrainer = new PatternClassifierTrainer();
    const outcomeTrainer = new OutcomePredictorTrainer();
    const alignmentTrainer = new AlignmentRegressorTrainer();

    let trainedCount = 0;
    let failedCount = 0;

    for (const userId of userIds) {
      try {
        // Check if user has enough data
        const { data: entryCount } = await supabaseAdmin
          .from('journal_entries')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);

        const { data: actionCount } = await supabaseAdmin
          .from('strategy_actions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .not('outcome', 'is', null);

        // Need at least 10 examples per model
        if ((entryCount || 0) < 10 && (actionCount || 0) < 10) {
          logger.debug({ userId }, 'Insufficient data for training, skipping');
          continue;
        }

        // Train pattern classifier (if enough entries)
        if ((entryCount || 0) >= 10) {
          try {
            await patternTrainer.train(userId);
            logger.debug({ userId }, 'Trained pattern classifier');
          } catch (error) {
            logger.warn({ error, userId }, 'Failed to train pattern classifier');
          }
        }

        // Train outcome predictor (if enough actions)
        if ((actionCount || 0) >= 10) {
          try {
            await outcomeTrainer.train(userId);
            logger.debug({ userId }, 'Trained outcome predictor');
          } catch (error) {
            logger.warn({ error, userId }, 'Failed to train outcome predictor');
          }
        }

        // Train alignment regressor (if enough state transitions)
        const { data: stateCount } = await supabaseAdmin
          .from('state_snapshots')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);

        if ((stateCount || 0) >= 10) {
          try {
            await alignmentTrainer.train(userId);
            logger.debug({ userId }, 'Trained alignment regressor');
          } catch (error) {
            logger.warn({ error, userId }, 'Failed to train alignment regressor');
          }
        }

        trainedCount++;
      } catch (error) {
        logger.warn({ error, userId }, 'Failed to train models for user');
        failedCount++;
      }
    }

    logger.info(
      { trained: trainedCount, failed: failedCount, total: userIds.length },
      'Completed Personal Strategy Engine model training'
    );
  } catch (error) {
    logger.error({ error }, 'Failed to train Personal Strategy Engine models');
  }
}

/**
 * Register weekly training job
 */
export function registerPersonalStrategyTrainingJob(): void {
  try {
    const cron = require('node-cron');
    
    // Run every Sunday at 2 AM
    cron.schedule('0 2 * * 0', async () => {
      logger.info('Running scheduled Personal Strategy Engine model training');
      await trainPersonalStrategyModels();
    });

    logger.info('Registered Personal Strategy Engine training job (weekly on Sundays at 2 AM)');
  } catch (error) {
    logger.error({ error }, 'Failed to register Personal Strategy Engine training job');
  }
}
