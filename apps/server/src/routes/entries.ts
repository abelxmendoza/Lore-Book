import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { memoryService } from '../services/memoryService';
import { tagService } from '../services/tagService';
import { extractTags, shouldPersistMessage } from '../utils/keywordDetector';

const router = Router();

const entrySchema = z.object({
  content: z.string().min(3),
  date: z.string().optional(),
  tags: z.array(z.string()).optional(),
  chapterId: z.string().nullable().optional(),
  mood: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  source: z.enum(['chat', 'manual', 'api', 'system']).optional()
});

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { tag, search, chapterId, from, to } = req.query;
  const entries = await memoryService.searchEntries(req.user!.id, {
    tag: tag as string | undefined,
    search: search as string | undefined,
    chapterId: chapterId as string | undefined,
    from: from as string | undefined,
    to: to as string | undefined
  });
  res.json({ entries });
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const entry = await memoryService.saveEntry({
    userId: req.user!.id,
    ...parsed.data,
    tags: parsed.data.tags ?? extractTags(parsed.data.content)
  });

  res.status(201).json({ entry });
});

router.post('/suggest-tags', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { content } = entrySchema.pick({ content: true }).parse(req.body);
  const tags = await tagService.suggestTags(content);
  res.json({ tags });
});

router.post('/detect', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { content } = entrySchema.pick({ content: true }).parse(req.body);
  const shouldSave = shouldPersistMessage(content);
  res.json({ shouldSave, tags: extractTags(content) });
});

export const entriesRouter = router;
