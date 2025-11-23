import { logger } from '../logger';
import { FinancialEngine } from '../services/financial/financialEngine';
import { FinancialStorage } from '../services/financial/financialStorage';

/**
 * Background worker for processing financial intelligence
 */
export async function runFinancial(userId: string): Promise<void> {
  try {
    logger.info({ userId }, 'Running financial worker');

    const engine = new FinancialEngine();
    const storage = new FinancialStorage();

    const result = await engine.process(userId);

    // Save results
    await storage.saveTransactions(result.transactions);
    await storage.saveSpendingPatterns(userId, result.spending);
    await storage.saveIncomeTrend(userId, result.income);
    await storage.saveInvestmentProfile(userId, result.investments);
    await storage.saveFinancialScore(userId, result.score);
    await storage.saveMindsetInsights(result.mindset);
    await storage.saveInsights(result.insights || []);

    logger.info(
      {
        userId,
        transactions: result.transactions.length,
        spending: result.spending.length,
        investments: result.investments.frequency,
        financialScore: result.score.overall,
        insights: result.insights?.length || 0,
      },
      'Financial worker completed'
    );
  } catch (error) {
    logger.error({ error, userId }, 'Financial worker failed');
    throw error;
  }
}

/**
 * Process financial for all active users
 */
export async function runFinancialForAllUsers(): Promise<void> {
  try {
    logger.info('Running financial worker for all users');

    // TODO: Fetch active users from database
    // For now, this is a placeholder
    // const { data: users } = await supabaseAdmin
    //   .from('users')
    //   .select('id')
    //   .eq('active', true);

    // for (const user of users || []) {
    //   await runFinancial(user.id);
    // }

    logger.info('Financial worker for all users completed');
  } catch (error) {
    logger.error({ error }, 'Financial worker for all users failed');
    throw error;
  }
}

