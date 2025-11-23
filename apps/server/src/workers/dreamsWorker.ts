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
  try {
    logger.info('Running dreams worker for all users');

    // TODO: Fetch active users from database
    // For now, this is a placeholder
    // const { data: users } = await supabaseAdmin
    //   .from('users')
    //   .select('id')
    //   .eq('active', true);

    // for (const user of users || []) {
    //   await runDreams(user.id);
    // }

    logger.info('Dreams worker for all users completed');
  } catch (error) {
    logger.error({ error }, 'Dreams worker for all users failed');
    throw error;
  }
}

