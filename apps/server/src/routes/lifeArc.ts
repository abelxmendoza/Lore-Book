import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { arcService } from '../services/continuityRuntime/arcs/arcService';
import { arcMembershipService } from '../services/continuityRuntime/arcs/arcMembershipService';
import { arcRelationshipService } from '../services/continuityRuntime/arcs/arcRelationshipService';
import { lifeArcBarEligibility } from '../services/continuityRuntime/arcs/lifeArcEligibility';
import { lifeArcProposalService } from '../services/continuityRuntime/arcs/lifeArcProposalService';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

const upsertSchema = z.object({
  title: z.string().min(1).max(120),
  arc_type: z.enum(['life_era', 'skill', 'location', 'work', 'custom', 'occasion']),
  track: z.enum(['career', 'romance', 'relationships', 'creative', 'health', 'inner', 'mixed', 'custom']).nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  summary: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  source: z.enum(['inferred', 'user_created']).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const patchSchema = upsertSchema.partial();

const proposalStatusSchema = z.enum(['pending', 'created', 'merged', 'dismissed']);
const proposalPatchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  arc_type: z.enum(['life_era', 'skill', 'location', 'work', 'custom']).optional(),
  track: z.enum(['career', 'romance', 'relationships', 'creative', 'health', 'inner', 'mixed', 'custom']).optional(),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
}).refine((value) => !value.start_date || !value.end_date || value.end_date >= value.start_date, {
  message: 'end_date must be on or after start_date',
});

function withEligibility<T extends { arc_type: any; start_date: string | null; end_date: string | null; metadata: Record<string, unknown> }>(arc: T) {
  return { ...arc, bar_eligibility: lifeArcBarEligibility(arc) };
}

function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

// GET /api/life-arcs — list all arcs for the user
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { arc_type, min_confidence, include_children, active_only, is_active, limit } = req.query;
    const userId = req.user!.id;

    const activeOnly = active_only === 'true' || is_active === 'true';
    const cap = limit ? Math.min(Math.max(parseInt(String(limit), 10) || 0, 0), 100) : undefined;

    if (activeOnly) {
      const arcs = await arcService.getActiveArcs(userId);
      const durable = arcs.filter((arc) => arc.arc_type !== 'occasion');
      const limited = cap ? durable.slice(0, cap) : durable;
      return res.json({ success: true, arcs: limited.map(withEligibility) });
    }

    const arcs = await arcService.listForUser(userId, {
      arc_type: arc_type as any,
      min_confidence: min_confidence ? parseFloat(min_confidence as string) : undefined,
      include_children: include_children === 'true',
    });

    res.json({ success: true, arcs: arcs.map(withEligibility) });
  })
);

// GET /api/life-arcs/active — shorthand for active arcs
router.get(
  '/active',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const arcs = await arcService.getActiveArcs(req.user!.id);
    res.json({
      success: true,
      arcs: arcs.filter((arc) => arc.arc_type !== 'occasion').map(withEligibility),
    });
  })
);

// GET /api/life-arcs/proposals — list reviewable proposals
router.get(
  '/proposals',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = proposalStatusSchema.optional().safeParse(req.query.status);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid proposal status' });
    const proposals = await lifeArcProposalService.list(req.user!.id, parsed.data);
    res.json({ success: true, proposals });
  }),
);

// POST /api/life-arcs/proposals/build — dry-run by default, persist only on explicit request
router.post(
  '/proposals/build',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z.object({ persist: z.boolean().default(false) }).parse(req.body ?? {});
    const result = await lifeArcProposalService.build(req.user!.id, body.persist);
    res.json({ success: true, dry_run: !body.persist, ...result });
  }),
);

router.patch(
  '/proposals/:proposalId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const patch = proposalPatchSchema.parse(req.body);
    const proposal = await lifeArcProposalService.updateDraft(req.user!.id, routeParam(req.params.proposalId), patch);
    res.json({ success: true, proposal });
  }),
);

router.post(
  '/proposals/:proposalId/create',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await lifeArcProposalService.createArc(req.user!.id, routeParam(req.params.proposalId));
    res.status(201).json({ success: true, ...result });
  }),
);

router.post(
  '/proposals/:proposalId/merge',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z.object({ arc_id: z.string().uuid() }).parse(req.body);
    const proposal = await lifeArcProposalService.merge(req.user!.id, routeParam(req.params.proposalId), body.arc_id);
    res.json({ success: true, proposal });
  }),
);

router.post(
  '/proposals/:proposalId/dismiss',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z.object({ reason: z.string().max(500).optional() }).parse(req.body ?? {});
    const proposal = await lifeArcProposalService.dismiss(req.user!.id, routeParam(req.params.proposalId), body.reason);
    res.json({ success: true, proposal });
  }),
);

// GET /api/life-arcs/:id — get single arc with relationships
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const arc = await arcService.getById(userId, routeParam(req.params.id));
    if (!arc) return res.status(404).json({ error: 'Arc not found' });

    const relationships = await arcRelationshipService.getRelationshipsForArc(userId, arc.id);
    const memberships = await arcMembershipService.getMembershipsForArc(userId, arc.id);

    res.json({ success: true, arc: withEligibility(arc), relationships, memberships });
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
    const arc = await arcService.update(req.user!.id, routeParam(req.params.id), body);
    res.json({ success: true, arc });
  })
);

// DELETE /api/life-arcs/:id
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await arcService.delete(req.user!.id, routeParam(req.params.id));
    res.json({ success: true });
  })
);

// GET /api/life-arcs/:id/relationships
router.get(
  '/:id/relationships',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const relationships = await arcRelationshipService.getRelationshipsForArc(req.user!.id, routeParam(req.params.id));
    res.json({ success: true, relationships });
  })
);

export default router;
