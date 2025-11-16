import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { memoryGraphService } from '../services/memoryGraphService';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const graph = await memoryGraphService.buildGraph(req.user!.id);
  res.json({ graph });
});

export const memoryGraphRouter = router;
