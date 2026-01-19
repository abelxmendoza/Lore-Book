/**
 * Timeline Hierarchy API Router
 * Handles all timeline layer operations
 */

import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import { timelineManager } from '../services/timelineManager';
import { TimelineLayer, LAYER_TABLE_MAP } from '../types/timeline';

const router = Router();

// Validation schemas
const createNodeSchema = z.object({
  title: z.string().min(1).optional(), // Optional - will be auto-generated if not provided
  description: z.string().optional(),
  start_date: z.string(),
  end_date: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  source_type: z.enum(['import', 'manual', 'ai']).optional(),
  metadata: z.record(z.unknown()).optional(),
  parent_id: z.string().uuid().nullable().optional()
});

const updateNodeSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  parent_id: z.string().uuid().nullable().optional()
});

const searchSchema = z.object({
  text: z.string().optional(),
  tags: z.array(z.string()).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  parent_id: z.string().uuid().optional(),
  layer_type: z.array(z.enum(['mythos', 'epoch', 'era', 'saga', 'arc', 'chapter', 'scene', 'action', 'microaction'])).optional()
});

const autoClassifySchema = z.object({
  text: z.string().min(1),
  timestamp: z.string(),
  metadata: z.record(z.unknown()).optional()
});

// Validate layer parameter
const validateLayer = (layer: string): layer is TimelineLayer => {
  return Object.keys(LAYER_TABLE_MAP).includes(layer);
};

/**
 * Create a timeline node
 * POST /timeline/:layer/create
 */
router.post(
  '/:layer/create',
  requireAuth,
  validateRequest(createNodeSchema),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { layer } = req.params;
      if (!validateLayer(layer)) {
        return res.status(400).json({ error: `Invalid layer: ${layer}` });
      }

      const node = await timelineManager.createNode(
        req.user!.id,
        layer,
        req.body
      );

      res.status(201).json({ node });
    } catch (error: any) {
      logger.error({ error, userId: req.user?.id }, 'Failed to create timeline node');
      res.status(500).json({ error: error.message || 'Failed to create timeline node' });
    }
  }
);

/**
 * Update a timeline node
 * POST /timeline/:layer/update/:id
 */
router.post(
  '/:layer/update/:id',
  requireAuth,
  validateRequest(updateNodeSchema),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { layer, id } = req.params;
      if (!validateLayer(layer)) {
        return res.status(400).json({ error: `Invalid layer: ${layer}` });
      }

      const node = await timelineManager.updateNode(
        req.user!.id,
        layer,
        id,
        req.body
      );

      res.json({ node });
    } catch (error: any) {
      logger.error({ error, userId: req.user?.id }, 'Failed to update timeline node');
      res.status(500).json({ error: error.message || 'Failed to update timeline node' });
    }
  }
);

/**
 * Get a single timeline node
 * GET /timeline/:layer/:id
 */
router.get(
  '/:layer/:id',
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { layer, id } = req.params;
      if (!validateLayer(layer)) {
        return res.status(400).json({ error: `Invalid layer: ${layer}` });
      }

      const node = await timelineManager.getNode(req.user!.id, layer, id);
      res.json({ node });
    } catch (error: any) {
      logger.error({ error, userId: req.user?.id }, 'Failed to get timeline node');
      res.status(500).json({ error: error.message || 'Failed to get timeline node' });
    }
  }
);

/**
 * Get children of a timeline node
 * GET /timeline/:layer/:id/children
 */
router.get(
  '/:layer/:id/children',
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { layer, id } = req.params;
      if (!validateLayer(layer)) {
        return res.status(400).json({ error: `Invalid layer: ${layer}` });
      }

      const children = await timelineManager.getChildren(req.user!.id, layer, id);
      res.json({ children });
    } catch (error: any) {
      logger.error({ error, userId: req.user?.id }, 'Failed to get children');
      res.status(500).json({ error: error.message || 'Failed to get children' });
    }
  }
);

/**
 * Get node with children tree
 * GET /timeline/:layer/:id/tree?maxDepth=3
 */
router.get(
  '/:layer/:id/tree',
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { layer, id } = req.params;
      if (!validateLayer(layer)) {
        return res.status(400).json({ error: `Invalid layer: ${layer}` });
      }

      const maxDepth = parseInt(req.query.maxDepth as string) || 3;
      const tree = await timelineManager.getNodeWithChildren(
        req.user!.id,
        layer,
        id,
        maxDepth
      );
      res.json({ tree });
    } catch (error: any) {
      logger.error({ error, userId: req.user?.id }, 'Failed to get tree');
      res.status(500).json({ error: error.message || 'Failed to get tree' });
    }
  }
);

/**
 * Close a timeline node
 * POST /timeline/:layer/:id/close
 */
