import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { RelationshipDynamicsEngine } from '../services/relationshipDynamics/relationshipEngine';

const router = Router();
const relationshipEngine = new RelationshipDynamicsEngine();

/**
 * POST /api/relationship-dynamics/analyze
 * Analyze relationship for a person
 */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { personName, lookbackMonths, save } = req.body;

    if (!personName) {
      return res.status(400).json({
        error: 'personName is required',
      });
    }

    logger.info({ userId, personName, lookbackMonths }, 'Analyzing relationship');

    const dynamics = await relationshipEngine.analyzeRelationship(
      userId,
      personName,
      lookbackMonths || 12,
      save !== false
    );

    if (!dynamics) {
      return res.status(404).json({
        error: 'No relationship data found for this person',
      });
    }

    res.json(dynamics);
  })
);

/**
 * GET /api/relationship-dynamics/:personName
 * Get relationship dynamics for a person
 */
router.get(
  '/:personName',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const personName = decodeURIComponent(req.params.personName);

    const dynamics = await relationshipEngine.getRelationshipDynamics(userId, personName);

    if (!dynamics) {
      return res.status(404).json({
        error: 'Relationship dynamics not found',
      });
    }

    res.json(dynamics);
  })
);

/**
 * GET /api/relationship-dynamics
 * Get all relationships
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const health = req.query.health as string | undefined;
    const stage = req.query.stage as string | undefined;

    let relationships;

    if (health) {
      relationships = await relationshipEngine.getRelationshipsByHealth(userId, health as any);
    } else if (stage) {
      relationships = await relationshipEngine.getRelationshipsByStage(userId, stage as any);
    } else {
      relationships = await relationshipEngine.getAllRelationships(userId);
    }

    res.json({ relationships });
  })
);

/**
 * GET /api/relationship-dynamics/insights
 * Get relationship insights
 */
router.get(
  '/insights',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const insights = await relationshipEngine.generateInsights(userId);

    res.json({ insights });
  })
);

/**
 * GET /api/relationship-dynamics/stats
 * Get relationship statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await relationshipEngine.getStats(userId);

    res.json(stats);
  })
);

export default router;

