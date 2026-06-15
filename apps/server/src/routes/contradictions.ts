/**
 * Contradiction Engine API.
 *   GET  /api/contradictions                     — report (lazily detects on first use)
 *   POST /api/contradictions/detect              — force re-detection (lifecycle: open→resolved)
 *   GET  /api/contradictions/epiphany-candidates — Phase 6: queryable candidate epiphanies
 *   GET  /api/contradictions/:id/evidence        — supporting episodes for one contradiction
 */

import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { contradictionEngine } from '../services/contradiction/contradictionEngine';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    let report = await contradictionEngine.getReport(userId);
    if (report.contradictions.length === 0 || req.query.detect === 'true') {
      await contradictionEngine.detect(userId);
      report = await contradictionEngine.getReport(userId);
    }
    return res.json(report);
  } catch (error) {
    logger.error({ err: error, userId }, 'Failed to build contradiction report');
    return res.status(500).json({ error: 'Failed to build contradiction report' });
  }
});

router.post('/detect', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    const summary = await contradictionEngine.detect(userId);
    return res.json(summary);
  } catch (error) {
    logger.error({ err: error, userId }, 'Contradiction detection failed');
    return res.status(500).json({ error: 'Detection failed' });
  }
});

router.get('/epiphany-candidates', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    const candidates = await contradictionEngine.getEpiphanyCandidates(userId);
    return res.json({ candidates });
  } catch (error) {
    logger.error({ err: error, userId }, 'Failed to fetch epiphany candidates');
    return res.status(500).json({ error: 'Failed to fetch epiphany candidates' });
  }
});

router.get('/:id/evidence', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const id = req.params.id as string;
  try {
    const evidence = await contradictionEngine.getEvidence(userId, id);
    if (!evidence) return res.status(404).json({ error: 'Not found' });
    return res.json(evidence);
  } catch (error) {
    logger.error({ err: error, userId, id }, 'Failed to fetch contradiction evidence');
    return res.status(500).json({ error: 'Failed to fetch evidence' });
  }
});

export const contradictionsRouter = router;
