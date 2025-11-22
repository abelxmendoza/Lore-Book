import { logger } from '../logger';
import { ResilienceEngine } from '../services/resilience/resilienceEngine';
import { ResilienceStorage } from '../services/resilience/resilienceStorage';

/**
 * Background worker for processing resilience
 */
export async function runResilience(userId: string): Promise<void> {
  try {
    logger.info({ userId }, 'Running resilience worker');

    const engine = new ResilienceEngine();
    const storage = new ResilienceStorage();

    const result = await engine.process(userId);

    // Save results
    await storage.saveSetbacks(result.setbacks);
    await storage.saveInsights(result.insights);

    logger.info(
      { userId, setbacks: result.setbacks.length, insights: result.insights.length },
      'Resilience worker completed'
    );
  } catch (error) {
    logger.error({ error, userId }, 'Resilience worker failed');
    throw error;
  }
}

/**
 * Process resilience for all active users
 */
export async function runResilienceForAllUsers(): Promise<void> {
  try {
    logger.info('Running resilience worker for all users');

    // TODO: Fetch active users from database
    // For now, this is a placeholder
    // const { data: users } = await supabaseAdmin
    //   .from('users')
    //   .select('id')
    //   .eq('active', true);

    // for (const user of users || []) {
    //   await runResilience(user.id);
    // }

    logger.info('Resilience worker for all users completed');
  } catch (error) {
    logger.error({ error }, 'Resilience worker for all users failed');
    throw error;
  }
}

