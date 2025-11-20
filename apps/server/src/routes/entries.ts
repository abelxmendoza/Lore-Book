import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { checkEntryLimit } from '../middleware/subscription';
import { incrementEntryCount } from '../services/usageTracking';
import { validateQuery, validateBody } from '../middleware/validateRequest';
import { logger } from '../logger';
import { chapterService } from '../services/chapterService';
import { memoryService } from '../services/memoryService';
import { tagService } from '../services/tagService';
import { voiceService } from '../services/voiceService';
import { truthVerificationService } from '../services/truthVerificationService';
import { continuityService } from '../services/continuity/continuityService';
import { extractTags, shouldPersistMessage } from '../utils/keywordDetector';
import { emitDelta } from '../realtime/orchestratorEmitter';

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

const entryQuerySchema = z.object({
  search: z.string().optional(),
  tag: z.string().optional(),
  chapterId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
  semantic: z.coerce.boolean().optional(),
  threshold: z.coerce.number().min(0).max(1).optional(),
});

/**
 * @swagger
 * /api/entries:
 *   get:
 *     summary: Get journal entries
 *     tags: [Entries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: tag
 *         schema:
 *           type: string
 *         description: Filter by tag
 *       - in: query
 *         name: chapterId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by chapter
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 500
 *           default: 50
 *         description: Maximum number of entries to return
 *       - in: query
 *         name: semantic
 *         schema:
 *           type: boolean
 *         description: Use semantic search
 *       - in: query
 *         name: threshold
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 1
 *         description: Semantic search threshold
 *     responses:
 *       200:
 *         description: List of entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 entries:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Entry'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', requireAuth, validateQuery(entryQuerySchema), async (req: AuthenticatedRequest, res) => {
  try {
    const { tag, search, chapterId, from, to, semantic, threshold, limit } = req.query;
    const entries = await memoryService.searchEntries(req.user!.id, {
      tag: tag as string | undefined,
      search: search as string | undefined,
      chapterId: chapterId as string | undefined,
      from: from as string | undefined,
      to: to as string | undefined,
      semantic: semantic as boolean | undefined,
      threshold: threshold as number | undefined,
      limit: limit as number | undefined
    });
    res.json({ entries });
  } catch (error) {
    logger.error({ error, requestId: req.requestId }, 'Error fetching entries');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch entries' });
  }
});

/**
 * @swagger
 * /api/entries:
 *   post:
 *     summary: Create a new journal entry
 *     tags: [Entries]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 minLength: 3
 *               date:
 *                 type: string
 *                 format: date-time
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               chapterId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               mood:
 *                 type: string
 *                 nullable: true
 *               summary:
 *                 type: string
 *                 nullable: true
 *               source:
 *                 type: string
 *                 enum: [chat, manual, api, system, photo, calendar, x]
 *               metadata:
 *                 type: object
 *               relationships:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       201:
 *         description: Entry created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 entry:
 *                   $ref: '#/components/schemas/Entry'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', requireAuth, checkEntryLimit, validateBody(entrySchema), async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = entrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    if (parsed.data.chapterId) {
      try {
        const chapter = await chapterService.getChapter(req.user!.id, parsed.data.chapterId);
        if (!chapter) {
          return res.status(400).json({ error: 'Invalid chapter assignment' });
        }
      } catch (error) {
        logger.warn({ error, chapterId: parsed.data.chapterId }, 'Error checking chapter, continuing without assignment');
        // Continue without chapter assignment if check fails
      }
    }

    const entry = await memoryService.saveEntry({
      userId: req.user!.id,
      ...parsed.data,
      tags: parsed.data.tags ?? extractTags(parsed.data.content),
      metadata: parsed.data.metadata,
      relationships: parsed.data.relationships
    });

    // Increment usage count (fire and forget)
    incrementEntryCount(req.user!.id).catch(err => 
      logger.warn({ error: err }, 'Failed to increment entry count')
    );

    // Auto-verify entry (fire and forget)
    truthVerificationService.verifyEntry(req.user!.id, entry.id, entry)
      .then(result => truthVerificationService.storeVerification(req.user!.id, entry.id, result))
      .catch(err => logger.warn({ error: err, entryId: entry.id }, 'Failed to auto-verify entry'));

    // Run continuity analysis (fire and forget) - The Jarvis of your life
    continuityService.runContinuityAnalysis(req.user!.id)
      .then(result => {
        logger.info({ userId: req.user!.id, eventCount: result.events.length }, 'Continuity analysis completed after entry creation');
      })
      .catch(err => logger.warn({ error: err, userId: req.user!.id }, 'Failed to run continuity analysis after entry creation'));

    void emitDelta('timeline.add', { entry }, req.user!.id);

    res.status(201).json({ entry });
  } catch (error) {
    logger.error({ error }, 'Error creating entry');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create entry' });
  }
});

router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const entryId = req.params.id;
    const parsed = entrySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    // Get existing entry
    const existingEntry = await memoryService.getEntry(req.user!.id, entryId);
    if (!existingEntry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    // Update entry
    const updatedEntry = await memoryService.updateEntry(req.user!.id, entryId, {
      content: parsed.data.content,
      tags: parsed.data.tags,
      chapterId: parsed.data.chapterId,
      mood: parsed.data.mood,
      summary: parsed.data.summary,
      metadata: parsed.data.metadata,
      relationships: parsed.data.relationships
    });

    void emitDelta('timeline.update', { entry: updatedEntry }, req.user!.id);

    res.json({ entry: updatedEntry });
  } catch (error) {
    logger.error({ error }, 'Error updating entry');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update entry' });
  }
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

  void emitDelta('timeline.add', { entry }, req.user!.id);

  res.status(201).json({ entry, transcript, formatted });
});

/**
 * @swagger
 * /api/entries/recent:
 *   get:
 *     summary: Get recent memories with filters
 *     tags: [Entries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: eras
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: sagas
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: arcs
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: sources
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: tags
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date-time
 */
