/**
 * Revealed Preference Engine API.
 *   GET  /api/revealed-self                  — the Revealed Self report (lazily scans on first use)
 *   POST /api/revealed-self/rescan           — force a fresh rebuild from episodes
 *   GET  /api/revealed-self/signal/:id/evidence — full provenance for one signal
 */

import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { revealedPreferenceService } from '../services/revealedPreference/revealedPreferenceService';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    let report = await revealedPreferenceService.getRevealedSelf(userId);
    // First visit (or explicit ?rescan=true): build it now so the panel is never empty
    // for a user who actually has episodes.
    if (!report.hasData || req.query.rescan === 'true') {
      await revealedPreferenceService.rescan(userId);
      report = await revealedPreferenceService.getRevealedSelf(userId);
    }
    return res.json(report);
  } catch (error) {
    logger.error({ err: error, userId }, 'Failed to build revealed-self report');
    return res.status(500).json({ error: 'Failed to build revealed-self report' });
  }
});

router.post('/rescan', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    const summary = await revealedPreferenceService.rescan(userId);
    return res.json(summary);
  } catch (error) {
    logger.error({ err: error, userId }, 'Revealed-self rescan failed');
    return res.status(500).json({ error: 'Rescan failed' });
  }
});

router.get('/signal/:id/evidence', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const signalId = req.params.id as string;
  try {
    const evidence = await revealedPreferenceService.getEvidence(userId, signalId);
    return res.json({ evidence });
  } catch (error) {
    logger.error({ err: error, userId, signalId }, 'Failed to fetch preference evidence');
    return res.status(500).json({ error: 'Failed to fetch evidence' });
  }
});

export const revealedPreferenceRouter = router;
