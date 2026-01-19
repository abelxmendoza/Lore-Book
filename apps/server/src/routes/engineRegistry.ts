import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { EngineHealth } from '../services/engineRegistry/engineHealth';
import { EngineRunner } from '../services/engineRegistry/engineRunner';
import { RegistryLoader } from '../services/engineRegistry/registryLoader';

const router = Router();
const runner = new EngineRunner();
const health = new EngineHealth();

/**
 * GET /api/engine-registry/list
 * List all engines
 */
router.get(
  '/list',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    logger.info('Listing all engines');

    const engines = await RegistryLoader.loadAll();

    res.json({ engines });
  })
);

/**
 * GET /api/engine-registry/health/:name
 * Get health for a specific engine
 */
router.get(
  '/health/:name',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { name } = req.params;

    logger.info({ engine: name }, 'Getting engine health');

    const healthRecord = await health.getHealth(name);

    if (!healthRecord) {
      return res.status(404).json({ error: 'Health record not found' });
    }

    res.json(healthRecord);
  })
);

/**
 * GET /api/engine-registry/health
 * Get health for all engines
 */
router.get(
  '/health',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    logger.info('Getting all engine health');

    const healthRecords = await health.getAllHealth();

    res.json({ health: healthRecords });
  })
);

/**
 * POST /api/engine-registry/run/:name
 * Run a specific engine
 */
router.post(
  '/run/:name',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { name } = req.params;
    const context = req.body.context || {};

    logger.info({ engine: name }, 'Running engine');

    const result = await runner.runEngine(name, context);

    res.json({ engine: name, result });
  })
);

/**
 * POST /api/engine-registry/run-all
 * Run all engines in dependency order
 */
router.post(
  '/run-all',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const context = req.body.context || {};

    logger.info('Running all engines');

    const results = await runner.runAll(context);

    res.json({ results });
  })
);

export default router;

