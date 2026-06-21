import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { ChronologyEngine, EventMapper } from '../services/chronology';
import { bridgeChronologyToArcs } from '../services/chronology/chronologyArcBridge';
import { persistGapNodes } from '../services/chronology/gapNodeService';
import {
  loadHierarchyConstraints,
  applyHierarchyConstraints,
} from '../services/chronology/hierarchyContextProvider';
import { chronologyService } from '../services/chronologyV2';
import { stitchedTimelineService } from '../services/chronologyV2/stitchedTimelineService';
import { calendarAggregationService } from '../services/chronologyV2/calendarAggregationService';
import { supabaseAdmin } from '../services/supabaseClient';
import { JOURNAL_COLS } from '../db/journalEntryColumns';

const router = Router();

const chronologyEngine = new ChronologyEngine();
const eventMapper = new EventMapper();

/**
 * POST /api/chronology/process
 * Process events and return chronology results
 */
router.post(
  '/process',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      events: z.array(z.any()).optional(),
      entryIds: z.array(z.string()).optional(),
      componentIds: z.array(z.string()).optional(),
    });

    const { events, entryIds, componentIds } = schema.parse(req.body);
    const userId = req.user!.id;

    let eventsToProcess: any[] = [];

    // If events provided directly, use them
    if (events && events.length > 0) {
      eventsToProcess = events;
    }
    // Otherwise fetch from database
    else if (entryIds && entryIds.length > 0) {
      const { data: entries, error } = await supabaseAdmin
        .from('journal_entries')
        .select(JOURNAL_COLS)
        .in('id', entryIds)
        .eq('user_id', userId);

      if (error) {
        throw new Error(`Failed to fetch entries: ${error.message}`);
      }

      eventsToProcess = eventMapper.mapMemoryEntriesToEvents(entries || []);
    } else if (componentIds && componentIds.length > 0) {
      const { data: components, error } = await supabaseAdmin
        .from('memory_components')
        .select('*, journal_entry_id')
        .in('id', componentIds);

      if (error) {
        throw new Error(`Failed to fetch components: ${error.message}`);
      }

      // Verify all components belong to user
      if (components && components.length > 0) {
        const entryIds = [...new Set(components.map(c => c.journal_entry_id))];
        const { data: entries } = await supabaseAdmin
          .from('journal_entries')
          .select('user_id')
          .in('id', entryIds)
          .eq('user_id', userId);

        if (!entries || entries.length !== entryIds.length) {
          throw new Error('Some components do not belong to user');
        }
      }

      eventsToProcess = eventMapper.mapMemoryComponentsToEvents(components || []);
    } else {
      // Fetch all user's memory components
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select(JOURNAL_COLS)
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(100);

      eventsToProcess = eventMapper.mapMemoryEntriesToEvents(entries || []);
    }

    // Apply hierarchy context before V1 runs: annotates events with which
    // era/saga/arc/chapter they belong to, and anchors undated events to
    // the nearest hierarchy period rather than embedding-median guessing.
    const hierarchyConstraints = await loadHierarchyConstraints(userId);
    const contextualEvents = applyHierarchyConstraints(eventsToProcess, hierarchyConstraints);

    const result = await chronologyEngine.process(contextualEvents);

    // Bridge V1 findings → arc_relationships + gap nodes (fire-and-forget)
    const eventTimestamps = new Map(eventsToProcess.map((e: any) => [e.id, e.timestamp ?? null]));
    Promise.all([
      bridgeChronologyToArcs(userId, result, eventTimestamps),
      persistGapNodes(userId, result.gaps),
    ]).catch(() => {});

    res.json(result);
  })
);

/**
 * GET /api/chronology/graph/:entryId
 * Get temporal graph for a specific entry
 */
router.get(
  '/graph/:entryId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { entryId } = req.params;
    const userId = req.user!.id;

    // Verify entry belongs to user
    const { data: entry } = await supabaseAdmin
      .from('journal_entries')
      .select('user_id')
      .eq('id', entryId)
      .eq('user_id', userId)
      .single();

    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    // Get memory components for this entry
    const { data: components } = await supabaseAdmin
      .from('memory_components')
      .select('*')
      .eq('journal_entry_id', entryId);

    const events = eventMapper.mapMemoryComponentsToEvents(components || []);
    const graph = chronologyEngine['graphBuilder'].build(events);

    res.json({ graph });
  })
);

