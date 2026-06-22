import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { locationMergeService } from '../services/locationMergeService';
import { locationService } from '../services/locationService';
import { locationSuggestionService } from '../services/locationSuggestionService';
import { locationDomainAuditService } from '../services/locationDomainAuditService';
import { locationNormalizationService } from '../services/locationNormalizationService';
import { placeDuplicateScore } from '../services/ontology/placeIntelligence';
import { logger } from '../logger';
import { asyncHandler } from '../utils/asyncHandler';
import { normalizeNameKey, namesOverlapByContainment } from '../utils/nameNormalization';
import { supabaseAdmin } from '../services/supabaseClient';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const normalize = req.query.normalize === 'true';
  if (normalize) {
    await locationNormalizationService.normalizeUserLocations(userId).catch((err) => {
      logger.warn({ err, userId }, 'Background location normalization failed');
    });
  }
  const locations = await locationService.listLocations(userId);
  res.json({ locations });
});

router.get(
  '/audit',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const audit = await locationDomainAuditService.audit(userId);
    res.json({ success: true, audit });
  })
);

router.post(
  '/normalize',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const dryRun = req.query.dry_run === 'true';
    const report = await locationNormalizationService.normalizeUserLocations(userId, { dryRun });
    res.json({ success: true, report });
  })
);

router.get(
  '/merge-suggestions',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const suggestions = await locationNormalizationService.getMergeSuggestions(userId);
    res.json({ success: true, suggestions, count: suggestions.length });
  })
);

router.get(
  '/suggestions',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const rescan = req.query.rescan === 'true';
    const suggestions = await locationSuggestionService.getSuggestions(userId, { rescan });
    res.json({ success: true, suggestions, count: suggestions.length, scanned: rescan });
  })
);

router.post(
  '/suggestions/accept',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const schema = z.object({
      name: z.string().min(1),
      type: z.string().optional(),
      context: z.string().optional(),
      description: z.string().optional(),
      associatedWith: z.array(z.string()).optional(),
    });
    const body = schema.parse(req.body);
    try {
      const created = await locationSuggestionService.acceptSuggestion(userId, body);
      res.json({ success: true, location: created });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add place';
      logger.warn({ error, userId, name: body.name }, 'Location suggestion accept failed');
      res.status(400).json({ success: false, error: message });
    }
  })
);

router.get(
  '/duplicates',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { data, error } = await supabaseAdmin
      .from('locations')
      .select('id, name, type, metadata, created_at, updated_at, importance_score')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw error;

    const rows = data ?? [];
    const groups: Array<{
      match_type: 'exact' | 'containment' | 'alias';
      canonical_name: string;
      confidence: number;
      reason: string;
      evidence: string[];
      locations: typeof rows;
    }> = [];

    const byKey = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = normalizeNameKey(row.name);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(row);
    }

    for (const [canonical_name, locations] of byKey.entries()) {
      if (locations.length > 1) {
        groups.push({
          match_type: 'exact',
          canonical_name,
          confidence: 1,
          reason: 'normalized name match',
          evidence: ['exact duplicate normalized_name'],
          locations,
        });
      }
    }

    const seenPairs = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const left = rows[i];
        const right = rows[j];
        const leftKey = normalizeNameKey(left.name);
        const rightKey = normalizeNameKey(right.name);
        if (leftKey === rightKey) continue;

        const aliasScore = placeDuplicateScore(left.name, right.name);
        const containment = namesOverlapByContainment(leftKey, rightKey);
        if (!containment && aliasScore < 0.65) continue;

        const pairKey = [left.id, right.id].sort().join(':');
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        const match_type = aliasScore >= 0.65 ? 'alias' as const : 'containment' as const;
        groups.push({
          match_type,
          canonical_name: leftKey.length <= rightKey.length ? left.name : right.name,
          confidence: aliasScore >= 0.65 ? aliasScore : 0.75,
          reason: match_type === 'alias' ? 'venue alias / token overlap' : 'name containment',
          evidence: [
            `score: ${aliasScore.toFixed(2)}`,
            `names: "${left.name}" ↔ "${right.name}"`,
          ],
          locations: [left, right],
        });
      }
    }

    res.json({ duplicate_groups: groups });
  })
);

router.post(
  '/merge',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      source_id: z.string().uuid(),
      target_id: z.string().uuid(),
      reason: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid merge request', details: parsed.error.flatten() });
      return;
    }

    const report = await locationMergeService.merge(req.user!.id, parsed.data.source_id, parsed.data.target_id, {
      reason: parsed.data.reason,
    });

    const { data: mergedLocation } = await supabaseAdmin
      .from('locations')
      .select('*')
      .eq('id', parsed.data.target_id)
      .eq('user_id', req.user!.id)
      .maybeSingle();

    res.json({ merged: true, report, location: mergedLocation ?? null });
  })
);

// GET /api/locations/:id — full profile for modals and deep links
router.get('/:id', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const locationId = String(req.params.id);
  const canonicalId =
    (await locationMergeService.resolveCanonicalLocationId(userId, locationId, { promote: false })) ??
    locationId;
  const location = await locationService.getLocationProfile(userId, canonicalId);
  if (!location) {
    res.status(404).json({ error: 'Location not found' });
    return;
  }
  res.json({ location });
}));

// GET /api/locations/:id/facts
router.get('/:id/facts', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  const locationId = String(req.params.id);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Authority: tolerate a people_places id from the Book without creating rows on a GET.
    const canonicalId = (await locationMergeService.resolveCanonicalLocationId(userId, locationId, { promote: false })) ?? locationId;
    const { entityFactsService } = await import('../services/entityFactsService');
    const facts = await entityFactsService.getEntityFacts(userId, canonicalId, 'location');
    res.json({ success: true, facts });
  } catch (error) {
    logger.error({ error, locationId }, 'Failed to get location facts');
    res.status(500).json({ error: 'Failed to get location facts' });
  }
});

// PATCH /api/locations/:id — update place type, tags, significance
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const locationId = String(req.params.id);

  const schema = z.object({
    type: z.string().nullable().optional(),
    place_tags: z.array(z.string()).optional(),
    place_significance: z.array(z.string()).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.issues });
    return;
  }

  try {
    // Authority: a people_places id from the Book resolves to the canonical
    // locations.id (promoting it if needed) before the normal patch flow.
    const canonicalId = (await locationMergeService.resolveCanonicalLocationId(userId, locationId)) ?? locationId;
    const location = await locationService.updateLocation(userId, canonicalId, parsed.data);
    if (!location) {
      res.status(404).json({ success: false, error: 'Location not found' });
      return;
    }
    res.json({ success: true, location });
  } catch (error) {
    logger.error({ error, locationId }, 'Failed to update location');
    res.status(500).json({ success: false, error: 'Failed to update location' });
  }
});

export const locationsRouter = router;
