import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { EQEngine } from '../services/emotionalIntelligence/eqEngine';
import { EQStorage } from '../services/emotionalIntelligence/eqStorage';

const router = Router();
const eqEngine = new EQEngine();
const eqStorage = new EQStorage();

/**
 * POST /api/emotion/eq/analyze
 * Process and analyze emotional intelligence
 */
router.post(
  '/eq/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const save = req.body.save !== false;

    logger.info({ userId, save }, 'Analyzing emotional intelligence');

    const result = await eqEngine.process(userId);

    // Save if requested
    if (save) {
      const savedSignals = await eqStorage.saveEmotionSignals(result.signals);
      const savedTriggers = await eqStorage.saveTriggerEvents(result.triggers);
      const savedReactions = await eqStorage.saveReactionPatterns(result.reactions);
      const savedScore = await eqStorage.saveRegulationScore(userId, result.regulation);
      const savedInsights = await eqStorage.saveInsights(result.insights);
      
      result.signals = savedSignals;
      result.triggers = savedTriggers;
      result.reactions = savedReactions;
      if (savedScore) {
        result.regulation = savedScore;
      }
      result.insights = savedInsights;
    }

    res.json(result);
  })
);

/**
 * GET /api/emotion/signals
 * Get emotion signals
 */
router.get(
  '/signals',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const emotion = req.query.emotion as string | undefined;

    const signals = await eqStorage.getEmotionSignals(userId, emotion as any);

    res.json({ signals });
  })
);

/**
 * GET /api/emotion/triggers
 * Get trigger events
 */
router.get(
  '/triggers',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const triggerType = req.query.triggerType as string | undefined;

    const triggers = await eqStorage.getTriggerEvents(userId, triggerType as any);

    res.json({ triggers });
  })
);

/**
 * GET /api/emotion/reactions
 * Get reaction patterns
 */
router.get(
  '/reactions',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const type = req.query.type as string | undefined;

    const reactions = await eqStorage.getReactionPatterns(userId, type as any);

    res.json({ reactions });
  })
);

/**
 * GET /api/emotion/regulation
 * Get latest regulation score
 */
router.get(
  '/regulation',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const score = await eqStorage.getLatestRegulationScore(userId);

    res.json({ regulation: score });
  })
);

/**
 * GET /api/emotion/insights
 * Get EQ insights
 */
router.get(
  '/insights',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const type = req.query.type as string | undefined;
    const emotion = req.query.emotion as string | undefined;

    const insights = await eqStorage.getInsights(userId, type, emotion as any);

    res.json({ insights });
  })
);

/**
 * GET /api/emotion/stats
 * Get EQ statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await eqStorage.getStats(userId);

    res.json(stats);
  })
);

export default router;

