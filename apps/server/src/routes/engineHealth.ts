/**
 * Engine Health Dashboard API
 * Internal-only tooling for monitoring engine performance
 * NOT exposed to regular users
 */

import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { engineHealthMonitor , sensemakingOrchestrator , ENGINE_DESCRIPTORS, getUIWorthyEngines, getHiddenEngines } from '../services/engineGovernance';

const router = Router();

/**
 * GET /api/internal/engine-health
 * Get health status for all engines
 * Internal-only endpoint
 */
router.get('/health', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // TODO: Add admin check - this should only be accessible to admins
    // For now, just require auth

    const allHealth = engineHealthMonitor.getAllEngineHealth();
    const unhealthy = engineHealthMonitor.getUnhealthyEngines();
    const stale = engineHealthMonitor.getStaleEngines(24);
    const redundancy = engineHealthMonitor.getRedundancyReport();

    res.json({
      engines: allHealth,
      summary: {
        total: allHealth.length,
        healthy: allHealth.filter(h => h.isHealthy).length,
        unhealthy: unhealthy.length,
        stale: stale.length
      },
      unhealthy,
      stale,
      redundancy
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get engine health');
    res.status(500).json({ error: 'Failed to get engine health' });
  }
});

/**
 * GET /api/internal/engine-descriptors
 * Get all engine descriptors (metadata)
 */
router.get('/descriptors', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    res.json({
      engines: ENGINE_DESCRIPTORS,
      uiWorthy: getUIWorthyEngines().map(e => e.name),
      hidden: getHiddenEngines().map(e => e.name)
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get engine descriptors');
    res.status(500).json({ error: 'Failed to get engine descriptors' });
  }
});

/**
 * POST /api/internal/engine-orchestrate
 * Get orchestration decisions for a context
 */
router.post('/orchestrate', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { trigger, recentActivity, currentState } = req.body;

    const decisions = await sensemakingOrchestrator.decideEnginesToRun({
      userId: req.user!.id,
      trigger: trigger || 'manual',
      recentActivity,
      currentState
    });

    res.json({
      decisions,
      visibleEngines: sensemakingOrchestrator.getVisibleEngines(),
      hiddenEngines: sensemakingOrchestrator.getHiddenEngines()
    });
  } catch (error) {
    logger.error({ error }, 'Failed to orchestrate engines');
    res.status(500).json({ error: 'Failed to orchestrate engines' });
  }
});

export const engineHealthRouter = router;
