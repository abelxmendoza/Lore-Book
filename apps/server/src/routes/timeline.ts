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
import { TimelineEngine, TimelineSyncService, TimelinePresets } from '../services/timeline';

const router = Router();

// Initialize timeline engine services
const timelineEngine = new TimelineEngine();
const timelineSyncService = new TimelineSyncService(timelineEngine);

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

/**
 * GET /api/timeline/events
 * Get unified timeline events with filters
 */
router.get('/events', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    
    // Parse query parameters
    const tags = req.query.tags 
      ? (Array.isArray(req.query.tags) ? req.query.tags as string[] : [req.query.tags as string])
      : undefined;
    
    const sourceTypes = req.query.sourceTypes
      ? (Array.isArray(req.query.sourceTypes) ? req.query.sourceTypes as string[] : [req.query.sourceTypes as string])
      : undefined;
    
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

    // Check for preset filters
    const preset = req.query.preset as string | undefined;
    let filter: any = {
      tags,
      sourceTypes,
      startDate,
      endDate,
      limit,
      offset
    };

    // Apply preset if specified
    if (preset) {
      switch (preset) {
        case 'life':
          filter = TimelinePresets.life();
          break;
        case 'martial_arts':
          filter = TimelinePresets.martialArts();
          break;
        case 'job':
          filter = TimelinePresets.job(req.query.jobId as string | undefined);
          break;
        case 'project':
          filter = TimelinePresets.project(req.query.projectId as string | undefined);
          break;
        case 'relationships':
          filter = TimelinePresets.relationships();
          break;
        case 'eras':
          filter = TimelinePresets.eras();
          break;
        case 'identity':
          filter = TimelinePresets.identity();
          break;
        case 'emotions':
          filter = TimelinePresets.emotions();
          break;
        case 'paracosm':
          filter = TimelinePresets.paracosm();
          break;
        case 'journal':
          filter = TimelinePresets.journal();
          break;
        case 'habits':
          filter = TimelinePresets.habits();
          break;
        case 'recent':
          const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
          filter = TimelinePresets.recent(days);
          break;
        default:
          // Use custom filter
          break;
      }
    }

    // Apply additional filters on top of preset
    if (tags && tags.length > 0) filter.tags = [...(filter.tags || []), ...tags];
    if (sourceTypes && sourceTypes.length > 0) filter.sourceTypes = [...(filter.sourceTypes || []), ...sourceTypes];
    if (startDate) filter.startDate = startDate;
    if (endDate) filter.endDate = endDate;
    if (limit) filter.limit = limit;
    if (offset) filter.offset = offset;

    const events = await timelineEngine.getTimeline(userId, filter);
    
    res.json({ 
      events,
      count: events.length,
      filter: {
        preset,
        ...filter
      }
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching timeline events');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch timeline events' });
  }
});

/**
 * POST /api/timeline/refresh
 * Rebuild the timeline from all data sources
 */
router.post('/refresh', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    
    logger.info({ userId }, 'Starting timeline refresh');
    
    // Rebuild timeline asynchronously (don't block the response)
    void timelineSyncService.rebuildForUser(userId).then(() => {
      logger.info({ userId }, 'Timeline refresh completed');
      void emitDelta('timeline.refresh', { status: 'completed' }, userId);
    }).catch((error) => {
      logger.error({ error, userId }, 'Timeline refresh failed');
      void emitDelta('timeline.refresh', { status: 'failed', error: error.message }, userId);
    });
    
    // Return immediately
    res.json({ 
      status: 'started',
      message: 'Timeline refresh started. This may take a few moments.'
    });
  } catch (error) {
    logger.error({ error }, 'Error starting timeline refresh');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to start timeline refresh' });
  }
});

/**
 * DELETE /api/timeline/events/:id
 * Delete a specific timeline event
 */
router.delete('/events/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    
    await timelineEngine.deleteEvent(id, userId);
    
    res.json({ success: true, message: 'Event deleted' });
  } catch (error) {
    logger.error({ error }, 'Error deleting timeline event');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete timeline event' });
  }
});

/**
 * PATCH /api/timeline/events/:id
 * Update a timeline event
 */
router.patch('/events/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    
    const schema = z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      eventDate: z.string().optional(),
      endDate: z.string().optional(),
      tags: z.array(z.string()).optional(),
      metadata: z.record(z.any()).optional(),
      confidence: z.number().min(0).max(1).optional()
    });
    
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    
    const updates: any = {};
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.eventDate !== undefined) updates.eventDate = new Date(parsed.data.eventDate);
    if (parsed.data.endDate !== undefined) updates.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : undefined;
    if (parsed.data.tags !== undefined) updates.tags = parsed.data.tags;
    if (parsed.data.metadata !== undefined) updates.metadata = parsed.data.metadata;
    if (parsed.data.confidence !== undefined) updates.confidence = parsed.data.confidence;
    
    await timelineEngine.updateEvent(id, userId, updates);
    
    res.json({ success: true, message: 'Event updated' });
  } catch (error) {
    logger.error({ error }, 'Error updating timeline event');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update timeline event' });
  }
});

export const timelineRouter = router;