router.post(
  '/:layer/:id/close',
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { layer, id } = req.params;
      if (!validateLayer(layer)) {
        return res.status(400).json({ error: `Invalid layer: ${layer}` });
      }

      const endDate = req.body.end_date || new Date().toISOString();
      await timelineManager.closeNode(req.user!.id, layer, id, endDate);
      res.json({ success: true });
    } catch (error: any) {
      logger.error({ error, userId: req.user?.id }, 'Failed to close node');
      res.status(500).json({ error: error.message || 'Failed to close node' });
    }
  }
);

/**
 * Delete a timeline node
 * DELETE /timeline/:layer/:id
 */
router.delete(
  '/:layer/:id',
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { layer, id } = req.params;
      if (!validateLayer(layer)) {
        return res.status(400).json({ error: `Invalid layer: ${layer}` });
      }

      await timelineManager.deleteNode(req.user!.id, layer, id);
      res.status(204).send();
    } catch (error: any) {
      logger.error({ error, userId: req.user?.id }, 'Failed to delete node');
      res.status(500).json({ error: error.message || 'Failed to delete node' });
    }
  }
);

/**
 * Search timeline nodes
 * POST /timeline/search
 */
router.post(
  '/search',
  requireAuth,
  validateRequest(searchSchema),
  async (req: AuthenticatedRequest, res) => {
    try {
      const results = await timelineManager.search(req.user!.id, req.body);
      res.json({ results, count: results.length });
    } catch (error: any) {
      logger.error({ error, userId: req.user?.id }, 'Search failed');
      res.status(500).json({ error: error.message || 'Search failed' });
    }
  }
);

/**
 * Auto-classify text into timeline layer
 * POST /timeline/auto-classify
 */
router.post(
  '/auto-classify',
  requireAuth,
  validateRequest(autoClassifySchema),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { text, timestamp, metadata } = req.body;
      const result = await timelineManager.autoClassify(
        req.user!.id,
        text,
        timestamp,
        metadata
      );
      res.json({ classification: result });
    } catch (error: any) {
      logger.error({ error, userId: req.user?.id }, 'Auto-classification failed');
      res.status(500).json({ error: error.message || 'Auto-classification failed' });
    }
  }
);

/**
 * Get recommendations
 * GET /timeline/recommendations
 */
router.get(
  '/recommendations',
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const recommendations = await timelineManager.getRecommendations(req.user!.id);
      res.json({ recommendations });
    } catch (error: any) {
      logger.error({ error, userId: req.user?.id }, 'Failed to get recommendations');
      res.status(500).json({ error: error.message || 'Failed to get recommendations' });
    }
  }
);

/**
 * Auto-assign tags
 * POST /timeline/:layer/:id/auto-tags
 */
router.post(
  '/:layer/:id/auto-tags',
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { layer, id } = req.params;
      if (!validateLayer(layer)) {
        return res.status(400).json({ error: `Invalid layer: ${layer}` });
      }

      const tags = await timelineManager.autoAssignTags(req.user!.id, layer, id);
      res.json({ tags });
    } catch (error: any) {
      logger.error({ error, userId: req.user?.id }, 'Failed to auto-assign tags');
      res.status(500).json({ error: error.message || 'Failed to auto-assign tags' });
    }
  }
);

/**
 * Auto-generate title
 * POST /timeline/:layer/:id/auto-title
 */
router.post(
  '/:layer/:id/auto-title',
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { layer, id } = req.params;
      if (!validateLayer(layer)) {
        return res.status(400).json({ error: `Invalid layer: ${layer}` });
      }

      // Use refreshTitle which automatically updates the node
      const title = await timelineManager.refreshTitle(req.user!.id, layer, id);
      res.json({ title, updated: true });
    } catch (error: any) {
      logger.error({ error, userId: req.user?.id }, 'Failed to auto-generate title');
      res.status(500).json({ error: error.message || 'Failed to auto-generate title' });
    }
  }
);

/**
 * Auto-generate summary
 * POST /timeline/:layer/:id/auto-summary
 */
router.post(
  '/:layer/:id/auto-summary',
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { layer, id } = req.params;
      if (!validateLayer(layer)) {
        return res.status(400).json({ error: `Invalid layer: ${layer}` });
      }

      const summary = await timelineManager.autoGenerateSummary(req.user!.id, layer, id);
      // Optionally update the node with the new summary
      if (req.body.update === true) {
        await timelineManager.updateNode(req.user!.id, layer, id, { description: summary });
      }
      res.json({ summary });
    } catch (error: any) {
      logger.error({ error, userId: req.user?.id }, 'Failed to auto-generate summary');
      res.status(500).json({ error: error.message || 'Failed to auto-generate summary' });
    }
  }
);

export const timelineHierarchyRouter = router;

