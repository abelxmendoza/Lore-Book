/**
 * Admin Chronicle routes — LoreBook living project history.
 */

import { Router } from 'express';

import { logger } from '../logger';
import type { AuthenticatedRequest } from '../middleware/auth';
import {
  acceptDetection,
  getProjectChronicle,
  refreshChronicleSources,
  rejectDetection,
} from '../services/chronicle/projectChronicleService';

export const chronicleAdminRouter = Router();

chronicleAdminRouter.get('/', async (_req: AuthenticatedRequest, res) => {
  try {
    const snapshot = await getProjectChronicle();
    res.json(snapshot);
  } catch (error) {
    logger.error({ error }, 'Chronicle: failed to load snapshot');
    res.status(500).json({ error: 'Failed to load project chronicle' });
  }
});

chronicleAdminRouter.post('/refresh', async (_req: AuthenticatedRequest, res) => {
  try {
    const result = await refreshChronicleSources();
    const snapshot = await getProjectChronicle();
    res.json({ ...result, chronicle: snapshot });
  } catch (error) {
    logger.error({ error }, 'Chronicle: refresh failed');
    res.status(500).json({ error: 'Failed to refresh chronicle sources' });
  }
});

chronicleAdminRouter.post('/detections/:id/accept', async (req: AuthenticatedRequest, res) => {
  try {
    const milestone = await acceptDetection(req.params.id);
    if (!milestone) {
      return res.status(404).json({ error: 'Detection not found' });
    }
    const snapshot = await getProjectChronicle();
    res.json({ milestone, chronicle: snapshot });
  } catch (error) {
    logger.error({ error }, 'Chronicle: accept detection failed');
    res.status(500).json({ error: 'Failed to accept detection' });
  }
});

chronicleAdminRouter.post('/detections/:id/reject', async (req: AuthenticatedRequest, res) => {
  try {
    const ok = await rejectDetection(req.params.id);
    if (!ok) {
      return res.status(404).json({ error: 'Detection not found' });
    }
    const snapshot = await getProjectChronicle();
    res.json({ chronicle: snapshot });
  } catch (error) {
    logger.error({ error }, 'Chronicle: reject detection failed');
    res.status(500).json({ error: 'Failed to reject detection' });
  }
});
