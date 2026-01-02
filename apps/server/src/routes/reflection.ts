import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { ReflectionEngine } from '../services/reflection/reflectionEngine';
import { ReflectionStorage } from '../services/reflection/reflectionStorage';

const router = Router();
const reflectionEngine = new ReflectionEngine();
const reflectionStorage = new ReflectionStorage();

/**
 * POST /api/reflection/analyze
 * Process and analyze reflections
 */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const save = req.body.save !== false;

    logger.info({ userId, save }, 'Analyzing reflections');

    const result = await reflectionEngine.process(userId);

    if (save) {
      await reflectionStorage.saveReflections(result.reflections);
      await reflectionStorage.saveInsights(result.insights || []);
    }

    res.json(result);
  })
);

/**
 * GET /api/reflection/reflections
 * Get reflections for user
 */
router.get(
  '/reflections',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const type = req.query.type as string | undefined;

    const reflections = await reflectionStorage.getReflections(userId, type);

    res.json({ reflections });
  })
);

export default router;

