import { Router } from 'express';

import { getEngineNames } from '../engineRuntime/engineRegistry';
import { EngineOrchestrator } from '../engineRuntime/orchestrator';
import { getEngineResults } from '../engineRuntime/storage';
import { logger } from '../logger';

const router = Router();

/**
 * @swagger
 * /api/engine-runtime/summary:
 *   get:
 *     summary: Run all engines and return results
 *     description: |
 *       Runs all registered engines for the authenticated user and returns results.
 *       Engines run in parallel batches based on dependencies with a concurrency limit.
 *       Results are cached for 24 hours.
 *     tags:
 *       - Engine Runtime
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Engine results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: object
 *                 properties:
 *                   success:
 *                     type: boolean
 *                   data:
 *                     type: object
 *                   duration:
 *                     type: number
 *                   error:
 *                     type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/summary', async (req, res) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const orchestrator = new EngineOrchestrator();
    const results = await orchestrator.runAll(userId);

    res.json(results);
  } catch (error) {
    logger.error({ error }, 'Error running all engines');
    res.status(500).json({ error: 'Failed to run engines' });
  }
});

/**
 * @swagger
 * /api/engine-runtime/summary/cached:
 *   get:
 *     summary: Get cached engine results
 *     description: |
 *       Returns the last cached engine results for the user.
 *       Results expire after 24 hours (TTL).
 *       Returns empty object if no cached results exist or results are stale.
 *     tags:
 *       - Engine Runtime
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cached engine results or empty object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/summary/cached', async (req, res) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const results = await getEngineResults(userId);

    res.json(results || {});
  } catch (error) {
    logger.error({ error }, 'Error fetching cached engine results');
    res.status(500).json({ error: 'Failed to fetch cached results' });
  }
});

/**
 * @swagger
 * /api/engine-runtime/run/{engineName}:
 *   post:
 *     summary: Run a single engine
 *     description: |
 *       Runs a specific engine for the authenticated user.
 *       Engines that need all data (chronology, legacy) automatically request full context.
 *       Results are cached.
 *     tags:
 *       - Engine Runtime
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: engineName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the engine to run (e.g., 'health', 'financial', 'habits')
 *     responses:
 *       200:
 *         description: Engine result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                 duration:
 *                   type: number
 *                 error:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Engine not found
 *       500:
 *         description: Server error
 */
router.post('/run/:engineName', async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { engineName } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const orchestrator = new EngineOrchestrator();
    const result = await orchestrator.runSingle(userId, engineName);

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Error running single engine');
    res.status(500).json({ error: 'Failed to run engine' });
  }
});

/**
 * @swagger
 * /api/engine-runtime/engines:
 *   get:
 *     summary: Get list of all available engines
 *     description: |
 *       Returns a list of all registered engine names.
 *       All engines are fully implemented and ready to use.
 *     tags:
 *       - Engine Runtime
 *     responses:
 *       200:
 *         description: List of engine names
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 engines:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ['health', 'financial', 'habits', 'decisions', 'resilience', 'influence', 'growth', 'legacy', 'values', 'dreams', 'recommendation', 'chronology', 'continuity']
 */
router.get('/engines', async (req, res) => {
  try {
    const engines = getEngineNames();
    res.json({ engines });
  } catch (error) {
    logger.error({ error }, 'Error fetching engine list');
    res.status(500).json({ error: 'Failed to fetch engine list' });
  }
});

export default router;
