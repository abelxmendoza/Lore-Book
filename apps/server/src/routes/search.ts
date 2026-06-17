/**
 * Universal Search API Routes
 */

import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { TimelineEngine } from '../services/timeline';
import { UniversalSearchService } from '../services/timeline/universalSearchService';
import { memoryRecallEngine } from '../services/memoryRecall/memoryRecallEngine';

const router = Router();

const timelineEngine = new TimelineEngine();
const universalSearchService = new UniversalSearchService(timelineEngine);

const recallBodySchema = z.object({
  mode: z.literal('recall'),
  raw_text: z.string().min(1).max(1000),
  persona: z.enum(['DEFAULT', 'ARCHIVIST']).optional(),
  timeframe: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
});

const universalBodySchema = z.object({
  mode: z.literal('universal').optional(),
  query: z.string().min(1),
});

/**
 * POST /api/search
 * Canonical search entry — mode=universal (default) or mode=recall.
 * Legacy POST /api/search/universal and POST /api/memory-recall/query remain active.
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const mode = req.body?.mode ?? 'universal';

    if (mode === 'recall') {
      const parsed = recallBodySchema.safeParse({ ...req.body, mode: 'recall' });
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid recall search body', details: parsed.error.flatten() });
      }
      const result = await memoryRecallEngine.executeRecall({
        raw_text: parsed.data.raw_text,
        user_id: userId,
        persona: parsed.data.persona || 'DEFAULT',
        timeframe: parsed.data.timeframe,
      });
      return res.json({ success: true, mode: 'recall', ...result });
    }

    const parsed = universalBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const results = await universalSearchService.search(userId, parsed.data.query);
    return res.json({ success: true, mode: 'universal', ...results });
  } catch (error) {
    logger.error({ error }, 'Error performing search');
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to perform search',
      ...universalSearchService.emptyResponse(),
    });
  }
});

/**
 * POST /api/search/universal
 * Universal timeline search across all sources
 */
router.post('/universal', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const schema = z.object({
      query: z.string().min(1)
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const userId = req.user!.id;
    const results = await universalSearchService.search(userId, parsed.data.query);

    res.json(results);
  } catch (error) {
    logger.error({ error }, 'Error performing universal search');
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to perform search',
      ...universalSearchService.emptyResponse()
    });
  }
});

export const searchRouter = router;

