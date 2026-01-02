import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { hqiService, type HQISearchFilters } from '../services/hqiService';

const router = Router();

const parseFilters = (payload: any): HQISearchFilters => {
  const filters: HQISearchFilters = {};
  if (payload.time_start) filters.timeStart = payload.time_start;
  if (payload.time_end) filters.timeEnd = payload.time_end;
  if (payload.tags) filters.tags = Array.isArray(payload.tags) ? payload.tags : String(payload.tags).split(',');
  if (payload.characters)
    filters.characters = Array.isArray(payload.characters) ? payload.characters : String(payload.characters).split(',');
  if (payload.motifs) filters.motifs = Array.isArray(payload.motifs) ? payload.motifs : String(payload.motifs).split(',');
  return filters;
};

router.get('/search', requireAuth, (req: AuthenticatedRequest, res) => {
  const query = (req.query.query as string) ?? '';
  const filters = parseFilters(req.query);
  const results = hqiService.search(query, filters);
  res.json({ results });
});

router.post('/search', requireAuth, (req: AuthenticatedRequest, res) => {
  const query = (req.body.query as string) ?? '';
  const filters = parseFilters(req.body?.filters ?? req.body ?? {});
  const results = hqiService.search(query, filters);
  res.json({ results });
});

router.get('/node/:id/context', requireAuth, (req: AuthenticatedRequest, res) => {
  const context = hqiService.context(req.params.id);
  if (!context) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(context);
});

export const hqiRouter = router;
