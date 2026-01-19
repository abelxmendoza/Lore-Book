import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { LocationResolver } from '../services/locations/locationResolver';
import { LocationStorage } from '../services/locations/storageService';

const router = Router();
const resolver = new LocationResolver();
const storage = new LocationStorage();

/**
 * POST /api/locations/resolve
 * Resolve locations from journal entries
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

    logger.info({ userId, entries: context.entries.length }, 'Resolving locations');

    const resolved = await resolver.process(context);

    res.json({ locations: resolved });
  })
);

/**
 * GET /api/locations
 * Get all locations for user
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const type = req.query.type as string | undefined;

    logger.info({ userId, type }, 'Getting locations');

    let locations = await storage.loadAll(userId);

    if (type) {
      locations = locations.filter(l => l.type === type);
    }

    res.json({ locations });
  })
);

/**
 * GET /api/locations/:id
 * Get specific location
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { id } = req.params;

    const locations = await storage.loadAll(userId);
    const location = locations.find(l => l.id === id);

    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    res.json({ location });
  })
);

export default router;

