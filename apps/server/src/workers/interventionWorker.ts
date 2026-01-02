import { logger } from '../logger';
import { InterventionEngine } from '../services/intervention/interventionEngine';

/**
 * Background worker for processing interventions
 */
export async function runInterventions(userId: string): Promise<void> {
  try {
    logger.info({ userId }, 'Running intervention worker');

    const engine = new InterventionEngine();
    const interventions = await engine.process(userId, true);

    logger.info(
      { userId, interventions: interventions.length },
      'Intervention worker completed'
    );
  } catch (error) {
    logger.error({ error, userId }, 'Intervention worker failed');
    throw error;
  }
}

/**
 * Process interventions for all active users
 */
export async function runInterventionsForAllUsers(): Promise<void> {
  try {
    logger.info('Running intervention worker for all users');

    // TODO: Fetch active users from database
    // For now, this is a placeholder
    // const { data: users } = await supabaseAdmin
    //   .from('users')
    //   .select('id')
    //   .eq('active', true);

    // for (const user of users || []) {
    //   await runInterventions(user.id);
    // }

    logger.info('Intervention worker for all users completed');
  } catch (error) {
    logger.error({ error }, 'Intervention worker for all users failed');
    throw error;
  }
}

