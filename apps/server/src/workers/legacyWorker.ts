import { runForAllActiveUsers } from "./workerUtils";
import { logger } from '../logger';
import { LegacyEngine } from '../services/legacy/legacyEngine';
import { LegacyStorage } from '../services/legacy/legacyStorage';

/**
 * Background worker for processing legacy
 */
export async function runLegacy(userId: string): Promise<void> {
  try {
    logger.info({ userId }, 'Running legacy worker');

    const engine = new LegacyEngine();
    const storage = new LegacyStorage();

    const result = await engine.process(userId);

    // Save results
    await storage.saveSignals(result.signals);
    await storage.saveClusters(result.clusters);
    await storage.saveInsights(result.insights);

    logger.info(
      { userId, domains: result.results.length, insights: result.insights.length, clusters: result.clusters.length, signals: result.signals.length },
      'Legacy worker completed'
    );
  } catch (error) {
    logger.error({ error, userId }, 'Legacy worker failed');
    throw error;
  }
}

/**
 * Process legacy for all active users
 */
export async function runLegacyForAllUsers(): Promise<void> {
  await runForAllActiveUsers("legacy", runLegacy);
}

