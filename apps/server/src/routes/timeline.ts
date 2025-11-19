import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { getTimeline } from '../controllers/timelineController';
import { memoryService } from '../services/memoryService';
import { taskTimelineService } from '../services/taskTimelineService';
import { timelinePageService } from '../services/timelinePageService';
import { autoTaggingService } from '../services/autoTaggingService';
import { emitDelta } from '../realtime/orchestratorEmitter';
import { logger } from '../logger';

const router = Router();

router.get('/', requireAuth, getTimeline);

router.get('/tags', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const tags = await memoryService.listTags(req.user!.id);
    res.json({ tags });
  } catch (error) {
    logger.error({ error }, 'Error fetching tags');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch tags' });
  }
});

router.post('/append', requireAuth, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    title: z.string().min(3),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    occurredAt: z.string().optional(),
    taskId: z.string().optional(),
    context: z.record(z.any()).optional()
  });

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  try {
    const event = await taskTimelineService.createEvent(req.user!.id, parsed.data);
    void emitDelta('timeline.add', { event }, req.user!.id);
    res.status(201).json({ event });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to append timeline event' });
  }
});

/**
 * GET /api/timeline/entries
 * Get timeline entries transformed for visualization
 */
router.get('/entries', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const filters = {
      era: req.query.era ? (Array.isArray(req.query.era) ? req.query.era as string[] : [req.query.era as string]) : undefined,
      saga: req.query.saga ? (Array.isArray(req.query.saga) ? req.query.saga as string[] : [req.query.saga as string]) : undefined,
      arc: req.query.arc ? (Array.isArray(req.query.arc) ? req.query.arc as string[] : [req.query.arc as string]) : undefined,
      lane: req.query.lane ? (Array.isArray(req.query.lane) ? req.query.lane as string[] : [req.query.lane as string]) : undefined,
      mood: req.query.mood ? (Array.isArray(req.query.mood) ? req.query.mood as string[] : [req.query.mood as string]) : undefined,
      search: req.query.search as string | undefined
    };

    const entries = await timelinePageService.getTimelineEntries(req.user!.id, filters);
    // Always return success with entries array (empty if error occurred)
    res.json({ entries: entries || [] });
  } catch (error) {
    logger.error({ error }, 'Error fetching timeline entries');
    // Return empty array instead of 500 error
    res.json({ entries: [] });
  }
});

/**
 * GET /api/timeline/eras
 * Get timeline eras
 */
router.get('/eras', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const eras = await timelinePageService.getTimelineEras(req.user!.id);
    res.json({ eras: eras || [] });
  } catch (error) {
    logger.error({ error }, 'Error fetching timeline eras');
    // Return empty array instead of 500 error
    res.json({ eras: [] });
  }
});

/**
 * GET /api/timeline/sagas
 * Get timeline sagas
 */
router.get('/sagas', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const sagas = await timelinePageService.getTimelineSagas(req.user!.id);
    res.json({ sagas: sagas || [] });
  } catch (error) {
    logger.error({ error }, 'Error fetching timeline sagas');
    // Return empty array instead of 500 error
    res.json({ sagas: [] });
  }
});

/**
 * GET /api/timeline/arcs
 * Get timeline arcs
 */
router.get('/arcs', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const arcs = await timelinePageService.getTimelineArcs(req.user!.id);
    res.json({ arcs: arcs || [] });
  } catch (error) {
    logger.error({ error }, 'Error fetching timeline arcs');
    // Return empty array instead of 500 error
    res.json({ arcs: [] });
  }
});

/**
 * POST /api/timeline/score-highlights
 * Score entries for highlight significance
 */
router.post('/score-highlights', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const entryIds = req.body.entryIds as string[] | undefined;
    const useAI = req.body.useAI === true;
    const scores = await timelinePageService.scoreHighlights(req.user!.id, entryIds, useAI);
    res.json({ scores });
  } catch (error) {
    logger.error({ error }, 'Error scoring highlights');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to score highlights' });
  }
});

/**
 * GET /api/timeline/emotion-intensity
 * Get emotion intensity data grouped by time period
 */
router.get('/emotion-intensity', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const groupBy = (req.query.groupBy as 'day' | 'week' | 'month') || 'week';
    const intensity = await timelinePageService.getEmotionIntensity(req.user!.id, groupBy);
    res.json({ intensity });
  } catch (error) {
    logger.error({ error }, 'Error fetching emotion intensity');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch emotion intensity' });
  }
});

/**
 * POST /api/timeline/entries/:id/auto-tag
 * Auto-tag an entry with AI
 */
router.post('/entries/:id/auto-tag', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const entry = await memoryService.getEntry(req.user!.id, id);
    
    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const result = await autoTaggingService.autoTagEntry(req.user!.id, entry);
    
    // Optionally apply tags immediately
    if (req.body.apply === true) {
      const updated = await autoTaggingService.applyAutoTags(req.user!.id, id, result);
      res.json({ result, entry: updated });
    } else {
      res.json({ result });
    }
  } catch (error) {
    logger.error({ error }, 'Error auto-tagging entry');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to auto-tag entry' });
  }
});

/**
 * GET /api/timeline/time-anchors
 * Get time anchors (stored in metadata)
 */
router.get('/time-anchors', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // Fetch entries with time_anchor metadata
    const entries = await memoryService.searchEntries(req.user!.id, { limit: 1000 });
    
    const anchors: Array<{
      id: string;
      name: string;
      start_date: string;
      end_date: string | null;
      entries: string[];
    }> = [];

    // Group entries by time_anchor
    const anchorMap = new Map<string, string[]>();
    
    entries.forEach(entry => {
      const anchor = entry.metadata?.time_anchor as string | undefined;
      if (anchor) {
        if (!anchorMap.has(anchor)) {
          anchorMap.set(anchor, []);
        }
        anchorMap.get(anchor)!.push(entry.id);
      }
    });

    // Build anchor objects
    anchorMap.forEach((entryIds, anchorName) => {
      const anchorEntries = entries.filter(e => entryIds.includes(e.id));
      if (anchorEntries.length > 0) {
        const dates = anchorEntries.map(e => new Date(e.date).getTime());
        const startDate = new Date(Math.min(...dates)).toISOString();
        const endDate = new Date(Math.max(...dates)).toISOString();
        
        anchors.push({
          id: `anchor-${anchorName}`,
          name: anchorName,
          start_date: startDate,
          end_date: endDate,
          entries: entryIds
        });
      }
    });

    res.json({ anchors });
  } catch (error) {
    logger.error({ error }, 'Error fetching time anchors');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch time anchors' });
  }
});

/**
 * GET /api/timeline/character/:characterId
 * Get timeline entries for a specific character
 */
router.get('/character/:characterId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { characterId } = req.params;
    const entries = await memoryService.searchEntries(req.user!.id, { limit: 1000 });
    
    // Filter entries that mention this character
    const characterEntries = entries.filter(entry => {
      const characterIds = (entry.metadata?.character_ids as string[] | undefined) || [];
      const relationships = (entry.metadata?.relationships as Array<{ id?: string; character_id?: string }> | undefined) || [];
      
      return characterIds.includes(characterId) ||
             relationships.some(r => r.id === characterId || r.character_id === characterId);
    });

    res.json({ entries: characterEntries });
  } catch (error) {
    logger.error({ error }, 'Error fetching character timeline');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch character timeline' });
  }
});

export const timelineRouter = router;
