/**
 * Trust Center API — knowledge coverage, states, unknowns, review queue.
 */
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccessDual } from '../utils/apiResponse';
import { buildTrustOverview, getDomainTrustSummary, TRUST_DOMAINS } from '../services/trust/trustCenterService';
import type { TrustDomain } from '../services/trust/trustTypes';

const router = Router();

const domainSchema = z.enum([
  'characters',
  'locations',
  'organizations',
  'projects',
  'goals',
  'skills',
  'communities',
  'relationships',
  'events',
  'households',
]);

/** GET /api/trust/overview — full Trust Center dashboard payload */
router.get(
  '/overview',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const overview = await buildTrustOverview(req.user!.id);
    sendSuccessDual(res, overview as unknown as Record<string, unknown>);
  })
);

/** GET /api/trust/domains — all domain summaries (lighter than full overview) */
router.get(
  '/domains',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const overview = await buildTrustOverview(req.user!.id);
    sendSuccessDual(res, { domains: overview.coverage, overall_coverage_score: overview.overall_coverage_score });
  })
);

/** GET /api/trust/domains/:domain — single Book domain trust summary */
router.get(
  '/domains/:domain',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = domainSchema.safeParse(req.params.domain);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid domain', valid: TRUST_DOMAINS });
      return;
    }
    const summary = await getDomainTrustSummary(req.user!.id, parsed.data as TrustDomain);
    sendSuccessDual(res, summary as unknown as Record<string, unknown>);
  })
);

/** GET /api/trust/review-queue — prioritized review items only */
router.get(
  '/review-queue',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const overview = await buildTrustOverview(req.user!.id);
    sendSuccessDual(res, {
      conflicts: overview.conflicts,
      review_queue: overview.review_queue,
    });
  })
);

/** GET /api/trust/unknowns — gap detection only */
router.get(
  '/unknowns',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const overview = await buildTrustOverview(req.user!.id);
    sendSuccessDual(res, { unknowns: overview.unknowns, count: overview.unknowns.length });
  })
);

export const trustRouter = router;
