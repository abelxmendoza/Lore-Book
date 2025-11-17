import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { chapterService } from '../services/chapterService';
import { memoryService } from '../services/memoryService';

const router = Router();

router.get('/arcs/suggestions', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { text } = req.query;
  const content = typeof text === 'string' ? text : '';
  const chapters = await chapterService.listChapters(req.user!.id);
  const normalized = content.toLowerCase();

  const arcs = chapters
    .map((chapter) => {
      const confidence = Math.min(
        0.95,
        (content.length / 500) * 0.4 + (chapter.title ? (normalized.includes(chapter.title.toLowerCase()) ? 0.3 : 0) : 0.1)
      );
      return {
        id: chapter.id,
        title: chapter.title,
        rationale: chapter.summary ?? 'Feels thematically related to this arc.',
        confidence
      };
    })
    .filter((arc) => arc.confidence > 0.2)
    .slice(0, 5);

  res.json({ arcs });
});

router.post('/moods/score', requireAuth, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({ text: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const normalized = parsed.data.text?.toLowerCase() ?? '';
  const positive = (normalized.match(/(calm|hope|progress|win|light)/g) ?? []).length;
  const negative = (normalized.match(/(tired|angry|sad|lost|fear)/g) ?? []).length;
  const score = Math.max(-5, Math.min(5, positive - negative));

  res.json({ mood: score });
});

router.post('/memory-preview', requireAuth, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({ text: z.string().optional(), tags: z.array(z.string()).optional(), characters: z.array(z.string()).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const previews = await memoryService.searchEntries(req.user!.id, {
    search: parsed.data.text ?? parsed.data.tags?.[0] ?? undefined,
    limit: 5
  });

  res.json({ previews });
});

export const notebookRouter = router;
