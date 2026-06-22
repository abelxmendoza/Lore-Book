import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { narrativeAnchorResolver } from '../services/narrative/narrativeAnchorResolver';
import { narrativeAnchorService } from '../services/narrative/narrativeAnchorService';
import type { NarrativeAnchorType } from '../services/narrative/narrativeAnchorTypes';

const router = Router();

/**
 * GET /api/narrative-anchors
 * List narrative anchors for the authenticated user.
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const anchorType = req.query.type as NarrativeAnchorType | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const anchors = await narrativeAnchorService.listAnchors(userId, { anchorType, limit });
    res.json({ anchors });
  }),
);

/**
 * POST /api/narrative-anchors/rebuild
 * Rebuild anchors from current entity evidence.
 */
router.post(
  '/rebuild',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    logger.info({ userId }, 'Rebuilding narrative anchors');
    const anchors = await narrativeAnchorService.rebuildForUser(userId);
    res.json({ anchors, count: anchors.length });
  }),
);

/**
 * GET /api/narrative-anchors/resolve/:entityId
 * Retrieval chain for an entity-centric query.
 */
router.get(
  '/resolve/:entityId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { entityId } = req.params;
    const name = typeof req.query.name === 'string' ? req.query.name : undefined;

    const chain = await narrativeAnchorResolver.resolveForEntity(userId, entityId, name);
    const contextText = narrativeAnchorResolver.formatRetrievalContext(chain);

    res.json({ chain, contextText });
  }),
);

/**
 * GET /api/narrative-anchors/:id
 * Get a single narrative anchor.
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const anchor = await narrativeAnchorService.getAnchor(userId, req.params.id);

    if (!anchor) {
      res.status(404).json({ error: 'Anchor not found' });
      return;
    }

    res.json({ anchor });
  }),
);

export default router;
