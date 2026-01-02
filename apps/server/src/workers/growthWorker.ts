import { logger } from '../logger';
import { GrowthEngine } from '../services/growth/growthEngine';
import { GrowthStorage } from '../services/growth/growthStorage';

/**
 * Background worker for processing growth
 */
export async function runGrowth(userId: string): Promise<void> {
  try {
    logger.info({ userId }, 'Running growth worker');

    const engine = new GrowthEngine();
    const storage = new GrowthStorage();

    const result = await engine.process(userId);

    // Save results
    await storage.saveSignals(result.signals);
    await storage.saveInsights(result.insights);

    logger.info(
      { userId, domains: result.results.length, insights: result.insights.length, signals: result.signals.length },
      'Growth worker completed'
    );
  } catch (error) {
    logger.error({ error, userId }, 'Growth worker failed');
    throw error;
  }
}

/**
 * Process growth for all active users
 */
export async function runGrowthForAllUsers(): Promise<void> {
  try {
    logger.info('Running growth worker for all users');

    // TODO: Fetch active users from database
    // For now, this is a placeholder
    // const { data: users } = await supabaseAdmin
    //   .from('users')
    //   .select('id')
    //   .eq('active', true);

    // for (const user of users || []) {
    //   await runGrowth(user.id);
    // }

    logger.info('Growth worker for all users completed');
  } catch (error) {
    logger.error({ error }, 'Growth worker for all users failed');
    throw error;
  }
}

