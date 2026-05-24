import { runForAllActiveUsers } from "./workerUtils";
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
  await runForAllActiveUsers("growth", runGrowth);
}

