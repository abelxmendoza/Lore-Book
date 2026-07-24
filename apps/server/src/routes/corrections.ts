import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { correctionDashboardService } from '../services/correctionDashboardService';
import { correctionService } from '../services/correctionService';
import { applyPreviewCorrections } from '../services/corrections/correctionApplicationService';

const router = Router();

const correctionSchema = z.object({
  correctedContent: z.string().min(3),
  note: z.string().optional(),
  reason: z.string().optional()
});

const correctedSpanSchema = z.object({
  id: z.string(),
  text: z.string(),
  start: z.number(),
  end: z.number(),
  originalType: z.string(),
  correctedType: z.string().optional(),
  originalSubtype: z.string().optional(),
  correctedSubtype: z.string().optional(),
  colorKey: z.string().optional(),
  entityStatus: z.enum(['known', 'new', 'ignored', 'wrong', 'confirmed']),
  linkedEntityId: z.string().optional(),
  linkedEntityName: z.string().optional(),
  linkedEntityType: z.string().optional(),
  parentEntityId: z.string().optional(),
  parentEntityName: z.string().optional(),
  parentEntityType: z.string().optional(),
  displayNameOverride: z.string().optional(),
  correctionAction: z.string(),
  confidence: z.number().optional(),
  confidenceOverride: z.number().optional(),
  sensitive: z.boolean().optional(),
  requiresReview: z.boolean().optional(),
  userConfirmed: z.boolean().optional(),
  correctionSource: z.enum(['composer', 'chat_chip', 'review_page']),
  parentContext: z.string().optional(),
});

const applyPreviewSchema = z.object({
  messageId: z.string().min(1),
  threadId: z.string().optional(),
  text: z.string().min(1),
  corrections: z.array(correctedSpanSchema),
});

router.post('/apply-preview', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = applyPreviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const result = await applyPreviewCorrections({
    userId: req.user!.id,
    messageId: parsed.data.messageId,
    threadId: parsed.data.threadId,
    text: parsed.data.text,
    corrections: parsed.data.corrections,
  });

  res.json(result);
});

/**
 * GET /api/corrections/contradictions
 * Discovery Hub badge endpoint — open contradictions for the user.
 * Mounted here (not only under /api/correction-dashboard) so discovery
 * summary can call a stable public path. Missing tables → empty list.
 */
router.get('/contradictions', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const contradictions = await correctionDashboardService.listOpenContradictions(userId);
  res.json({ success: true, contradictions });
});

router.get('/:entryId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { entryId } = req.params;
  const entry = await correctionService.getEntryWithCorrections(req.user!.id, entryId);
  if (!entry) {
    return res.status(404).json({ error: 'Entry not found' });
  }
  res.json({ entry, corrections: entry.corrections ?? [] });
});

router.post('/:entryId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { entryId } = req.params;
  const parsed = correctionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  try {
    const correction = await correctionService.addCorrection(req.user!.id, entryId, parsed.data);
    const entry = await correctionService.getEntryWithCorrections(req.user!.id, entryId);
    res.status(201).json({ correction, entry });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to save correction' });
  }
});

export const correctionsRouter = router;
