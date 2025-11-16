import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { correctionService } from '../services/correctionService';

const router = Router();

const correctionSchema = z.object({
  correctedContent: z.string().min(3),
  note: z.string().optional(),
  reason: z.string().optional()
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
