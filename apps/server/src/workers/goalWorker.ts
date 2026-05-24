import { runForAllActiveUsers } from "./workerUtils";
import { logger } from '../logger';
import { GoalEngine } from '../services/goals/goalEngine';
import { GoalStorage } from '../services/goals/goalStorage';

/**
 * Background worker for processing goals
 */
export async function runGoals(userId: string): Promise<void> {
  try {
    logger.info({ userId }, 'Running goal worker');

    const engine = new GoalEngine();
    const storage = new GoalStorage();

    const result = await engine.process(userId);

    // Save results
    await storage.saveGoals(result.goals);
    await storage.saveInsights(result.insights);

    logger.info(
      { userId, goals: result.goals.length, insights: result.insights.length },
      'Goal worker completed'
    );
  } catch (error) {
    logger.error({ error, userId }, 'Goal worker failed');
    throw error;
  }
}

/**
 * Process goals for all active users
 */
export async function runGoalsForAllUsers(): Promise<void> {
  await runForAllActiveUsers("goals", runGoals);
}