/**
 * GET /api/chronology/gaps
 * Get detected gaps for user
 */
router.get(
  '/gaps',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    // Fetch recent entries
    const { data: entries } = await supabaseAdmin
      .from('journal_entries')
      .select(JOURNAL_COLS)
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(limit);

    const events = eventMapper.mapMemoryEntriesToEvents(entries || []);
    const gaps = chronologyEngine['gaps'].detect(events);

    res.json({ gaps });
  })
);

/**
 * GET /api/chronology/chains/:entryId
 * Get causal chains from a specific entry
 */
router.get(
  '/chains/:entryId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { entryId } = req.params;
    const userId = req.user!.id;

    // Verify entry belongs to user
    const { data: entry } = await supabaseAdmin
      .from('journal_entries')
      .select('user_id')
      .eq('id', entryId)
      .eq('user_id', userId)
      .single();

    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    // Get related entries and components
    const { data: entries } = await supabaseAdmin
      .from('journal_entries')
      .select(JOURNAL_COLS)
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(100);

    const { data: components } = await supabaseAdmin
      .from('memory_components')
      .select('*')
      .in(
        'journal_entry_id',
        (entries || []).map(e => e.id)
      );

    const entryEvents = eventMapper.mapMemoryEntriesToEvents(entries || []);
    const componentEvents = eventMapper.mapMemoryComponentsToEvents(components || []);
    const allEvents = [...entryEvents, ...componentEvents];

    const graph = chronologyEngine['graphBuilder'].buildWithCausality(allEvents);
    const chains = chronologyEngine['causal'].infer(graph);

    // Filter chains that include the requested entry
    const relevantChains = chains.filter(
      chain => chain.rootEvent === entryId || chain.chain.includes(entryId)
    );

    res.json({ chains: relevantChains });
  })
);

/**
 * GET /api/chronology
 * Get master chronology view (new V2 service)
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const startTime = req.query.start_time as string | undefined;
    const endTime = req.query.end_time as string | undefined;
    const timelineIds = req.query.timeline_ids
      ? (Array.isArray(req.query.timeline_ids)
          ? (req.query.timeline_ids as string[])
          : [req.query.timeline_ids as string])
      : undefined;

    const entries = await chronologyService.getChronologicalOrder(
      req.user!.id,
      startTime,
      endTime,
      timelineIds
    );

    res.json({ entries });
  })
);

/**
 * GET /api/chronology/summary
 * Returns the latest persisted chronology snapshot (fast, no recompute)
 */
router.get(
  '/summary',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const { data, error } = await supabaseAdmin
      .from('chronology_snapshots')
      .select('node_count, edge_count, gap_count, chain_count, pattern_count, gaps, causal_chains, patterns, updated_at')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return res.json({
        node_count: 0, edge_count: 0, gap_count: 0,
        chain_count: 0, pattern_count: 0,
        gaps: [], causal_chains: [], patterns: [],
        updated_at: null,
      });
    }

    res.json(data);
  })
);

/**
 * GET /api/chronology/narrative
 * Generate a first-person narrative summary from the user's chronological events.
 * Uses NarrativeBuilder (previously built but never surfaced).
 *
 * Query params:
 *   start_date  — ISO date string, inclusive lower bound (default: 6 months ago)
 *   end_date    — ISO date string, inclusive upper bound (default: now)
 *   limit       — max events to include (default: 50, max: 100)
 */
