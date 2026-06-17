/**
 * Career API — aggregated career summary read model.
 */
import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { careerSummaryService } from '../services/career/careerSummaryService';

const router = Router();

/** GET /api/career/summary */
router.get(
  '/summary',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const summary = await careerSummaryService.getSummary(req.user!.id);
    res.json({ success: true, summary });
  })
);

export const careerRouter = router;
