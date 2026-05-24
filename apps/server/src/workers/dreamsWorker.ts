import { runForAllActiveUsers } from "./workerUtils";
import { logger } from '../logger';
import { DreamsEngine } from '../services/dreams/dreamsEngine';
import { DreamsStorage } from '../services/dreams/dreamsStorage';

/**
 * Background worker for processing dreams and aspirations
 */
export async function runDreams(userId: string): Promise<void> {
  try {
    logger.info({ userId }, 'Running dreams worker');

    const engine = new DreamsEngine();
    const storage = new DreamsStorage();

    const result = await engine.process(userId);

    // Save results
    await storage.saveDreamSignals(result.dreamSignals || []);
    await storage.saveAspirationSignals(result.aspirationSignals || []);
    await storage.saveInsights(result.insights);

    logger.info(
      {
        userId,
        coreDreams: result.coreDreams.length,
        conflicts: result.conflicts.length,
        insights: result.insights.length,
        dreamSignals: result.dreamSignals?.length || 0,
        aspirationSignals: result.aspirationSignals?.length || 0,
      },
      'Dreams worker completed'
    );
  } catch (error) {
    logger.error({ error, userId }, 'Dreams worker failed');
    throw error;
  }
}

/**
 * Process dreams for all active users
 */
export async function runDreamsForAllUsers(): Promise<void> {
  await runForAllActiveUsers("dreams", runDreams);
}

