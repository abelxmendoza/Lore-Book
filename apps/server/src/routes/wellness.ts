import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { HealthEngine } from '../services/health/healthEngine';
import { HealthStorage } from '../services/health/healthStorage';

const router = Router();
const healthEngine = new HealthEngine();
const healthStorage = new HealthStorage();

/**
 * POST /api/wellness/analyze
 * Process and analyze health and wellness signals from journal data.
 */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const save = req.body.save !== false;

    logger.info({ userId, save }, 'Analyzing health and wellness');

    const result = await healthEngine.process(userId);

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

router.get(
  '/sleep',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const sleep = await healthStorage.getSleepEvents(userId);
    res.json({ sleep });
  })
);

router.get(
  '/energy',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const energy = await healthStorage.getEnergyEvents(userId);
    res.json({ energy });
  })
);

router.get(
  '/score',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const score = await healthStorage.getLatestWellnessScore(userId);
    res.json({ wellness: score });
  })
);

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
