/**
 * Life API — Phase 4 User-Visible Intelligence + Story Surface
 * GET /api/life/summary, /api/life/era-summary
 * GET /api/life/arcs, /api/life/current-chapter, /api/life/conflicts, /api/life/momentum
 */

import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import {
  generateLifeSummary,
  summarizeEra,
  resolveEntityNamesForEdges,
} from '../services/userVisibleIntelligence';
import type { EdgeWithIds } from '../services/userVisibleIntelligence';
import { getRelationshipsInRange } from '../services/temporalRelationshipQueries';
import { lifeStoryApiService } from '../services/lifeStoryApiService';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

function parseIso(s: unknown): string | null {
  if (typeof s !== 'string' || !s.trim()) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * GET /api/life/summary?start=&end=
 * Weekly/monthly life summary: current vs previous window, diff, insights, era narrative.
 */
router.get('/summary', requireAuth, async (req: AuthenticatedRequest, res) => {
  const start = parseIso(req.query.start);
  const end = parseIso(req.query.end);
  if (!start || !end) {
    return res.status(400).json({ error: 'start and end are required as ISO 8601 dates' });
  }
  if (start > end) {
    return res.status(400).json({ error: 'start must be <= end' });
  }

  const result = await generateLifeSummary(req.user!.id, start, end);
  res.json(result);
});

/**
 * GET /api/life/era-summary?start=&end=
 * Era summary: dominant_scopes, defining_people, narrative.
 */
router.get('/era-summary', requireAuth, async (req: AuthenticatedRequest, res) => {
  const start = parseIso(req.query.start);
  const end = parseIso(req.query.end);
  if (!start || !end) {
    return res.status(400).json({ error: 'start and end are required as ISO 8601 dates' });
  }
  if (start > end) {
    return res.status(400).json({ error: 'start must be <= end' });
  }

  const { edges } = await getRelationshipsInRange(req.user!.id, { start, end });
  const resolved = await resolveEntityNamesForEdges(req.user!.id, (edges ?? []) as EdgeWithIds[]);
  const result = summarizeEra(resolved, start, end);
  res.json(result);
});

/** GET /api/life/arcs — candidate life arcs with provenance (read-only synthesis) */
router.get(
  '/arcs',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const payload = await lifeStoryApiService.getLifeArcsResponse(req.user!.id);
    res.json(payload);
  })
);

/** GET /api/life/current-chapter — dominant chapter narrative + why */
router.get(
  '/current-chapter',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const payload = await lifeStoryApiService.getCurrentChapterResponse(req.user!.id);
    res.json(payload);
  })
);

/** GET /api/life/conflicts — goal/time/resource tensions shaping life */
router.get(
  '/conflicts',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const payload = await lifeStoryApiService.getLifeConflictsResponse(req.user!.id);
    res.json(payload);
  })
);

/** GET /api/life/momentum — per-arc momentum indicators */
router.get(
  '/momentum',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const payload = await lifeStoryApiService.getLifeMomentumResponse(req.user!.id);
    res.json(payload);
  })
);

export const lifeRouter = router;
