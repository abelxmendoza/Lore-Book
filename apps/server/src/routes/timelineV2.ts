import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { supabaseAdmin } from '../services/supabaseClient';
import {
  timelineService,
  timelineMembershipService,
  timelineSearchService,
  timelineRelationshipService
} from '../services/timelineV2';

const router = Router();

// ============================================================================
// TIMELINE CRUD
// ============================================================================

/**
 * GET /api/timeline-v2
 * List timelines with optional filters
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const filters = {
      timeline_type: req.query.timeline_type as string | undefined,
      parent_id: req.query.parent_id === 'null' ? null : (req.query.parent_id as string | undefined),
      search: req.query.search as string | undefined
    };

    const timelines = await timelineService.listTimelines(req.user!.id, filters);
    res.json({ timelines });
  } catch (error) {
    logger.error({ error }, 'Error fetching timelines');
    res.status(500).json({ error: 'Failed to fetch timelines' });
  }
});

/**
 * POST /api/timeline-v2
 * Create a new timeline
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const schema = z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      timeline_type: z.enum(['life_era', 'sub_timeline', 'skill', 'location', 'work', 'custom']),
      parent_id: z.string().uuid().nullable().optional(),
      start_date: z.string(),
      end_date: z.string().nullable().optional(),
      tags: z.array(z.string()).optional(),
      metadata: z.record(z.any()).optional()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const timeline = await timelineService.createTimeline(req.user!.id, parsed.data);
    res.status(201).json({ timeline });
  } catch (error) {
    logger.error({ error }, 'Error creating timeline');
    res.status(500).json({ error: 'Failed to create timeline' });
  }
});

/**
 * GET /api/timeline-v2/:id
 * Get a timeline with full hierarchy
 */
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const timeline = await timelineService.getTimelineHierarchy(req.user!.id, req.params.id);
    
    if (!timeline) {
      return res.status(404).json({ error: 'Timeline not found' });
    }

    res.json({ timeline });
  } catch (error) {
    logger.error({ error }, 'Error fetching timeline');
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

/**
 * PUT /api/timeline-v2/:id
 * Update a timeline
 */
router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const schema = z.object({
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      timeline_type: z.enum(['life_era', 'sub_timeline', 'skill', 'location', 'work', 'custom']).optional(),
      parent_id: z.string().uuid().nullable().optional(),
      start_date: z.string().optional(),
      end_date: z.string().nullable().optional(),
      tags: z.array(z.string()).optional(),
      metadata: z.record(z.any()).optional()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const timeline = await timelineService.updateTimeline(req.user!.id, req.params.id, parsed.data);
    res.json({ timeline });
  } catch (error) {
    logger.error({ error }, 'Error updating timeline');
    res.status(500).json({ error: 'Failed to update timeline' });
  }
});

/**
 * DELETE /api/timeline-v2/:id
 * Delete a timeline
 */
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await timelineService.deleteTimeline(req.user!.id, req.params.id);
    res.status(204).send();
  } catch (error) {
    logger.error({ error }, 'Error deleting timeline');
    res.status(500).json({ error: 'Failed to delete timeline' });
  }
});

// ============================================================================
// TIMELINE MEMBERSHIPS
// ============================================================================

/**
 * POST /api/timeline-v2/:id/memberships
 * Add a memory to a timeline
 */
router.post('/:id/memberships', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const schema = z.object({
      journal_entry_id: z.string().uuid(),
      role: z.string().optional(),
      importance_score: z.number().min(0).max(1).optional(),
      metadata: z.record(z.any()).optional()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const membership = await timelineMembershipService.addMemoryToTimeline(req.user!.id, {
      timeline_id: req.params.id,
      ...parsed.data
    });

    res.status(201).json({ membership });
  } catch (error) {
    logger.error({ error }, 'Error adding memory to timeline');
    res.status(500).json({ error: 'Failed to add memory to timeline' });
  }
});

/**
 * GET /api/timeline-v2/:id/memberships
 * Get all memories for a timeline (membership records)
 */
router.get('/:id/memberships', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const memberships = await timelineMembershipService.getMemoriesForTimeline(
      req.user!.id,
      req.params.id,
      limit
    );
    res.json({ memberships });
  } catch (error) {
    logger.error({ error }, 'Error fetching timeline memberships');
    res.status(500).json({ error: 'Failed to fetch timeline memberships' });
  }
});

/**
 * GET /api/timeline-v2/:id/entries
 * Get full journal entries for a timeline (with complete entry data)
 */
