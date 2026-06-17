/**
 * Canonical governance namespace — contradictions, alerts, belief reconciliation.
 * Legacy mounts remain active with deprecation headers.
 */
import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { contradictionEngine } from '../services/contradiction/contradictionEngine';
import { contradictionAlertService } from '../services/contradictionAlertService';
import { beliefRealityReconciliationService } from '../services/beliefRealityReconciliationService';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccessDual } from '../utils/apiResponse';

const router = Router();

/** Unified dashboard payload for Discovery / Continuity surfaces. */
router.get(
  '/summary',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const [report, alerts, resolutions] = await Promise.all([
      contradictionEngine.getReport(userId).catch(() => ({ contradictions: [], resolved: [] })),
      contradictionAlertService.getActiveAlerts(userId, 10).catch(() => []),
      beliefRealityReconciliationService.getResolutionsForUser(userId).catch(() => []),
    ]);
    sendSuccessDual(res, {
      contradictions: report,
      alerts,
      beliefResolutions: resolutions,
    });
  })
);

router.get(
  '/contradictions',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    let report = await contradictionEngine.getReport(userId);
    if (report.contradictions.length === 0 || req.query.detect === 'true') {
      await contradictionEngine.detect(userId);
      report = await contradictionEngine.getReport(userId);
    }
    sendSuccessDual(res, report as unknown as Record<string, unknown>);
  })
);

router.post(
  '/contradictions/detect',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const summary = await contradictionEngine.detect(req.user!.id);
    sendSuccessDual(res, summary as unknown as Record<string, unknown>);
  })
);

router.get(
  '/alerts',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const limit = parseInt(String(req.query.limit ?? '10'), 10);
    const alerts = await contradictionAlertService.getActiveAlerts(req.user!.id, limit);
    sendSuccessDual(res, { alerts, count: alerts.length });
  })
);

router.get(
  '/beliefs',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const resolutions = await beliefRealityReconciliationService.getResolutionsForUser(
      req.user!.id,
      req.query.status as never
    );
    sendSuccessDual(res, { resolutions });
  })
);

export const governanceRouter = router;
