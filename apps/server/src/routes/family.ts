/**
 * Family graph, households, analytics API.
 */
import { Router } from 'express';
import { familyQueryRequestSchema } from '@lorebook/api-contracts';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { familyGraphService } from '../services/kinship/familyGraphService';
import { householdService } from '../services/kinship/householdService';
import { householdWriteService } from '../services/kinship/householdWriteService';
import { familyTreeService } from '../services/familyTreeService';
import { supabaseAdmin } from '../services/supabaseClient';
import { listPeripheralsForUser } from '../services/relationshipPeripheralService';
import { queryFamilyForUser } from '../services/kinship/familyQueryService';

const router = Router();

router.post(
  '/query',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = familyQueryRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid family query',
        details: parsed.error.flatten(),
      });
      return;
    }
    const result = await queryFamilyForUser(req.user!.id, parsed.data);
    res.json({ success: true, result });
  })
);

router.get(
  '/summary',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const [graph, households, analytics, tree] = await Promise.all([
      familyGraphService.getGraph(userId),
      householdService.listHouseholds(userId),
      familyGraphService.getAnalytics(userId),
      familyTreeService.getUserFamilyTree(userId),
    ]);

    const { data: familyGroups } = await supabaseAdmin
      .from('organizations')
      .select('id, name, metadata')
      .eq('user_id', userId)
      .eq('type', 'family');

    const groups = (familyGroups ?? []).filter(
      (o) => (o.metadata as Record<string, unknown>)?.inference_source === 'kinship_graph'
    );

    res.json({
      success: true,
      graph: { nodeCount: graph.nodes.length, edgeCount: graph.edges.length, selfId: graph.selfId },
      tree,
      households,
      familyGroups: groups,
      analytics: analytics.slice(0, 12),
    });
  })
);

router.get(
  '/graph',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const graph = await familyGraphService.getGraph(userId);
    res.json({ success: true, ...graph });
  })
);

router.get(
  '/households',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const households = await householdService.listHouseholds(userId);
    res.json({ success: true, households });
  })
);

router.get(
  '/analytics',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const analytics = await familyGraphService.getAnalytics(userId);
    res.json({ success: true, analytics });
  })
);

router.get(
  '/peripherals',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const domain = (req.query.domain as string) || 'family';
    const peripherals = await listPeripheralsForUser(userId, {
      domain: domain as import('../services/ontology/vicariousRelationshipIntelligence').RelationshipPeripheryDomain,
    });
    res.json({ success: true, peripherals });
  })
);

router.get(
  '/audit',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const audit = await familyGraphService.generateAuditReport(userId);
    res.json({ success: true, audit });
  })
);

// POST /api/family/household — create a household
router.post(
  '/household',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const locationName = typeof req.body?.locationName === 'string' ? req.body.locationName.trim() || undefined : undefined;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() || undefined : undefined;
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });
    const household = await householdWriteService.createHousehold(userId, name, { locationName, reason });
    res.json({ success: true, household });
  })
);

// DELETE /api/family/household/:id — soft-delete a household (history is kept)
router.delete(
  '/household/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const householdId = String(req.params.id);
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) return res.status(400).json({ success: false, error: 'reason is required' });
    const ok = await householdWriteService.deleteHousehold(userId, householdId, reason);
    if (!ok) return res.status(404).json({ success: false, error: 'Household not found' });
    res.json({ success: true });
  })
);

// POST /api/family/household/:id/members — add a member to a household
router.post(
  '/household/:id/members',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const householdId = String(req.params.id);
    const characterName = typeof req.body?.characterName === 'string' ? req.body.characterName.trim() : '';
    const characterId = typeof req.body?.characterId === 'string' ? req.body.characterId.trim() || undefined : undefined;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() || undefined : undefined;
    if (!characterName) return res.status(400).json({ success: false, error: 'characterName is required' });
    const member = await householdWriteService.addHouseholdMember(userId, householdId, characterName, {
      characterId,
      reason,
    });
    res.json({ success: true, member });
  })
);

// DELETE /api/family/household/:id/members/:characterId — remove a member (soft, keeps history)
router.delete(
  '/household/:id/members/:characterId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const householdId = String(req.params.id);
    const characterId = String(req.params.characterId);
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() || undefined : undefined;
    const ok = await householdWriteService.removeHouseholdMember(userId, householdId, characterId, reason);
    if (!ok) return res.status(404).json({ success: false, error: 'Household member not found' });
    res.json({ success: true });
  })
);

// PATCH /api/family/household/:id/location — move a household to a new location
router.patch(
  '/household/:id/location',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const householdId = String(req.params.id);
    const locationName = typeof req.body?.locationName === 'string' ? req.body.locationName.trim() : '';
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() || undefined : undefined;
    if (!locationName) return res.status(400).json({ success: false, error: 'locationName is required' });
    const ok = await householdWriteService.moveHousehold(userId, householdId, locationName, reason);
    if (!ok) return res.status(404).json({ success: false, error: 'Household not found' });
    res.json({ success: true });
  })
);

// GET /api/family/household/:id/history — merged roster + location history
router.get(
  '/household/:id/history',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const householdId = String(req.params.id);
    const history = await householdWriteService.getHouseholdHistory(userId, householdId);
    res.json({ success: true, history });
  })
);

export default router;
