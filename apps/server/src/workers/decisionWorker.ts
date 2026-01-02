import { logger } from '../logger';
import { DecisionEngine } from '../services/decisions/decisionEngine';
import { DecisionStorage } from '../services/decisions/decisionStorage';

/**
 * Background worker for processing decisions
 */
export async function runDecisions(userId: string): Promise<void> {
  try {
    logger.info({ userId }, 'Running decision worker');

    const engine = new DecisionEngine();
    const storage = new DecisionStorage();

    const result = await engine.process(userId);

    // Save results
    await storage.saveDecisions(result.decisions);
    await storage.saveInsights(result.insights);

    logger.info(
      { userId, decisions: result.decisions.length, insights: result.insights.length },
      'Decision worker completed'
    );
  } catch (error) {
    logger.error({ error, userId }, 'Decision worker failed');
    throw error;
  }
}

/**
 * Process decisions for all active users
 */
export async function runDecisionsForAllUsers(): Promise<void> {
  try {
    logger.info('Running decision worker for all users');

    // TODO: Fetch active users from database
    // For now, this is a placeholder
    // const { data: users } = await supabaseAdmin
    //   .from('users')
    //   .select('id')
    //   .eq('active', true);

    // for (const user of users || []) {
    //   await runDecisions(user.id);
    // }

    logger.info('Decision worker for all users completed');
  } catch (error) {
    logger.error({ error }, 'Decision worker for all users failed');
    throw error;
  }
}

