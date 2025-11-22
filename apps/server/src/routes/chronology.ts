import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { ChronologyEngine, EventMapper } from '../services/chronology';
import { supabaseAdmin } from '../services/supabaseClient';

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
        .select('*')
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
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(100);

      eventsToProcess = eventMapper.mapMemoryEntriesToEvents(entries || []);
    }

    const result = await chronologyEngine.process(eventsToProcess);

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
      .select('*')
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
      .select('*')
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

export default router;

