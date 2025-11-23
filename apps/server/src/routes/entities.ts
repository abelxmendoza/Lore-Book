import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { EntityResolver } from '../services/entities/entityResolver';
import { EntityStorage } from '../services/entities/storageService';

const router = Router();
const resolver = new EntityResolver();
const storage = new EntityStorage();

/**
 * POST /api/entities/resolve
 * Resolve entities from journal entries
 */
router.post(
  '/resolve',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const context = {
      entries: req.body.entries || req.body.context?.entries || [],
      user: { id: userId },
    };

    logger.info({ userId, entries: context.entries.length }, 'Resolving entities');

    const resolved = await resolver.process(context);

    res.json({ entities: resolved });
  })
);

/**
 * GET /api/entities
 * Get all entities for user
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const type = req.query.type as string | undefined;

    logger.info({ userId, type }, 'Getting entities');

    let entities = await storage.loadAll(userId);

    if (type) {
      entities = entities.filter(e => e.type === type);
    }

    res.json({ entities });
  })
);

/**
 * GET /api/entities/:id
 * Get specific entity
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { id } = req.params;

    const entities = await storage.loadAll(userId);
    const entity = entities.find(e => e.id === id);

    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    res.json({ entity });
  })
);

export default router;

