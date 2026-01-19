import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { knowledgeGraphService } from '../services/knowledgeGraphService';
import { supabaseAdmin } from '../services/supabaseClient';

const router = Router();

/**
 * GET /api/graph/component/:id/neighbors
 * Get neighbors for a memory component
 */
router.get('/component/:id/neighbors', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const relationshipType = req.query.type as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    // Verify component belongs to user
    const { data: component } = await supabaseAdmin
      .from('memory_components')
      .select('journal_entry_id')
      .eq('id', id)
      .single();

    if (!component) {
      return res.status(404).json({ error: 'Component not found' });
    }

    const { data: entry } = await supabaseAdmin
      .from('journal_entries')
      .select('user_id')
      .eq('id', component.journal_entry_id)
      .single();

    if (!entry || entry.user_id !== req.user!.id) {
      return res.status(404).json({ error: 'Component not found' });
    }

    const neighbors = await knowledgeGraphService.getNeighbors(
      id,
      relationshipType as any,
      limit
    );

    res.json({ neighbors });
  } catch (error) {
    logger.error({ error }, 'Failed to get graph neighbors');
    res.status(500).json({
      error: 'Failed to get graph neighbors',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/graph/path
 * Get path between two components
 */
router.get('/path', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { source, target, maxDepth } = req.query;

    if (!source || !target) {
      return res.status(400).json({ error: 'source and target parameters required' });
    }

    const depth = maxDepth ? parseInt(maxDepth as string) : 3;

    const path = await knowledgeGraphService.getPath(
      source as string,
      target as string,
      depth
    );

    res.json({ path });
  } catch (error) {
    logger.error({ error }, 'Failed to get graph path');
    res.status(500).json({
      error: 'Failed to get graph path',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/graph/edges
 * Get graph edges with filters
 */
router.get('/edges', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { componentId, relationshipType, minWeight, limit } = req.query;

    let query = supabaseAdmin
      .from('graph_edges')
      .select('*')
      .order('weight', { ascending: false })
      .limit(limit ? parseInt(limit as string) : 50);

    if (componentId) {
      query = query.or(`source_component_id.eq.${componentId},target_component_id.eq.${componentId}`);
    }

    if (relationshipType) {
      query = query.eq('relationship_type', relationshipType);
    }

    if (minWeight) {
      query = query.gte('weight', parseFloat(minWeight as string));
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error }, 'Failed to get graph edges');
      return res.status(500).json({
        error: 'Failed to get graph edges',
        message: error.message,
      });
    }

    // Filter to user's components
    if (componentId) {
      // Already filtered by componentId
      res.json({ edges: data || [] });
    } else {
      // Need to filter by user
      const componentIds = new Set<string>();
      (data || []).forEach((edge: any) => {
        componentIds.add(edge.source_component_id);
        componentIds.add(edge.target_component_id);
      });

      if (componentIds.size > 0) {
        const { data: components } = await supabaseAdmin
          .from('memory_components')
          .select('id, journal_entry_id')
          .in('id', Array.from(componentIds));

        if (components) {
          const entryIds = [...new Set(components.map((c: any) => c.journal_entry_id))];
          const { data: entries } = await supabaseAdmin
            .from('journal_entries')
            .select('id')
            .eq('user_id', req.user!.id)
            .in('id', entryIds);

          if (entries) {
            const validEntryIds = new Set(entries.map((e: any) => e.id));
            const validComponentIds = new Set(
              components
                .filter((c: any) => validEntryIds.has(c.journal_entry_id))
                .map((c: any) => c.id)
            );

            const filteredEdges = (data || []).filter(
              (edge: any) =>
                validComponentIds.has(edge.source_component_id) &&
                validComponentIds.has(edge.target_component_id)
            );

            res.json({ edges: filteredEdges });
            return;
          }
        }
      }

      res.json({ edges: [] });
    }
  } catch (error) {
    logger.error({ error }, 'Failed to get graph edges');
    res.status(500).json({
      error: 'Failed to get graph edges',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/graph/build
 * Manually trigger graph building for components
 */
router.post('/build', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { componentIds, entryId } = req.body;

    if (!componentIds && !entryId) {
      return res.status(400).json({ error: 'componentIds or entryId required' });
    }

    let components: any[] = [];

    if (entryId) {
      // Get all components for entry
      const { data } = await supabaseAdmin
        .from('memory_components')
        .select('*')
        .eq('journal_entry_id', entryId);

      if (!data) {
        return res.status(404).json({ error: 'Entry not found' });
      }

      // Verify entry belongs to user
      const { data: entry } = await supabaseAdmin
        .from('journal_entries')
        .select('user_id')
        .eq('id', entryId)
        .single();

      if (!entry || entry.user_id !== req.user!.id) {
        return res.status(404).json({ error: 'Entry not found' });
      }

      components = data;
    } else if (componentIds) {
      // Get specified components
      const { data } = await supabaseAdmin
        .from('memory_components')
        .select('*')
        .in('id', componentIds);

      if (!data) {
        return res.status(404).json({ error: 'Components not found' });
      }

      // Verify components belong to user
      const entryIds = [...new Set(data.map((c: any) => c.journal_entry_id))];
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('id')
        .eq('user_id', req.user!.id)
        .in('id', entryIds);

      if (!entries || entries.length !== entryIds.length) {
        return res.status(403).json({ error: 'Access denied' });
      }

      components = data;
    }

    // Build edges (in background)
    knowledgeGraphService
      .batchBuildEdges(components, req.user!.id)
      .then(edges => {
        logger.info({ edgeCount: edges.length }, 'Graph edges built');
      })
      .catch(error => {
        logger.error({ error }, 'Failed to build graph edges');
      });

    res.json({
      message: 'Graph building started',
      componentCount: components.length,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to trigger graph building');
    res.status(500).json({
      error: 'Failed to trigger graph building',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export const knowledgeGraphRouter = router;

