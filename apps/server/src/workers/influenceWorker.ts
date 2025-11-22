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
  try {
    logger.info('Running influence worker for all users');

    // TODO: Fetch active users from database
    // For now, this is a placeholder
    // const { data: users } = await supabaseAdmin
    //   .from('users')
    //   .select('id')
    //   .eq('active', true);

    // for (const user of users || []) {
    //   await runInfluence(user.id);
    // }

    logger.info('Influence worker for all users completed');
  } catch (error) {
    logger.error({ error }, 'Influence worker for all users failed');
    throw error;
  }
}

