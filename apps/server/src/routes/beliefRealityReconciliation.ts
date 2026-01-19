import { Router } from 'express';

import { logger } from '../logger';
import { beliefRealityReconciliationService } from '../services/beliefRealityReconciliationService';
import type { BeliefResolutionStatus } from '../services/beliefRealityReconciliationService';

const router = Router();

/**
 * GET /api/belief-reconciliation/resolutions
 * Get all belief resolutions for user
 */
router.get('/resolutions', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const status = req.query.status as BeliefResolutionStatus | undefined;
    const resolutions = await beliefRealityReconciliationService.getResolutionsForUser(
      userId,
      status
    );

    return res.json({ success: true, resolutions });
  } catch (error) {
    logger.error({ error }, 'Failed to get belief resolutions');
    return res.status(500).json({ error: 'Failed to get belief resolutions' });
  }
});

/**
 * GET /api/belief-reconciliation/resolution/:beliefUnitId
 * Get resolution for a specific belief
 */
router.get('/resolution/:beliefUnitId', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { beliefUnitId } = req.params;
    const resolution = await beliefRealityReconciliationService.getResolutionForBelief(
      userId,
      beliefUnitId
    );

    if (!resolution) {
      return res.status(404).json({ error: 'Resolution not found' });
    }

    return res.json({ success: true, resolution });
  } catch (error) {
    logger.error({ error }, 'Failed to get belief resolution');
    return res.status(500).json({ error: 'Failed to get belief resolution' });
  }
});

/**
 * POST /api/belief-reconciliation/evaluate/:beliefUnitId
 * Manually trigger evaluation of a belief
 */
router.post('/evaluate/:beliefUnitId', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { beliefUnitId } = req.params;

    // Get the belief unit
    const { supabaseAdmin } = await import('../services/supabaseClient');
    const { data: beliefUnit, error: fetchError } = await supabaseAdmin
      .from('knowledge_units')
      .select('*')
      .eq('id', beliefUnitId)
      .eq('user_id', userId)
      .eq('knowledge_type', 'BELIEF')
      .single();

    if (fetchError || !beliefUnit) {
      return res.status(404).json({ error: 'Belief unit not found' });
    }

    const resolution = await beliefRealityReconciliationService.evaluateBelief(
      userId,
      beliefUnit
    );

    return res.json({ success: true, resolution });
  } catch (error) {
    logger.error({ error }, 'Failed to evaluate belief');
    return res.status(500).json({ error: 'Failed to evaluate belief' });
  }
});

/**
 * POST /api/belief-reconciliation/abandon/:beliefUnitId
 * Manually abandon a belief
 */
router.post('/abandon/:beliefUnitId', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { beliefUnitId } = req.params;
    const { note } = req.body;

    const resolution = await beliefRealityReconciliationService.abandonBelief(
      userId,
      beliefUnitId,
      note
    );

    return res.json({ success: true, resolution });
  } catch (error) {
    logger.error({ error }, 'Failed to abandon belief');
    return res.status(500).json({ error: 'Failed to abandon belief' });
  }
});

/**
 * POST /api/belief-reconciliation/reevaluate-all
 * Re-evaluate all beliefs (background job)
 */
router.post('/reevaluate-all', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Fire-and-forget: return immediately, process in background
    beliefRealityReconciliationService.reevaluateAllBeliefs(userId).catch(err => {
      logger.error({ error: err, userId }, 'Background belief re-evaluation failed');
    });

    return res.json({ 
      success: true, 
      message: 'Belief re-evaluation started in background' 
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start belief re-evaluation');
    return res.status(500).json({ error: 'Failed to start belief re-evaluation' });
  }
});

export default router;

