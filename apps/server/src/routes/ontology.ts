/**
 * Ontology Explorer API — hierarchy, glossary, usage counts.
 */
import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { asyncHandler } from '../utils/asyncHandler';
import { buildOntology } from '../services/ontology/ontology';
import { generateOntologyAnalytics } from '../services/ontology/ontologyExplorerService';

const router = Router();

/** GET /api/ontology — full hierarchy + analytics (admin) */
router.get(
  '/',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : req.user!.id;
    const hierarchy = buildOntology();
    const analytics = await generateOntologyAnalytics(userId);
    res.json({
      success: true,
      hierarchy,
      analytics,
      generatedAt: new Date().toISOString(),
    });
  })
);

/** GET /api/ontology/analytics */
router.get(
  '/analytics',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const analytics = await generateOntologyAnalytics(userId);
    res.json({ success: true, analytics });
  })
);

export const ontologyRouter = router;
