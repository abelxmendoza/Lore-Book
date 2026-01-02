import { logger } from '../logger';
import { HabitEngine } from '../services/habits/habitEngine';
import { HabitStorage } from '../services/habits/habitStorage';

/**
 * Background worker for processing habits
 */
export async function runHabits(userId: string): Promise<void> {
  try {
    logger.info({ userId }, 'Running habit worker');

    const engine = new HabitEngine();
    const storage = new HabitStorage();

    const result = await engine.process(userId);

    // Save results
    await storage.saveHabits(result.habits);
    await storage.saveInsights(result.insights);

    logger.info(
      { userId, habits: result.habits.length, insights: result.insights.length },
      'Habit worker completed'
    );
  } catch (error) {
    logger.error({ error, userId }, 'Habit worker failed');
    throw error;
  }
}

/**
 * Process habits for all active users
 */
export async function runHabitsForAllUsers(): Promise<void> {
  try {
    logger.info('Running habit worker for all users');

    // TODO: Fetch active users from database
    // For now, this is a placeholder
    // const { data: users } = await supabaseAdmin
    //   .from('users')
    //   .select('id')
    //   .eq('active', true);

    // for (const user of users || []) {
    //   await runHabits(user.id);
    // }

    logger.info('Habit worker for all users completed');
  } catch (error) {
    logger.error({ error }, 'Habit worker for all users failed');
    throw error;
  }
}


