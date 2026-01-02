import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { ManifestService } from '../services/engineManifest/manifestService';
import { ManifestSync } from '../services/engineManifest/manifestSync';
import { ManifestSearch } from '../services/engineManifest/manifestSearch';

const router = Router();
const manifestService = new ManifestService();
const manifestSync = new ManifestSync();
const manifestSearch = new ManifestSearch();

/**
 * GET /api/engines/list
 * List all engines
 */
router.get(
  '/list',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    logger.info('Listing engines');

    const engines = await manifestService.listEngines();

    res.json({ engines });
  })
);

/**
 * GET /api/engines/search
 * Search engines by query
 */
router.get(
  '/search',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const query = req.query.q as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    logger.info({ query, limit }, 'Searching engines');

    const results = await manifestSearch.search(query, limit);

    res.json({ results });
  })
);

/**
 * GET /api/engines/get-blueprint/:name
 * Get blueprint for an engine
 */
router.get(
  '/get-blueprint/:name',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { name } = req.params;

    logger.info({ engine: name }, 'Getting blueprint');

    const blueprint = await manifestService.getBlueprint(name);

    if (!blueprint) {
      return res.status(404).json({ error: 'Blueprint not found' });
    }

    res.json({ name, blueprint });
  })
);

/**
 * POST /api/engines/sync
 * Sync local blueprints to Supabase and create embeddings
 */
router.post(
  '/sync',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    logger.info('Syncing engine manifest');

    // Run sync in background (don't wait)
    manifestSync.sync().catch(error => {
      logger.error({ error }, 'Background sync failed');
    });

    res.json({ message: 'Sync started', status: 'processing' });
  })
);

export default router;

