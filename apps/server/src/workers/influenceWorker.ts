import { runForAllActiveUsers } from "./workerUtils";
import { logger } from '../logger';
import { InfluenceEngine } from '../services/influence/influenceEngine';
import { InfluenceStorage } from '../services/influence/influenceStorage';

/**
 * Background worker for processing influence
 */
export async function runInfluence(userId: string): Promise<void> {
  try {
    logger.info({ userId }, 'Running influence worker');

    const engine = new InfluenceEngine();
    const storage = new InfluenceStorage();

    const result = await engine.process(userId);

    // Save results
    await storage.saveProfiles(result.profiles);
    await storage.saveEvents(result.events);
    await storage.saveInsights(result.insights);

    logger.info(
      { userId, profiles: result.profiles.length, insights: result.insights.length, events: result.events.length },
      'Influence worker completed'
    );
  } catch (error) {
    logger.error({ error, userId }, 'Influence worker failed');
    throw error;
  }
}

/**
 * Process influence for all active users
 */
export async function runInfluenceForAllUsers(): Promise<void> {
  await runForAllActiveUsers("influence", runInfluence);
}

