/**
 * Chat thread durability — canonical health/repair paths.
 * Legacy: GET /api/diagnostics/thread-health (still active, deprecated).
 */
import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { threadRecoveryService } from '../services/conversationCentered/threadRecoveryService';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccessDual } from '../utils/apiResponse';

const router = Router();

router.get(
  '/health',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const report = await threadRecoveryService.getThreadHealth(req.user!.id);
    sendSuccessDual(res, report as unknown as Record<string, unknown>);
  })
);

router.post(
  '/health/repair',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { repaired } = await threadRecoveryService.repairUser(req.user!.id);
    const report = await threadRecoveryService.getThreadHealth(req.user!.id, repaired);
    sendSuccessDual(res, { repaired, report });
  })
);

export const chatThreadsHealthRouter = router;
