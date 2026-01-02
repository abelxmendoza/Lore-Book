import { logger } from '../logger';
import { ValuesEngine } from '../services/values/valuesEngine';
import { ValuesStorage } from '../services/values/valuesStorage';

/**
 * Background worker for processing values and beliefs
 */
export async function runValues(userId: string): Promise<void> {
  try {
    logger.info({ userId }, 'Running values worker');

    const engine = new ValuesEngine();
    const storage = new ValuesStorage();

    const result = await engine.process(userId);

    // Save results
    await storage.saveValueSignals(result.valueSignals || []);
    await storage.saveBeliefSignals(result.beliefSignals || []);
    await storage.saveInsights(result.insights);

    logger.info(
      {
        userId,
        coreValues: result.coreValues.length,
        conflicts: result.conflicts.length,
        misalignments: result.misalignments.length,
        insights: result.insights.length,
        valueSignals: result.valueSignals?.length || 0,
        beliefSignals: result.beliefSignals?.length || 0,
      },
      'Values worker completed'
    );
  } catch (error) {
    logger.error({ error, userId }, 'Values worker failed');
    throw error;
  }
}

/**
 * Process values for all active users
 */
export async function runValuesForAllUsers(): Promise<void> {
  try {
    logger.info('Running values worker for all users');

    // TODO: Fetch active users from database
    // For now, this is a placeholder
    // const { data: users } = await supabaseAdmin
    //   .from('users')
    //   .select('id')
    //   .eq('active', true);

    // for (const user of users || []) {
    //   await runValues(user.id);
    // }

    logger.info('Values worker for all users completed');
  } catch (error) {
    logger.error({ error }, 'Values worker for all users failed');
    throw error;
  }
}

