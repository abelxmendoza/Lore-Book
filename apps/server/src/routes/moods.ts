import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();

/**
 * POST /api/moods/score
 * Returns a simple mood score from text. Used by useMoodEngine.
 * (Same logic as /api/notebook/moods/score for compatibility with frontend.)
 */
router.post('/score', requireAuth, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({ text: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const normalized = (parsed.data.text ?? '').toLowerCase();
  const positive = (normalized.match(/(calm|hope|progress|win|light)/g) ?? []).length;
  const negative = (normalized.match(/(tired|angry|sad|lost|fear)/g) ?? []).length;
  const score = Math.max(-5, Math.min(5, positive - negative));

  res.json({ mood: score });
});

export const moodsRouter = router;