router.get('/:id/entries', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const memberships = await timelineMembershipService.getMemoriesForTimeline(
      req.user!.id,
      req.params.id,
      limit
    );

    // Get full entry data
    const entryIds = memberships.map(m => m.journal_entry_id);
    if (entryIds.length === 0) {
      return res.json({ entries: [] });
    }

    const { data: entries, error } = await supabaseAdmin
      .from('journal_entries')
      .select('*')
      .eq('user_id', req.user!.id)
      .in('id', entryIds)
      .order('date', { ascending: false });

    if (error) {
      logger.error({ error }, 'Error fetching timeline entries');
      throw error;
    }

    // Enrich with membership info
    const membershipMap = new Map(memberships.map(m => [m.journal_entry_id, m]));
    const enrichedEntries = (entries || []).map((entry: any) => ({
      ...entry,
      membership: membershipMap.get(entry.id)
    }));

    res.json({ entries: enrichedEntries });
  } catch (error) {
    logger.error({ error }, 'Error fetching timeline entries');
    res.status(500).json({ error: 'Failed to fetch timeline entries' });
    }
});

/**
 * DELETE /api/timeline-v2/:id/memberships/:entryId
 * Remove a memory from a timeline
 */
router.delete('/:id/memberships/:entryId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await timelineMembershipService.removeMemoryFromTimeline(
      req.user!.id,
      req.params.entryId,
      req.params.id
    );
    res.status(204).send();
  } catch (error) {
    logger.error({ error }, 'Error removing memory from timeline');
    res.status(500).json({ error: 'Failed to remove memory from timeline' });
  }
});

// ============================================================================
// TIMELINE SEARCH
// ============================================================================

/**
 * GET /api/timeline-v2/search
 * Search timelines with multiple modes
 */
router.get('/search', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const query = (req.query.q as string) || '';
    const mode = (req.query.mode as 'natural' | 'faceted' | 'semantic') || 'natural';

    const filters = {
      timeline_type: req.query.timeline_type
        ? (Array.isArray(req.query.timeline_type)
            ? (req.query.timeline_type as string[])
            : [req.query.timeline_type as string])
        : undefined,
      era: req.query.era
        ? (Array.isArray(req.query.era) ? (req.query.era as string[]) : [req.query.era as string])
        : undefined,
      skill: req.query.skill
        ? (Array.isArray(req.query.skill) ? (req.query.skill as string[]) : [req.query.skill as string])
        : undefined,
      job: req.query.job
        ? (Array.isArray(req.query.job) ? (req.query.job as string[]) : [req.query.job as string])
        : undefined,
      location: req.query.location
        ? (Array.isArray(req.query.location)
            ? (req.query.location as string[])
            : [req.query.location as string])
        : undefined,
      emotion: req.query.emotion
        ? (Array.isArray(req.query.emotion)
            ? (req.query.emotion as string[])
            : [req.query.emotion as string])
        : undefined,
      year_from: req.query.year_from ? parseInt(req.query.year_from as string) : undefined,
      year_to: req.query.year_to ? parseInt(req.query.year_to as string) : undefined,
      tags: req.query.tags
        ? (Array.isArray(req.query.tags) ? (req.query.tags as string[]) : [req.query.tags as string])
        : undefined
    };

    const results = await timelineSearchService.searchTimelines(req.user!.id, query, mode, filters);
    res.json(results);
  } catch (error) {
    logger.error({ error }, 'Error searching timelines');
    res.status(500).json({ error: 'Failed to search timelines' });
  }
});

// ============================================================================
// TIMELINE RELATIONSHIPS
// ============================================================================

/**
 * GET /api/timeline-v2/:id/related
 * Get related timelines
 */
router.get('/:id/related', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const relationships = await timelineRelationshipService.getRelatedTimelines(
      req.user!.id,
      req.params.id
    );
    res.json({ relationships });
  } catch (error) {
    logger.error({ error }, 'Error fetching related timelines');
    res.status(500).json({ error: 'Failed to fetch related timelines' });
  }
});

/**
 * POST /api/timeline-v2/:id/relationships
 * Create a relationship between timelines
 */
router.post('/:id/relationships', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const schema = z.object({
      target_timeline_id: z.string().uuid(),
      relationship_type: z.enum(['spawned', 'influenced', 'overlapped', 'preceded', 'merged', 'split']),
      description: z.string().optional(),
      metadata: z.record(z.any()).optional()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const relationship = await timelineRelationshipService.createRelationship(req.user!.id, {
      source_timeline_id: req.params.id,
      ...parsed.data
    });

    res.status(201).json({ relationship });
  } catch (error) {
    logger.error({ error }, 'Error creating timeline relationship');
    res.status(500).json({ error: 'Failed to create timeline relationship' });
  }
});

export default router;
