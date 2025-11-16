import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { locationService } from '../services/locationService';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const locations = await locationService.listLocations(req.user!.id);
  res.json({ locations });
});

export const locationsRouter = router;
