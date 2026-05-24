import { runForAllActiveUsers } from "./workerUtils";
import { logger } from '../logger';
import { InterventionEngine } from '../services/intervention/interventionEngine';

/**
 * Background worker for processing interventions
 */
export async function runInterventions(userId: string): Promise<void> {
  try {
    logger.info({ userId }, 'Running intervention worker');

    const engine = new InterventionEngine();
    const interventions = await engine.process(userId, true);

    logger.info(
      { userId, interventions: interventions.length },
      'Intervention worker completed'
    );
  } catch (error) {
    logger.error({ error, userId }, 'Intervention worker failed');
    throw error;
  }
}

/**
 * Process interventions for all active users
 */
export async function runInterventionsForAllUsers(): Promise<void> {
  await runForAllActiveUsers("interventions", runInterventions);
}

