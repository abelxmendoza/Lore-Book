import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { ContextEngine } from '../services/context/contextEngine';
import type { ContextScope } from '../services/context/types';

const router = Router();
const contextEngine = new ContextEngine();

/**
 * GET /api/context
 * Get full context for a moment in time
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const date = req.query.date as string | undefined;
    const scope = (req.query.scope as ContextScope) || 'week';
    const include = req.query.include
      ? (req.query.include as string).split(',')
      : undefined;
    const exclude = req.query.exclude
      ? (req.query.exclude as string).split(',')
      : undefined;

    const context = await contextEngine.getContext({
      userId,
      date,
      scope,
      include,
      exclude,
    });

    res.json(context);
  })
);

/**
 * GET /api/context/temporal
 * Get only temporal context
 */
router.get(
  '/temporal',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const date = req.query.date as string | undefined;
    const scope = (req.query.scope as ContextScope) || 'week';

    const context = await contextEngine.getContext({
      userId,
      date,
      scope,
      include: ['temporal'],
      exclude: [],
    });

    res.json(context.temporal);
  })
);

/**
 * GET /api/context/emotional
 * Get only emotional context
 */
router.get(
  '/emotional',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const date = req.query.date as string | undefined;
    const scope = (req.query.scope as ContextScope) || 'week';

    const context = await contextEngine.getContext({
      userId,
      date,
      scope,
      include: ['emotional'],
      exclude: [],
    });

    res.json(context.emotional);
  })
);

export default router;

