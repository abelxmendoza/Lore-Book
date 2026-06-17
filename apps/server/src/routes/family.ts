/**
 * Family graph, households, analytics API.
 */
import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { familyGraphService } from '../services/kinship/familyGraphService';
import { householdService } from '../services/kinship/householdService';
import { familyTreeService } from '../services/familyTreeService';
import { supabaseAdmin } from '../services/supabaseClient';
import { listPeripheralsForUser } from '../services/relationshipPeripheralService';

const router = Router();

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

export default router;
