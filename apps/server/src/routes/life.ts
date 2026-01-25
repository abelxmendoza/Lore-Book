/**
 * Life API — Phase 4 User-Visible Intelligence
 * GET /api/life/summary, /api/life/era-summary
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

export const lifeRouter = router;
