import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { canonicalService } from '../services/canonicalService';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const alignment = await canonicalService.buildAlignment(req.user!.id);
  const stats = canonicalService.summarizeCorrections(alignment.records);
  res.json({ alignment, stats });
});

export const canonRouter = router;
