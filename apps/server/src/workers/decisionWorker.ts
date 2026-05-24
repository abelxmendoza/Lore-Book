import { runForAllActiveUsers } from "./workerUtils";
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
  await runForAllActiveUsers("decisions", runDecisions);
}

