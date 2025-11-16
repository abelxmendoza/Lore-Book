import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { autopilotService, type AutopilotFormat } from '../services/autopilotService';

const router = Router();

const resolveFormat = (req: AuthenticatedRequest): AutopilotFormat => {
  const queryFormat = (req.query.format as string | undefined)?.toLowerCase();
  if (queryFormat === 'markdown') return 'markdown';
  if (queryFormat === 'json') return 'json';
  return req.accepts('markdown') ? 'markdown' : 'json';
};

router.get('/daily', requireAuth, async (req: AuthenticatedRequest, res) => {
  const format = resolveFormat(req);
  try {
    const result = await autopilotService.getDailyPlan(req.user!.id, format);
    if (format === 'markdown') {
      return res.type('text/markdown').send(result as string);
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate daily plan' });
  }
});

router.get('/weekly', requireAuth, async (req: AuthenticatedRequest, res) => {
  const format = resolveFormat(req);
  try {
    const result = await autopilotService.getWeeklyStrategy(req.user!.id, format);
    if (format === 'markdown') {
      return res.type('text/markdown').send(result as string);
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate weekly strategy' });
  }
});

router.get('/monthly', requireAuth, async (req: AuthenticatedRequest, res) => {
  const format = resolveFormat(req);
  try {
    const result = await autopilotService.getMonthlyCorrection(req.user!.id, format);
    if (format === 'markdown') {
      return res.type('text/markdown').send(result as string);
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate monthly correction' });
  }
});

router.get('/transition', requireAuth, async (req: AuthenticatedRequest, res) => {
  const format = resolveFormat(req);
  try {
    const result = await autopilotService.getTransition(req.user!.id, format);
    if (format === 'markdown') {
      return res.type('text/markdown').send(result as string);
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate transition guidance' });
  }
});

router.get('/alerts', requireAuth, async (req: AuthenticatedRequest, res) => {
  const format = resolveFormat(req);
  try {
    const result = await autopilotService.getAlerts(req.user!.id, format);
    if (format === 'markdown') {
      return res.type('text/markdown').send(result as string);
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to detect alerts' });
  }
});

router.get('/momentum', requireAuth, async (req: AuthenticatedRequest, res) => {
  const format = resolveFormat(req);
  try {
    const result = await autopilotService.getMomentum(req.user!.id, format);
    if (format === 'markdown') {
      return res.type('text/markdown').send(result as string);
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to detect momentum' });
  }
});

export const autopilotRouter = router;
