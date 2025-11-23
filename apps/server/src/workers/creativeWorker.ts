import { logger } from '../logger';
import { CreativeEngine } from '../services/creative/creativeEngine';
import { CreativeStorage } from '../services/creative/creativeStorage';

/**
 * Background worker for processing creative output
 */
export async function runCreative(userId: string): Promise<void> {
  try {
    logger.info({ userId }, 'Running creative worker');

    const engine = new CreativeEngine();
    const storage = new CreativeStorage();

    const result = await engine.process(userId);

    // Save results
    await storage.saveCreativeEvents(result.events);
    await storage.saveFlowStates(result.flowStates);
    await storage.saveCreativeBlocks(result.blocks);
    await storage.saveInspirationSources(result.inspiration);
    await storage.saveProjectLifecycles(result.projectStages);
    await storage.saveCreativeScore(userId, result.score);
    await storage.saveInsights(result.insights || []);

    logger.info(
      {
        userId,
        events: result.events.length,
        flowStates: result.flowStates.length,
        blocks: result.blocks.length,
        inspiration: result.inspiration.length,
        projects: result.projectStages.length,
        creativeScore: result.score.overall,
        insights: result.insights?.length || 0,
      },
      'Creative worker completed'
    );
  } catch (error) {
    logger.error({ error, userId }, 'Creative worker failed');
    throw error;
  }
}

/**
 * Process creative for all active users
 */
export async function runCreativeForAllUsers(): Promise<void> {
  try {
    logger.info('Running creative worker for all users');

    // TODO: Fetch active users from database
    // For now, this is a placeholder
    // const { data: users } = await supabaseAdmin
    //   .from('users')
    //   .select('id')
    //   .eq('active', true);

    // for (const user of users || []) {
    //   await runCreative(user.id);
    // }

    logger.info('Creative worker for all users completed');
  } catch (error) {
    logger.error({ error }, 'Creative worker for all users failed');
    throw error;
  }
}

