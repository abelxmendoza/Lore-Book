import { logger } from '../logger';
import { HealthEngine } from '../services/health/healthEngine';
import { HealthStorage } from '../services/health/healthStorage';

/**
 * Background worker for processing health and wellness
 */
export async function runHealth(userId: string): Promise<void> {
  try {
    logger.info({ userId }, 'Running health worker');

    const engine = new HealthEngine();
    const storage = new HealthStorage();

    const result = await engine.process(userId);

    // Save results
    await storage.saveSymptomEvents(result.symptoms);
    await storage.saveSleepEvents(result.sleep);
    await storage.saveEnergyEvents(result.energy);
    await storage.saveWellnessScore(userId, result.score);
    await storage.saveInsights(result.insights || []);

    logger.info(
      {
        userId,
        symptoms: result.symptoms.length,
        sleep: result.sleep.length,
        energy: result.energy.length,
        cycles: result.cycles.length,
        wellnessScore: result.score.overall,
        insights: result.insights?.length || 0,
      },
      'Health worker completed'
    );
  } catch (error) {
    logger.error({ error, userId }, 'Health worker failed');
    throw error;
  }
}

/**
 * Process health for all active users
 */
export async function runHealthForAllUsers(): Promise<void> {
  try {
    logger.info('Running health worker for all users');

    // TODO: Fetch active users from database
    // For now, this is a placeholder
    // const { data: users } = await supabaseAdmin
    //   .from('users')
    //   .select('id')
    //   .eq('active', true);

    // for (const user of users || []) {
    //   await runHealth(user.id);
    // }

    logger.info('Health worker for all users completed');
  } catch (error) {
    logger.error({ error }, 'Health worker for all users failed');
    throw error;
  }
}

