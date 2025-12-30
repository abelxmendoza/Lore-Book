import { Router } from 'express';
import { logger } from '../logger';
import { EngineOrchestrator } from '../engineRuntime/orchestrator';
import { getEngineResults } from '../engineRuntime/storage';
import { getEngineNames } from '../engineRuntime/engineRegistry';

const router = Router();

/**
 * GET /api/engine-runtime/summary
 * Recalculate all engines + return everything
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
 * GET /api/engine-runtime/summary/cached
 * Get last known results (cached)
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
 * POST /api/engine-runtime/run/:engineName
 * Run a single engine
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
 * GET /api/engine-runtime/engines
 * Get list of all available engines
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