router.get('/recent', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const entries = await memoryService.getRecentMemories(req.user!.id, {
      limit: req.query.limit ? Number(req.query.limit) : 20,
      eras: req.query.eras ? (Array.isArray(req.query.eras) ? req.query.eras as string[] : [req.query.eras as string]) : undefined,
      sagas: req.query.sagas ? (Array.isArray(req.query.sagas) ? req.query.sagas as string[] : [req.query.sagas as string]) : undefined,
      arcs: req.query.arcs ? (Array.isArray(req.query.arcs) ? req.query.arcs as string[] : [req.query.arcs as string]) : undefined,
      sources: req.query.sources ? (Array.isArray(req.query.sources) ? req.query.sources as string[] : [req.query.sources as string]) : undefined,
      tags: req.query.tags ? (Array.isArray(req.query.tags) ? req.query.tags as string[] : [req.query.tags as string]) : undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined
    });
    res.json({ entries });
  } catch (error) {
    logger.error({ error }, 'Error fetching recent memories');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch recent memories' });
  }
});

/**
 * @swagger
 * /api/entries/search/keyword:
 *   get:
 *     summary: Keyword/full-text search for entries
 *     tags: [Entries]
 *     security:
 *       - bearerAuth: []
 */
router.get('/search/keyword', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const query = (req.query.query as string) || '';
    const entries = await memoryService.keywordSearchEntries(req.user!.id, query, {
      limit: req.query.limit ? Number(req.query.limit) : 50,
      eras: req.query.eras ? (Array.isArray(req.query.eras) ? req.query.eras as string[] : [req.query.eras as string]) : undefined,
      sagas: req.query.sagas ? (Array.isArray(req.query.sagas) ? req.query.sagas as string[] : [req.query.sagas as string]) : undefined,
      arcs: req.query.arcs ? (Array.isArray(req.query.arcs) ? req.query.arcs as string[] : [req.query.arcs as string]) : undefined,
      sources: req.query.sources ? (Array.isArray(req.query.sources) ? req.query.sources as string[] : [req.query.sources as string]) : undefined,
      tags: req.query.tags ? (Array.isArray(req.query.tags) ? req.query.tags as string[] : [req.query.tags as string]) : undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined
    });
    res.json({ entries });
  } catch (error) {
    logger.error({ error }, 'Error keyword searching entries');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to search entries' });
  }
});

/**
 * @swagger
 * /api/entries/clusters:
 *   post:
 *     summary: Get related memory clusters
 *     tags: [Entries]
 *     security:
 *       - bearerAuth: []
 */
router.post('/clusters', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { memoryIds, limit } = req.body;
    if (!Array.isArray(memoryIds)) {
      return res.status(400).json({ error: 'memoryIds must be an array' });
    }
    const result = await memoryService.getRelatedClusters(req.user!.id, memoryIds, { limit: limit || 10 });
    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Error getting related clusters');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to get clusters' });
  }
});

/**
 * @swagger
 * /api/entries/:id/linked:
 *   get:
 *     summary: Get linked memories for a specific entry
 *     tags: [Entries]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id/linked', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const entries = await memoryService.getLinkedMemories(req.user!.id, req.params.id, limit);
    res.json({ entries });
  } catch (error) {
    logger.error({ error }, 'Error fetching linked memories');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch linked memories' });
  }
});

export const entriesRouter = router;
