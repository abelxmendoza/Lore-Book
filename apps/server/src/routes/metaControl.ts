// =====================================================
// META CONTROL API ROUTES
// Purpose: API endpoints for meaning overrides
// =====================================================

import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { metaControlService } from '../services/metaControlService';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

/**
 * POST /api/meta/override
 * Create a meta override
 */
router.post(
  '/override',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      scope: z.enum(['EVENT', 'PATTERN', 'ENTITY', 'TIME_RANGE', 'GLOBAL']),
      target_id: z.string().uuid().optional(),
      override_type: z.enum([
        'NOT_IMPORTANT',
        'JUST_VENTING',
        'OUTDATED',
        'MISINTERPRETED',
        'DO_NOT_TRACK_PATTERN',
        'LOWER_CONFIDENCE',
        'ARCHIVE',
      ]),
      user_note: z.string().optional(),
    });

    const body = schema.parse(req.body);
    const userId = req.user!.id;

    const override = await metaControlService.createMetaOverride(userId, body);

    res.json({
      success: true,
      override,
    });
  })
);

/**
 * GET /api/meta/overrides
 * List all meta overrides for user
 */
router.get(
  '/overrides',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      scope: z.enum(['EVENT', 'PATTERN', 'ENTITY', 'TIME_RANGE', 'GLOBAL']).optional(),
    });

    const query = schema.parse({
      scope: req.query.scope,
    });

    const userId = req.user!.id;

    const overrides = await metaControlService.listMetaOverrides(
      userId,
      query.scope
    );

    res.json({
      success: true,
      overrides,
    });
  })
);

/**
 * POST /api/meta/override/:id/revert
 * Revert a meta override
 */
router.post(
  '/override/:id/revert',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const userId = req.user!.id;

    await metaControlService.revertMetaOverride(id, userId);

    res.json({
      success: true,
      message: 'Override reverted',
    });
  })
);

/**
 * GET /api/meta/override/check
 * Check if a target has specific overrides
 */
router.get(
  '/override/check',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      scope: z.enum(['EVENT', 'PATTERN', 'ENTITY', 'TIME_RANGE', 'GLOBAL']),
      target_id: z.string().uuid(),
      override_type: z
        .enum([
          'NOT_IMPORTANT',
          'JUST_VENTING',
          'OUTDATED',
          'MISINTERPRETED',
          'DO_NOT_TRACK_PATTERN',
          'LOWER_CONFIDENCE',
          'ARCHIVE',
        ])
        .optional(),
    });

    const query = schema.parse({
      scope: req.query.scope,
      target_id: req.query.target_id,
      override_type: req.query.override_type,
    });

    const userId = req.user!.id;

    if (query.override_type) {
      const hasOverride = await metaControlService.hasOverride(
        userId,
        query.target_id,
        query.scope,
        query.override_type
      );
      res.json({
        success: true,
        has_override: hasOverride,
      });
    } else {
      const overrides = await metaControlService.getOverridesForTarget(
        userId,
        query.target_id,
        query.scope
      );
      res.json({
        success: true,
        overrides,
      });
    }
  })
);

export default router;

