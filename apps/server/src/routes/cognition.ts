/**
 * Cognition API — unified graph, provenance, epistemic, salience surfaces.
 */
import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import {
  getEvidenceForTarget,
  listGraphNodes,
  listEdgesFromNode,
  salienceService,
} from '../services/cognition';
import {
  isUuid,
  parseAssertionTargetKind,
  parseGraphNodeKind,
  parseQueryLimit,
} from '../services/cognition/cognitionValidation';
import { getProvenanceByClaimId, getProvenanceBySource } from '../services/narrativeSpine';
import { compileLifeHistory, historyEngineService } from '../services/narrative/history';
import { compileNarrativeIR } from '../services/narrative/narrativeCompilerService';
import { supabaseAdmin } from '../services/supabaseClient';

const router = Router();

/** GET /api/cognition/graph/nodes?kind=&limit= */
router.get(
  '/graph/nodes',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const nodeKind = parseGraphNodeKind(req.query.kind as string | undefined);
    if (req.query.kind && !nodeKind) {
      return res.status(400).json({ error: `Unsupported node kind: ${req.query.kind}` });
    }

    const limit = parseQueryLimit(req.query.limit, 50, 200);
    const nodes = await listGraphNodes(req.user!.id, {
      nodeKind: nodeKind as never,
      limit,
    });
    res.json({ success: true, nodes });
  }),
);

/** GET /api/cognition/graph/edges/:nodeId */
router.get(
  '/graph/edges/:nodeId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { nodeId } = req.params;
    if (!isUuid(nodeId)) {
      return res.status(400).json({ error: 'nodeId must be a valid UUID' });
    }

    const edges = await listEdgesFromNode(req.user!.id, nodeId);
    res.json({ success: true, edges });
  }),
);

/** GET /api/cognition/assertions/:targetKind/:targetId/provenance */
router.get(
  '/assertions/:targetKind/:targetId/provenance',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { targetKind, targetId } = req.params;
    const userId = req.user!.id;

    const parsedKind = parseAssertionTargetKind(targetKind);
    if (!parsedKind) {
      return res.status(400).json({ error: `Unsupported targetKind: ${targetKind}` });
    }
    if (!isUuid(targetId)) {
      return res.status(400).json({ error: 'targetId must be a valid UUID' });
    }

    if (parsedKind === 'narrative_claim') {
      const report = await getProvenanceByClaimId(userId, targetId);
      if (!report) return res.status(404).json({ error: 'Claim not found' });
      return res.json({ success: true, report });
    }

    const evidence = await getEvidenceForTarget(userId, parsedKind, targetId);
    res.json({ success: true, evidence });
  }),
);

/** GET /api/cognition/salience?limit= */
router.get(
  '/salience',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const limit = parseQueryLimit(req.query.limit, 20, 100);
    const items = await salienceService.getTop(req.user!.id, limit);
    res.json({ success: true, items });
  }),
);

/** POST /api/cognition/salience/recompute */
router.post(
  '/salience/recompute',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const count = await salienceService.recompute(req.user!.id);
    res.json({ success: true, count });
  }),
);

/** GET /api/cognition/life-history */
router.get(
  '/life-history',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const history = await historyEngineService.compile(req.user!.id);
    res.json({ success: true, history });
  }),
);

/** GET /api/cognition/causal-chain/:eventId */
router.get(
  '/causal-chain/:eventId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { eventId } = req.params;

    if (!isUuid(eventId)) {
      return res.status(400).json({ error: 'eventId must be a valid UUID' });
    }

    const report = await getProvenanceBySource(userId, {
      sourceTable: 'resolved_events',
      sourceId: eventId,
    });

    const { data: causalLinks, error: causalError } = await supabaseAdmin
      .from('event_causal_links')
      .select('*')
      .eq('user_id', userId)
      .or(`cause_event_id.eq.${eventId},effect_event_id.eq.${eventId}`);

    if (causalError) {
      return res.status(503).json({
        error: 'Could not load causal links',
        eventId,
        provenance: report,
      });
    }

    res.json({
      success: true,
      eventId,
      provenance: report,
      causalLinks: causalLinks ?? [],
    });
  }),
);

/** GET /api/cognition/autobiography-outline */
router.get(
  '/autobiography-outline',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const [ir, history] = await Promise.all([
      compileNarrativeIR(userId),
      compileLifeHistory(userId),
    ]);

    const outline = {
      mode: 'autobiography' as const,
      generatedAt: new Date().toISOString(),
      currentChapter: ir.currentChapter,
      lifeChapters: history.chapters,
      turningPoints: history.turningPoints,
      interpretationClaims: ir.evidence.filter((e) => e.source === 'narrative' || e.source === 'episode'),
      themes: [...new Set(history.chapters.flatMap((c) => c.themes))],
      voice: 'first_person',
      evidenceRequired: true,
    };

    res.json({ success: true, outline });
  }),
);

export const cognitionRouter = router;
