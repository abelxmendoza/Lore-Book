import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { arcService } from '../services/continuityRuntime/arcs/arcService';
import { arcMembershipService } from '../services/continuityRuntime/arcs/arcMembershipService';
import { arcRelationshipService } from '../services/continuityRuntime/arcs/arcRelationshipService';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

const upsertSchema = z.object({
  title: z.string().min(1).max(120),
  arc_type: z.enum(['life_era', 'skill', 'location', 'work', 'custom', 'occasion']),
  parent_id: z.string().uuid().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  summary: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  source: z.enum(['inferred', 'user_created']).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const patchSchema = upsertSchema.partial();

// GET /api/life-arcs — list all arcs for the user
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { arc_type, min_confidence, include_children, active_only } = req.query;
    const userId = req.user!.id;

    if (active_only === 'true') {
      const arcs = await arcService.getActiveArcs(userId);
      return res.json({ success: true, arcs });
    }

    const arcs = await arcService.listForUser(userId, {
      arc_type: arc_type as any,
      min_confidence: min_confidence ? parseFloat(min_confidence as string) : undefined,
      include_children: include_children === 'true',
    });

    res.json({ success: true, arcs });
  })
);

// GET /api/life-arcs/active — shorthand for active arcs
router.get(
  '/active',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const arcs = await arcService.getActiveArcs(req.user!.id);
    res.json({ success: true, arcs });
  })
);

// GET /api/life-arcs/:id — get single arc with relationships
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const arc = await arcService.getById(userId, req.params.id);
    if (!arc) return res.status(404).json({ error: 'Arc not found' });

    const relationships = await arcRelationshipService.getRelationshipsForArc(userId, arc.id);
    const memberships = await arcMembershipService.getMembershipsForArc(userId, arc.id);

    res.json({ success: true, arc, relationships, memberships });
  })
);

// POST /api/life-arcs — create/upsert arc
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = upsertSchema.parse(req.body);
    const arc = await arcService.upsert(req.user!.id, { ...body, source: body.source ?? 'user_created' });
    res.status(201).json({ success: true, arc });
  })
);

// PATCH /api/life-arcs/:id — partial update
router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = patchSchema.parse(req.body);
    const arc = await arcService.update(req.user!.id, req.params.id, body);
    res.json({ success: true, arc });
  })
);

// DELETE /api/life-arcs/:id
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await arcService.delete(req.user!.id, req.params.id);
    res.json({ success: true });
  })
);

// GET /api/life-arcs/:id/relationships
router.get(
  '/:id/relationships',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const relationships = await arcRelationshipService.getRelationshipsForArc(req.user!.id, req.params.id);
    res.json({ success: true, relationships });
  })
);

export default router;
