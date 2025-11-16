import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { peoplePlacesService } from '../services/peoplePlacesService';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { type } = req.query;
  const allowedTypes = ['person', 'place'] as const;
  const filter = allowedTypes.includes(type as 'person' | 'place') ? (type as 'person' | 'place') : undefined;

  const entities = await peoplePlacesService.listEntities(req.user!.id, filter);
  res.json({ entities });
});

router.get('/stats', requireAuth, async (req: AuthenticatedRequest, res) => {
  const stats = await peoplePlacesService.getStats(req.user!.id);
  res.json({ stats });
});

router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const entity = await peoplePlacesService.getEntity(req.user!.id, req.params.id);
  if (!entity) {
    return res.status(404).json({ error: 'Entity not found' });
  }
  res.json({ entity });
});

const aliasSchema = z.object({ alias: z.string().min(1) });
router.post('/:id/aliases', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = aliasSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const updated = await peoplePlacesService.addAlias(req.user!.id, req.params.id, parsed.data.alias);
  if (!updated) {
    return res.status(404).json({ error: 'Entity not found' });
  }

  res.status(201).json({ entity: updated });
});

export const peoplePlacesRouter = router;
