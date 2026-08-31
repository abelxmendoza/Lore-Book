import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { loadNavigationCounts } from '../services/navigationCountService';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    res.json(await loadNavigationCounts(userId));
  } catch {
    res.json({
      characters: 0,
      family: 0,
      romantic: 0,
      organizations: 0,
      locations: 0,
      events: 0,
      projects: 0,
      skills: 0,
      anchors: 0,
    });
  }
});

export { router as countsRouter };
