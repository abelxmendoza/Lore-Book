import { logger } from '../logger';
import { SocialNetworkEngine } from '../services/social/socialNetworkEngine';
import { SocialStorage } from '../services/social/socialStorage';

/**
 * Background worker for processing social network
 */
export async function runSocial(userId: string): Promise<void> {
  try {
    logger.info({ userId }, 'Running social network worker');

    const engine = new SocialNetworkEngine();
    const storage = new SocialStorage();

    const result = await engine.process(userId);

    // Save results
    await storage.saveNodes(userId, result.nodes);
    await storage.saveEdges(result.edges);
    await storage.saveCommunities(result.communities);
    await storage.saveInfluenceScores(result.influence);
    await storage.saveToxicitySignals(result.toxic);
    await storage.saveDriftEvents(result.drift);
    await storage.saveNetworkScore(userId, result.score);
    await storage.saveInsights(result.insights || []);

    logger.info(
      {
        userId,
        nodes: Object.keys(result.nodes).length,
        edges: result.edges.length,
        communities: result.communities.length,
        influence: result.influence.length,
        toxic: result.toxic.length,
        drift: result.drift.length,
        networkScore: result.score.overall,
        insights: result.insights?.length || 0,
      },
      'Social network worker completed'
    );
  } catch (error) {
    logger.error({ error, userId }, 'Social network worker failed');
    throw error;
  }
}

/**
 * Process social network for all active users
 */
export async function runSocialForAllUsers(): Promise<void> {
  try {
    logger.info('Running social network worker for all users');

    // TODO: Fetch active users from database
    // For now, this is a placeholder
    // const { data: users } = await supabaseAdmin
    //   .from('users')
    //   .select('id')
    //   .eq('active', true);

    // for (const user of users || []) {
    //   await runSocial(user.id);
    // }

    logger.info('Social network worker for all users completed');
  } catch (error) {
    logger.error({ error }, 'Social network worker for all users failed');
    throw error;
  }
}

