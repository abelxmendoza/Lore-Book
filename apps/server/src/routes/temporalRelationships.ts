/**
 * Temporal relationship scoped queries — Phase 2.1, 3.2
 * GET /by-scope, /fading, /core-for-era, /insights
 */

import { Router } from 'express';

import { fetchActiveTemporalEdges } from '../er/temporalEdgeService';
import { generateRelationshipInsights } from '../er/relationshipInsights';
import { RELATIONSHIP_SCOPE_SET } from '../er/scopeInference';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import {
  getRelationshipsByScope,
  getFadingConnections,
  getCorePeopleForEra,
  getRelationshipsInRange,
} from '../services/temporalRelationshipQueries';
import {
  resolveEntityNamesForEdges,
  generateRelationshipNarrative,
} from '../services/userVisibleIntelligence';
import type { EdgeWithIds } from '../services/userVisibleIntelligence';

const router = Router();

function parseIso(s: unknown): string | null {
  if (typeof s !== 'string' || !s.trim()) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * GET /api/relationships/by-scope?scope=work&start=&end=
 */
router.get('/by-scope', requireAuth, async (req: AuthenticatedRequest, res) => {
  const scope = req.query.scope as string | undefined;
  if (!scope || !RELATIONSHIP_SCOPE_SET.has(scope as any)) {
    return res.status(400).json({ error: 'scope is required and must be one of: ' + [...RELATIONSHIP_SCOPE_SET].join(', ') });
  }
  const start = parseIso(req.query.start);
  const end = parseIso(req.query.end);
  if (!start || !end) {
    return res.status(400).json({ error: 'start and end are required as ISO 8601 dates' });
  }
  if (start > end) {
    return res.status(400).json({ error: 'start must be <= end' });
  }

  const result = await getRelationshipsByScope(req.user!.id, scope, { start, end });
  res.json(result);
});

/**
 * GET /api/relationships/fading?scope=work
 * scope is optional.
 */
router.get('/fading', requireAuth, async (req: AuthenticatedRequest, res) => {
  const scope = req.query.scope as string | undefined;
  if (scope != null && scope !== '' && !RELATIONSHIP_SCOPE_SET.has(scope as any)) {
    return res.status(400).json({ error: 'scope must be one of: ' + [...RELATIONSHIP_SCOPE_SET].join(', ') });
  }

  const result = await getFadingConnections(req.user!.id, scope || undefined);
  res.json(result);
});

/**
 * GET /api/relationships/core-for-era?scope=family&start=&end=
 */
router.get('/core-for-era', requireAuth, async (req: AuthenticatedRequest, res) => {
  const scope = req.query.scope as string | undefined;
  if (!scope || !RELATIONSHIP_SCOPE_SET.has(scope as any)) {
    return res.status(400).json({ error: 'scope is required and must be one of: ' + [...RELATIONSHIP_SCOPE_SET].join(', ') });
  }
  const start = parseIso(req.query.start);
  const end = parseIso(req.query.end);
  if (!start || !end) {
    return res.status(400).json({ error: 'start and end are required as ISO 8601 dates' });
  }
  if (start > end) {
    return res.status(400).json({ error: 'start must be <= end' });
  }

  const result = await getCorePeopleForEra(req.user!.id, scope, { start, end });
  res.json(result);
});

/**
 * GET /api/relationships/insights
 * Rule-based relationship insights (FADE_WARNING, CORE_STABILITY, SCOPE_CONCENTRATION).
 * Uses fetchActiveTemporalEdges and generateRelationshipInsights; sorted by relevance.
 */
router.get('/insights', requireAuth, async (req: AuthenticatedRequest, res) => {
  const edges = await fetchActiveTemporalEdges(req.user!.id);
  const insights = generateRelationshipInsights(edges);
  res.json({ insights });
});

/**
 * GET /api/relationships/narratives?start=&end=
 * One short sentence per relationship (by phase). start/end optional; if both present, filter by time range.
 */
router.get('/narratives', requireAuth, async (req: AuthenticatedRequest, res) => {
  const start = parseIso(req.query.start);
  const end = parseIso(req.query.end);
  let edges: unknown[];

  if (start != null && end != null && start <= end) {
    const result = await getRelationshipsInRange(req.user!.id, { start, end });
    edges = result.edges ?? [];
  } else {
    edges = await fetchActiveTemporalEdges(req.user!.id);
  }

  const resolved = await resolveEntityNamesForEdges(req.user!.id, edges as EdgeWithIds[]);
  const narratives = resolved.map((e) => generateRelationshipNarrative(e));
  res.json({ narratives });
});

export const temporalRelationshipsRouter = router;
