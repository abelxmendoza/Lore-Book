import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { CreativeEngine } from '../services/creative/creativeEngine';
import { CreativeStorage } from '../services/creative/creativeStorage';

const router = Router();
const creativeEngine = new CreativeEngine();
const creativeStorage = new CreativeStorage();

/**
 * POST /api/creative/analyze
 * Process and analyze creative output
 */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const save = req.body.save !== false;

    logger.info({ userId, save }, 'Analyzing creative output');

    const result = await creativeEngine.process(userId);

    // Save if requested
    if (save) {
      const savedEvents = await creativeStorage.saveCreativeEvents(result.events);
      const savedFlow = await creativeStorage.saveFlowStates(result.flowStates);
      const savedBlocks = await creativeStorage.saveCreativeBlocks(result.blocks);
      const savedInspiration = await creativeStorage.saveInspirationSources(result.inspiration);
      const savedProjects = await creativeStorage.saveProjectLifecycles(result.projectStages);
      const savedScore = await creativeStorage.saveCreativeScore(userId, result.score);
      const savedInsights = await creativeStorage.saveInsights(result.insights || []);
      
      result.events = savedEvents;
      result.flowStates = savedFlow;
      result.blocks = savedBlocks;
      result.inspiration = savedInspiration;
      result.projectStages = savedProjects;
      if (savedScore) {
        result.score = savedScore;
      }
      result.insights = savedInsights;
    }

    res.json(result);
  })
);

/**
 * GET /api/creative/events
 * Get creative events
 */
router.get(
  '/events',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const medium = req.query.medium as string | undefined;

    const events = await creativeStorage.getCreativeEvents(userId, medium as any);

    res.json({ events });
  })
);

/**
 * GET /api/creative/flow
 * Get flow states
 */
router.get(
  '/flow',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const medium = req.query.medium as string | undefined;

    const flowStates = await creativeStorage.getFlowStates(userId, medium as any);

    res.json({ flowStates });
  })
);

/**
 * GET /api/creative/blocks
 * Get creative blocks
 */
router.get(
  '/blocks',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const type = req.query.type as string | undefined;
    const resolved = req.query.resolved === 'true' ? true : req.query.resolved === 'false' ? false : undefined;

    const blocks = await creativeStorage.getCreativeBlocks(userId, type as any, resolved);

    res.json({ blocks });
  })
);

/**
 * GET /api/creative/score
 * Get latest creative score
 */
router.get(
  '/score',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const score = await creativeStorage.getLatestCreativeScore(userId);

    res.json({ score });
  })
);

/**
 * GET /api/creative/stats
 * Get creative statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await creativeStorage.getStats(userId);

    res.json(stats);
  })
);

export default router;

