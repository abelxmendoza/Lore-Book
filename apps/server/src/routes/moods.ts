import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Weighted word lists — scored by intensity, not raw keyword match.
// Positive words weighted +1 each; mild negatives -1; strong negatives -2.
// Deliberately excludes words a user might quote or reference rather than feel
// (e.g. "angry" alone is too easily self-referential).

const POSITIVE = /\b(calm|hope|hopeful|happy|excited|progress|proud|grateful|grateful|win|winning|love|light|great|amazing|wonderful|motivated|inspired|energized|confident|peaceful|joyful|relieved)\b/g;

const MILD_NEGATIVE = /\b(tired|frustrated|frustrating|annoyed|annoying|irritated|irritating|stuck|struggling|confused|worried|stressed|stressed|concerned|anxious|uneasy|disappointed|discouraged|drained|overwhelmed|meh|blah)\b/g;

const STRONG_NEGATIVE = /\b(furious|rage|raging|devastated|hopeless|despair|hate|terrified|miserable|awful|horrible|unbearable|crushed|broken|defeated|worthless)\b/g;

/**
 * POST /api/moods/score
 * Returns a mood score (-5 to 5) and label from text.
 */
router.post('/score', requireAuth, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({ text: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const normalized = (parsed.data.text ?? '').toLowerCase();
  const pos = (normalized.match(POSITIVE) ?? []).length;
  const mildNeg = (normalized.match(MILD_NEGATIVE) ?? []).length;
  const strongNeg = (normalized.match(STRONG_NEGATIVE) ?? []).length;

  const raw = pos - mildNeg - strongNeg * 2;
  const score = Math.max(-5, Math.min(5, raw));

  // Map numeric score to a human label
  let label: string;
  if (score >= 3) label = 'great';
  else if (score >= 1) label = 'good';
  else if (score === 0) label = 'neutral';
  else if (score >= -1) label = 'annoyed';
  else if (score >= -3) label = 'frustrated';
  else label = 'distressed';

  res.json({ mood: score, label });
});

export const moodsRouter = router;
