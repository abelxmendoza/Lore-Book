import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { peoplePlacesService } from '../services/peoplePlacesService';

const router = Router();

router.get('/list', requireAuth, async (req: AuthenticatedRequest, res) => {
  const characters = await peoplePlacesService.listEntities(req.user!.id, 'person');
  res.json({ characters });
});

export const charactersRouter = router;
