/**
 * Universal Search API Routes
 */

import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../logger';
import { UniversalSearchService } from '../services/timeline/universalSearchService';
import { TimelineEngine } from '../services/timeline';

const router = Router();

// Initialize services
const timelineEngine = new TimelineEngine();
const universalSearchService = new UniversalSearchService(timelineEngine);

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