router.get(
  '/narrative',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const limit  = Math.min(parseInt((req.query.limit as string) || '50', 10), 100);

    const defaultStart = new Date();
    defaultStart.setMonth(defaultStart.getMonth() - 6);
    const startDate = (req.query.start_date as string) || defaultStart.toISOString();
    const endDate   = (req.query.end_date as string)   || new Date().toISOString();

    const { data: entries, error } = await supabaseAdmin
      .from('journal_entries')
      .select(JOURNAL_COLS)
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
      .limit(limit);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch entries for narrative' });
    }

    if (!entries || entries.length === 0) {
      return res.json({
        narrative: { summary: 'No entries found in the specified time range.', sequence: [] },
        eventCount: 0,
        timeRange: { start: startDate, end: endDate },
      });
    }

    const events = eventMapper.mapMemoryEntriesToEvents(entries);

    // Sort by timestamp and use earliest as narrative root
    const sorted = events
      .filter(e => e.timestamp)
      .sort((a, b) => new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime());

    if (sorted.length === 0) {
      return res.json({
        narrative: { summary: 'No timestamped events found.', sequence: [] },
        eventCount: events.length,
        timeRange: { start: startDate, end: endDate },
      });
    }

    const root = sorted[0];
    const result = await chronologyEngine.buildNarrative(root, sorted);

    res.json({
      narrative:  result.narrative,
      eventCount: sorted.length,
      timeRange:  { start: startDate, end: endDate },
      gaps:       result.gaps,
      patterns:   result.patterns,
      metadata:   result.metadata,
    });
  })
);

/**
 * GET /api/chronology/overlaps
 * Detect overlapping periods
 */
router.get(
  '/overlaps',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const entryId = req.query.entry_id as string | undefined;
    const overlaps = await chronologyService.detectOverlaps(req.user!.id, entryId);
    res.json({ overlaps });
  })
);

/**
 * GET /api/chronology/stitched
 * Moments + events merged chronologically, with optional life-arc scope.
 */
router.get(
  '/stitched',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const lifeArcId = req.query.life_arc_id as string | undefined;
    const startTime = req.query.start_time as string | undefined;
    const endTime = req.query.end_time as string | undefined;
    const scopeType = req.query.scope_type as 'global' | 'life_arc' | undefined;

    const result = await stitchedTimelineService.getStitchedTimeline(req.user!.id, {
      scope_type: scopeType,
      life_arc_id: lifeArcId,
      start_time: startTime,
      end_time: endTime,
    });

    res.json(result);
  })
);

/**
 * PUT /api/chronology/order
 * Persist user drag-reorder for a timeline scope (training signal).
 */
router.put(
  '/order',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      scope_type: z.enum(['global', 'life_arc']),
      scope_id: z.string().uuid().optional(),
      items: z.array(
        z.object({
          kind: z.enum(['moment', 'event']),
          id: z.string().uuid(),
          sort_index: z.number().int().min(0),
        })
      ),
    });

    const body = schema.parse(req.body);
    const result = await stitchedTimelineService.saveUserOrder(req.user!.id, body);
    res.json({ success: true, ...result });
  })
);

/**
 * GET /api/chronology/calendar?year=2026&month=6
 * Month view: occasion arcs, events, moments by day with attendance.
 */
router.get(
  '/calendar',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const year = parseInt(req.query.year as string, 10) || new Date().getFullYear();
    const month = parseInt(req.query.month as string, 10) || new Date().getMonth() + 1;
    const result = await calendarAggregationService.getMonth(req.user!.id, year, month);
    res.json(result);
  })
);

/**
 * POST /api/chronology/sync-occasions
 * Backfill day-scoped occasion arcs from recent resolved events.
 */
router.post(
  '/sync-occasions',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const lookbackDays = typeof req.body?.lookback_days === 'number' ? req.body.lookback_days : 90;
    const { dayOccasionService } = await import('../services/continuityRuntime/arcs/dayOccasionService');
    const upserted = await dayOccasionService.processRecentDays(req.user!.id, {
      lookbackDays: Math.min(Math.max(lookbackDays, 1), 365),
    });
    res.json({ success: true, upserted });
  })
);

/**
 * GET /api/chronology/buckets
 * Get time buckets at different resolutions
 */
router.get(
  '/buckets',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const resolution = (req.query.resolution as 'decade' | 'year' | 'month') || 'year';
    const buckets = await chronologyService.getTimeBuckets(req.user!.id, resolution);
    res.json({ buckets });
  })
);

export default router;

