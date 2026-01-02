import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { ResilienceEngine } from '../services/resilience/resilienceEngine';
import { ResilienceStorage } from '../services/resilience/resilienceStorage';

const router = Router();
const resilienceEngine = new ResilienceEngine();
const resilienceStorage = new ResilienceStorage();

/**
 * POST /api/resilience/process
 * Process and analyze resilience (original format)
 */
router.post(
  '/process',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const save = req.body.save !== false;

    logger.info({ userId, save }, 'Processing resilience');

    const result = await resilienceEngine.process(userId);

    // Save if requested
    if (save) {
      const savedSetbacks = await resilienceStorage.saveSetbacks(result.setbacks);
      const savedInsights = await resilienceStorage.saveInsights(result.insights);
      
      result.setbacks = savedSetbacks;
      result.insights = savedInsights;
    }

    res.json(result);
  })
);

/**
 * POST /api/resilience/analyze
 * Enhanced resilience analysis with new blueprint components
 */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const save = req.body.save !== false;

    logger.info({ userId, save }, 'Analyzing resilience (enhanced)');

    const result = await resilienceEngine.processEnhanced(userId);

    // Save if requested
    if (save && result.setbacks) {
      // Convert SetbackSignal[] to Setback[] for storage
      const setbacksToSave = result.setbacks.map(s => ({
        id: s.id,
        user_id: s.user_id,
        timestamp: s.timestamp,
        reason: s.text,
        severity: s.severity > 0.7 ? 'high' : s.severity > 0.4 ? 'medium' : 'low' as const,
        category: s.type,
        metadata: s.metadata,
      }));

      const savedSetbacks = await resilienceStorage.saveSetbacks(setbacksToSave);
      const savedInsights = await resilienceStorage.saveInsights(result.insights);
      
      result.setbacks = savedSetbacks as any;
      result.insights = savedInsights;
    }

    res.json(result);
  })
);

/**
 * GET /api/resilience/setbacks
 * Get setbacks for user
 */
router.get(
  '/setbacks',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const severity = req.query.severity as string | undefined;

    const setbacks = await resilienceStorage.getSetbacks(userId, severity);

    res.json({ setbacks });
  })
);

/**
 * GET /api/resilience/recoveries
 * Get recovery events
 */
router.get(
  '/recoveries',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const setbackId = req.query.setbackId as string | undefined;

    const recoveries = await resilienceStorage.getRecoveryEvents(userId, setbackId);

    res.json({ recoveries });
  })
);

/**
 * GET /api/resilience/insights
 * Get resilience insights
 */
router.get(
  '/insights',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const type = req.query.type as string | undefined;

    const insights = await resilienceStorage.getInsights(userId, type);

    res.json({ insights });
  })
);

/**
 * GET /api/resilience/stats
 * Get resilience statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await resilienceStorage.getStats(userId);

    res.json(stats);
  })
);

export default router;

