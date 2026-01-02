import { logger } from '../logger';
import { EQEngine } from '../services/emotionalIntelligence/eqEngine';
import { EQStorage } from '../services/emotionalIntelligence/eqStorage';

/**
 * Background worker for processing emotional intelligence
 */
export async function runEQ(userId: string): Promise<void> {
  try {
    logger.info({ userId }, 'Running EQ worker');

    const engine = new EQEngine();
    const storage = new EQStorage();

    const result = await engine.process(userId);

    // Save results
    await storage.saveEmotionSignals(result.signals);
    await storage.saveTriggerEvents(result.triggers);
    await storage.saveReactionPatterns(result.reactions);
    await storage.saveRegulationScore(userId, result.regulation);
    await storage.saveInsights(result.insights);

    logger.info(
      {
        userId,
        signals: result.signals.length,
        triggers: result.triggers.length,
        reactions: result.reactions.length,
        regulation: result.regulation.overall,
        insights: result.insights.length,
      },
      'EQ worker completed'
    );
  } catch (error) {
    logger.error({ error, userId }, 'EQ worker failed');
    throw error;
  }
}

/**
 * Process EQ for all active users
 */
export async function runEQForAllUsers(): Promise<void> {
  try {
    logger.info('Running EQ worker for all users');

    // TODO: Fetch active users from database
    // For now, this is a placeholder
    // const { data: users } = await supabaseAdmin
    //   .from('users')
    //   .select('id')
    //   .eq('active', true);

    // for (const user of users || []) {
    //   await runEQ(user.id);
    // }

    logger.info('EQ worker for all users completed');
  } catch (error) {
    logger.error({ error }, 'EQ worker for all users failed');
    throw error;
  }
}

