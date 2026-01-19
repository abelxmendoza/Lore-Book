// =====================================================
// CORRECTION DASHBOARD API ROUTES
// Purpose: API endpoints for correction & pruning dashboard
// =====================================================

import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { correctionDashboardService } from '../services/correctionDashboardService';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

/**
 * GET /api/corrections/dashboard
 * Get all correction dashboard data
 */
router.get(
  '/dashboard',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    try {
      const data = await correctionDashboardService.getCorrectionDashboardData(userId);
      res.json({ success: true, data });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get correction dashboard data');
      res.status(500).json({ success: false, error: 'Failed to fetch dashboard data' });
    }
  })
);

/**
 * GET /api/corrections/records
 * List correction records
 */
router.get(
  '/records',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    try {
      const records = await correctionDashboardService.listCorrectionRecords(userId);
      res.json({ success: true, records });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to list correction records');
      res.status(500).json({ success: false, error: 'Failed to fetch correction records' });
    }
  })
);

/**
 * GET /api/corrections/deprecated
 * List deprecated units
 */
router.get(
  '/deprecated',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    try {
      const units = await correctionDashboardService.listDeprecatedUnits(userId);
      res.json({ success: true, units });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to list deprecated units');
      res.status(500).json({ success: false, error: 'Failed to fetch deprecated units' });
    }
  })
);

/**
 * GET /api/corrections/contradictions
 * List open contradictions
 */
router.get(
  '/contradictions',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    try {
      const contradictions = await correctionDashboardService.listOpenContradictions(userId);
      res.json({ success: true, contradictions });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to list contradictions');
      res.status(500).json({ success: false, error: 'Failed to fetch contradictions' });
    }
  })
);

/**
 * POST /api/corrections/deprecated/:unitId/prune
 * Prune a deprecated unit
 */
router.post(
  '/deprecated/:unitId/prune',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { unitId } = req.params;
    const userId = req.user!.id;

    const schema = z.object({
      reason: z.string().min(1).max(500),
    });

    const { reason } = schema.parse(req.body);

    try {
      await correctionDashboardService.pruneDeprecatedUnit(userId, unitId, reason);
      res.json({ success: true, message: 'Unit pruned successfully' });
    } catch (error) {
      logger.error({ error, userId, unitId }, 'Failed to prune unit');
      res.status(500).json({ success: false, error: 'Failed to prune unit' });
    }
  })
);

/**
 * POST /api/corrections/deprecated/:unitId/restore
 * Restore a deprecated unit
 */
router.post(
  '/deprecated/:unitId/restore',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { unitId } = req.params;
    const userId = req.user!.id;

    try {
      await correctionDashboardService.restoreDeprecatedUnit(userId, unitId);
      res.json({ success: true, message: 'Unit restored successfully' });
    } catch (error) {
      logger.error({ error, userId, unitId }, 'Failed to restore unit');
      res.status(500).json({ success: false, error: 'Failed to restore unit' });
    }
  })
);

/**
 * POST /api/corrections/contradictions/:id/resolve
 * Resolve a contradiction
 */
router.post(
  '/contradictions/:id/resolve',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const userId = req.user!.id;

    const schema = z.object({
      resolution_action: z.enum([
        'MARK_CONTEXTUAL',
        'DEPRECATE_UNIT_A',
        'DEPRECATE_UNIT_B',
        'LOWER_CONFIDENCE',
        'IGNORE_CONTRADICTION',
      ]),
      reason: z.string().optional(),
    });

    const { resolution_action, reason } = schema.parse(req.body);

    try {
      await correctionDashboardService.resolveContradiction(
        userId,
        id,
        resolution_action,
        reason
      );
      res.json({ success: true, message: 'Contradiction resolved successfully' });
    } catch (error) {
      logger.error({ error, userId, contradictionId: id }, 'Failed to resolve contradiction');
      res.status(500).json({ success: false, error: 'Failed to resolve contradiction' });
    }
  })
);

/**
 * POST /api/corrections/units/:unitId/correct
 * Manually correct a unit
 */
router.post(
  '/units/:unitId/correct',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { unitId } = req.params;
    const userId = req.user!.id;

    const schema = z.object({
      corrected_text: z.string().min(1).max(5000),
      reason: z.string().min(1).max(500),
    });

    const { corrected_text, reason } = schema.parse(req.body);

    try {
      await correctionDashboardService.manuallyCorrectUnit(userId, unitId, corrected_text, reason);
      res.json({ success: true, message: 'Unit corrected successfully' });
    } catch (error) {
      logger.error({ error, userId, unitId }, 'Failed to correct unit');
      res.status(500).json({ success: false, error: 'Failed to correct unit' });
    }
  })
);

/**
 * GET /api/corrections/target/:targetType/:targetId
 * Get corrections for a specific target (for chat context)
 */
router.get(
  '/target/:targetType/:targetId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { targetType, targetId } = req.params;
    const userId = req.user!.id;

    if (!['CLAIM', 'UNIT', 'EVENT', 'ENTITY'].includes(targetType)) {
      return res.status(400).json({ success: false, error: 'Invalid target type' });
    }

    try {
      const corrections = await correctionDashboardService.getCorrectionsForTarget(
        userId,
        targetType as 'CLAIM' | 'UNIT' | 'EVENT' | 'ENTITY',
        targetId
      );
      res.json({ success: true, corrections });
    } catch (error) {
      logger.error({ error, userId, targetType, targetId }, 'Failed to get corrections for target');
      res.status(500).json({ success: false, error: 'Failed to fetch corrections' });
    }
  })
);

export default router;

