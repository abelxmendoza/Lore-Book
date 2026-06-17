/**
 * Canonical /api/memory namespace — delegates to existing services.
 * Legacy mounts (/api/omega-memory, /api/memory-recall) remain active with deprecation headers.
 */
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { TenantAccessError } from '../lib/tenantOwnership';
import { omegaMemoryService } from '../services/omegaMemoryService';
import { memoryRecallEngine } from '../services/memoryRecall/memoryRecallEngine';
import { graphRecoveryTrigger } from '../services/conversationCentered/graphRecoveryTrigger';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccessDual } from '../utils/apiResponse';

const router = Router();

const recallSchema = z.object({
  raw_text: z.string().min(1).max(1000),
  persona: z.enum(['DEFAULT', 'ARCHIVIST']).optional(),
  timeframe: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
});

router.get(
  '/entities',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { type } = req.query;
    const entities = await omegaMemoryService.getEntities(req.user!.id, type as never);
    sendSuccessDual(res, { entities });
  })
);

router.get(
  '/entities/:id/claims',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const claims = await omegaMemoryService.getClaimsForEntity(
        req.user!.id,
        req.params.id,
        req.query.active_only !== 'false'
      );
      sendSuccessDual(res, { claims });
    } catch (error) {
      if (error instanceof TenantAccessError) {
        res.status(404).json({ success: false, error: 'Entity not found' });
        return;
      }
      throw error;
    }
  })
);

router.post(
  '/recall',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = recallSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid recall request', details: parsed.error.flatten() });
      return;
    }
    const result = await memoryRecallEngine.executeRecall({
      raw_text: parsed.data.raw_text,
      user_id: req.user!.id,
      persona: parsed.data.persona || 'DEFAULT',
      timeframe: parsed.data.timeframe,
    });
    sendSuccessDual(res, result as unknown as Record<string, unknown>);
  })
);

router.get(
  '/coverage',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { buildMemoryCoverageAudit } = await import('../services/diagnostics/memoryCoverageAudit');
    const report = await buildMemoryCoverageAudit(req.user!.id);
    sendSuccessDual(res, report as unknown as Record<string, unknown>);
  })
);

router.get(
  '/graph-recovery',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const last = graphRecoveryTrigger.getLastRun(userId);
    sendSuccessDual(res, { userId, lastRun: last, ran: last !== null });
  })
);

router.post(
  '/graph-recovery/run',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await graphRecoveryTrigger.runNow(req.user!.id);
    sendSuccessDual(res, result as unknown as Record<string, unknown>);
  })
);

router.post(
  '/ingest',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { text, source } = req.body ?? {};
    if (!text || typeof text !== 'string') {
      res.status(400).json({ success: false, error: 'Text is required' });
      return;
    }
    const result = await omegaMemoryService.ingestText(req.user!.id, text, source || 'USER');
    sendSuccessDual(res, result as unknown as Record<string, unknown>);
  })
);

export const memoryNamespaceRouter = router;
