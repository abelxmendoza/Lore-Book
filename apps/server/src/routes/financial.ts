import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { FinancialEngine } from '../services/financial/financialEngine';
import { FinancialStorage } from '../services/financial/financialStorage';

const router = Router();
const financialEngine = new FinancialEngine();
const financialStorage = new FinancialStorage();

/**
 * POST /api/financial/analyze
 * Process and analyze financial intelligence
 */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const save = req.body.save !== false;

    logger.info({ userId, save }, 'Analyzing financial intelligence');

    const result = await financialEngine.process(userId);

    // Save if requested
    if (save) {
      const savedTransactions = await financialStorage.saveTransactions(result.transactions);
      await financialStorage.saveSpendingPatterns(userId, result.spending);
      await financialStorage.saveIncomeTrend(userId, result.income);
      await financialStorage.saveInvestmentProfile(userId, result.investments);
      await financialStorage.saveFinancialScore(userId, result.score);
      await financialStorage.saveMindsetInsights(result.mindset);
      await financialStorage.saveInsights(result.insights || []);
      
      result.transactions = savedTransactions;
    }

    res.json(result);
  })
);

/**
 * GET /api/financial/transactions
 * Get financial transactions
 */
router.get(
  '/transactions',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const category = req.query.category as string | undefined;
    const direction = req.query.direction as 'in' | 'out' | undefined;

    const transactions = await financialStorage.getTransactions(userId, category as any, direction);

    res.json({ transactions });
  })
);

/**
 * GET /api/financial/score
 * Get latest financial score
 */
router.get(
  '/score',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const score = await financialStorage.getLatestFinancialScore(userId);

    res.json({ score });
  })
);

/**
 * GET /api/financial/stats
 * Get financial statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await financialStorage.getStats(userId);

    res.json(stats);
  })
);

export default router;

