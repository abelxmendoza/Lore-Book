import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { HealthEngine } from '../services/health/healthEngine';
import { HealthStorage } from '../services/health/healthStorage';

const router = Router();
const healthEngine = new HealthEngine();
const healthStorage = new HealthStorage();

/**
 * POST /api/health/analyze
 * Process and analyze health and wellness
 */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const save = req.body.save !== false;

    logger.info({ userId, save }, 'Analyzing health and wellness');

    const result = await healthEngine.process(userId);

    // Save if requested
    if (save) {
      const savedSymptoms = await healthStorage.saveSymptomEvents(result.symptoms);
      const savedSleep = await healthStorage.saveSleepEvents(result.sleep);
      const savedEnergy = await healthStorage.saveEnergyEvents(result.energy);
      const savedScore = await healthStorage.saveWellnessScore(userId, result.score);
      const savedInsights = await healthStorage.saveInsights(result.insights || []);
      
      result.symptoms = savedSymptoms;
      result.sleep = savedSleep;
      result.energy = savedEnergy;
      if (savedScore) {
        result.score = savedScore;
      }
      result.insights = savedInsights;
    }

    res.json(result);
  })
);

/**
 * GET /api/health/symptoms
 * Get symptom events
 */
router.get(
  '/symptoms',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const type = req.query.type as string | undefined;

    const symptoms = await healthStorage.getSymptomEvents(userId, type as any);

    res.json({ symptoms });
  })
);

/**
 * GET /api/health/sleep
 * Get sleep events
 */
router.get(
  '/sleep',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const sleep = await healthStorage.getSleepEvents(userId);

    res.json({ sleep });
  })
);

/**
 * GET /api/health/energy
 * Get energy events
 */
router.get(
  '/energy',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const energy = await healthStorage.getEnergyEvents(userId);

    res.json({ energy });
  })
);

/**
 * GET /api/health/wellness
 * Get latest wellness score
 */
router.get(
  '/wellness',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const score = await healthStorage.getLatestWellnessScore(userId);

    res.json({ wellness: score });
  })
);

/**
 * GET /api/health/insights
 * Get health insights
 */
router.get(
  '/insights',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const type = req.query.type as string | undefined;

    const insights = await healthStorage.getInsights(userId, type);

    res.json({ insights });
  })
);

/**
 * GET /api/health/stats
 * Get health statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await healthStorage.getStats(userId);

    res.json(stats);
  })
);

export default router;
