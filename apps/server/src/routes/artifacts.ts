import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../logger';
import {
  artifactRegistry,
  type ArtifactIndexType,
} from '../services/artifactRegistry';
import type { LoreAssetKind } from '../services/loreAssetPresentation';
import {
  refreshProjection,
  refreshStaleProjections,
  type RefreshableProjectionType,
} from '../services/projectionRefreshService';
import type { TruthState } from '../services/provenance';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

const listQuerySchema = z.object({
  type: z.string().optional(),
  truthState: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).optional(),
  grouped: z.coerce.boolean().optional(),
  includeStale: z.coerce.boolean().optional(),
  view: z.enum(['assets']).optional(),
  assetKind: z.enum(['moment', 'portrait', 'evidence', 'pattern', 'chapter', 'scene']).optional(),
  staleOnly: z.coerce.boolean().optional(),
});

// GET /api/artifacts
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
    }

    const userId = req.user!.id;
    const { type, truthState, limit, grouped, includeStale, view, assetKind, staleOnly } = parsed.data;

    if (view === 'assets') {
      const result = await artifactRegistry.listLoreAssets(userId, {
        assetKind: assetKind as LoreAssetKind | undefined,
        truthState: truthState as TruthState | undefined,
        limit,
        staleOnly,
      });
      return res.json(result);
    }

    if (grouped) {
      const data = await artifactRegistry.listGrouped(userId, limit ?? 100);
      return res.json(data);
    }

    const artifacts = await artifactRegistry.list(userId, {
      type: type as ArtifactIndexType | undefined,
      truthState: truthState as TruthState | undefined,
      limit,
      includeStale,
    });

    res.json({ artifacts, total: artifacts.length });
  })
);

const refreshBodySchema = z.object({
  type: z.enum(['biography_snapshot', 'timeline_event']),
});

// POST /api/artifacts/refresh-stale
router.post(
  '/refresh-stale',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const parsed = z.object({
      items: z.array(z.object({
        id: z.string(),
        type: z.enum(['biography_snapshot', 'timeline_event']),
        stale: z.boolean().optional(),
      })),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const results = await refreshStaleProjections(userId, parsed.data.items);
    res.json({ results, refreshed: results.filter((r) => r.refreshed).length });
  })
);

// POST /api/artifacts/:id/refresh
router.post(
  '/:id/refresh',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = refreshBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const userId = req.user!.id;
    const { id } = req.params;
    const result = await refreshProjection(
      userId,
      id,
      parsed.data.type as RefreshableProjectionType
    );

    if (!result.refreshed) {
      return res.status(422).json(result);
    }

    res.json(result);
  })
);

// GET /api/artifacts/:id
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { id } = req.params;
    const type = req.query.type as ArtifactIndexType | undefined;

    const result = await artifactRegistry.get(userId, id, type);
    if (!result) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    res.json(result);
  })
);

// GET /api/artifacts/:id/provenance
router.get(
  '/:id/provenance',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { id } = req.params;

    try {
      const provenance = await artifactRegistry.provenance(userId, id);
      res.json(provenance);
    } catch (err) {
      logger.warn({ err, userId, artifactId: id }, 'artifacts/provenance failed');
      res.status(500).json({ error: 'Failed to load provenance' });
    }
  })
);

export const artifactsRouter = router;
