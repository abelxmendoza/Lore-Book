import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { chapterService } from '../services/chapterService';
import { memoryService } from '../services/memoryService';
import { tagService } from '../services/tagService';
import { voiceService } from '../services/voiceService';
import { extractTags, shouldPersistMessage } from '../utils/keywordDetector';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const entrySchema = z.object({
  content: z.string().min(3),
  date: z.string().optional(),
  tags: z.array(z.string()).optional(),
  chapterId: z.string().nullable().optional(),
  mood: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  source: z.enum(['chat', 'manual', 'api', 'system', 'photo', 'calendar', 'x']).optional(),
  metadata: z.record(z.any()).optional(),
  relationships: z
    .array(
      z.object({
        name: z.string().min(1),
        tag: z.enum(['friend', 'family', 'coach', 'romantic', 'professional', 'other'])
      })
    )
    .optional()
});

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { tag, search, chapterId, from, to, semantic, threshold } = req.query;
    const semanticMode = typeof semantic === 'string' ? semantic === 'true' : false;
    const entries = await memoryService.searchEntries(req.user!.id, {
      tag: tag as string | undefined,
      search: search as string | undefined,
      chapterId: chapterId as string | undefined,
      from: from as string | undefined,
      to: to as string | undefined,
      semantic: semanticMode,
      threshold: threshold ? Number(threshold) : undefined
    });
    res.json({ entries });
  } catch (error) {
    console.error('Error fetching entries:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch entries' });
  }
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  if (parsed.data.chapterId) {
    const chapter = await chapterService.getChapter(req.user!.id, parsed.data.chapterId);
    if (!chapter) {
      return res.status(400).json({ error: 'Invalid chapter assignment' });
    }
  }

  const entry = await memoryService.saveEntry({
    userId: req.user!.id,
    ...parsed.data,
    tags: parsed.data.tags ?? extractTags(parsed.data.content),
    metadata: parsed.data.metadata,
    relationships: parsed.data.relationships
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

router.post('/voice', requireAuth, upload.single('audio'), async (req: AuthenticatedRequest, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Audio file is required' });
  }

  const transcript = await voiceService.transcribe(req.file);
  const formatted = await voiceService.formatTranscript(transcript);
  const entry = await memoryService.saveEntry({
    userId: req.user!.id,
    content: formatted.content,
    summary: formatted.summary,
    tags: formatted.tags,
    mood: formatted.mood,
    metadata: { transcript, source: 'voice' },
    source: 'manual'
  });

  res.status(201).json({ entry, transcript, formatted });
});

export const entriesRouter = router;
