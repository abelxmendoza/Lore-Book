import { runForAllActiveUsers } from "./workerUtils";
import { logger } from '../logger';
import { TimeEngine } from '../services/time/timeEngine';
import { TimeStorage } from '../services/time/timeStorage';

/**
 * Background worker for processing time management
 */
export async function runTime(userId: string): Promise<void> {
  try {
    logger.info({ userId }, 'Running time worker');

    const engine = new TimeEngine();
    const storage = new TimeStorage();

    const result = await engine.process(userId);

    // Save results
    await storage.saveTimeEvents(result.events);
    await storage.saveTimeBlocks(result.blocks);
    await storage.saveProcrastinationSignals(result.procrastination);
    await storage.saveEnergyCurve(userId, result.energy);
    await storage.saveTimeScore(userId, result.score);
    await storage.saveInsights(result.insights || []);

    logger.info(
      {
        userId,
        events: result.events.length,
        blocks: result.blocks.length,
        procrastination: result.procrastination.length,
        cycles: result.cycles.length,
        timeScore: result.score.overall,
        insights: result.insights?.length || 0,
      },
      'Time worker completed'
    );
  } catch (error) {
    logger.error({ error, userId }, 'Time worker failed');
    throw error;
  }
}

/**
 * Process time for all active users
 */
export async function runTimeForAllUsers(): Promise<void> {
  await runForAllActiveUsers("time", runTime);
}

