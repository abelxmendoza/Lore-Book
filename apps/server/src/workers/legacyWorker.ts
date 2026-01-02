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
  try {
    logger.info('Running legacy worker for all users');

    // TODO: Fetch active users from database
    // For now, this is a placeholder
    // const { data: users } = await supabaseAdmin
    //   .from('users')
    //   .select('id')
    //   .eq('active', true);

    // for (const user of users || []) {
    //   await runLegacy(user.id);
    // }

    logger.info('Legacy worker for all users completed');
  } catch (error) {
    logger.error({ error }, 'Legacy worker for all users failed');
    throw error;
  }
}

