import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { entityLearningService } from '../services/entityLearningService';
import { locationMergeService } from '../services/locationMergeService';
import { locationService } from '../services/locationService';
import { locationSuggestionService } from '../services/locationSuggestionService';
import { locationDomainAuditService } from '../services/locationDomainAuditService';
import { locationNormalizationService } from '../services/locationNormalizationService';
import { reviewPlaceDuplicateCompatibility } from '../services/ontology/placeIntelligence';
import { labelPlaceDuplicate } from '../services/lexical/places/placeDuplicateLabeler';
import { logger } from '../logger';
import { asyncHandler } from '../utils/asyncHandler';
import { normalizeNameKey, normalizeDuplicateKey, namesOverlapByContainment } from '../utils/nameNormalization';
import { supabaseAdmin } from '../services/supabaseClient';

const router = Router();

type LocationDuplicateRow = {
  id: string;
  name: string;
  type?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
  importance_score?: number | null;
};

export type LocationDuplicateGroup = {
  match_type: 'exact' | 'containment' | 'alias';
  canonical_name: string;
  confidence: number;
  reason: string;
  /** Subtype-aware human label ("Private residence alias", "City alias", …). */
  label?: string;
  place_subtype?: string;
  owner_display_name?: string;
  privacy_sensitive?: boolean;
  variant_reason?: string;
  evidence: string[];
  locations: LocationDuplicateRow[];
};

function locationAliasNames(row: { name: string; metadata?: Record<string, unknown> | null }): string[] {
  const aliases = Array.isArray(row.metadata?.aliases)
    ? (row.metadata!.aliases as unknown[]).filter((alias): alias is string => typeof alias === 'string' && alias.trim().length > 0)
    : [];
  return [row.name, ...aliases];
}

function aliasMatch(
  left: { name: string; metadata?: Record<string, unknown> | null },
  right: { name: string; metadata?: Record<string, unknown> | null },
): string | null {
  const leftNames = locationAliasNames(left);
  const rightNames = locationAliasNames(right);
  const rightKeys = new Map(rightNames.map((name) => [normalizeNameKey(name), name]));
  for (const leftName of leftNames) {
    const rightName = rightKeys.get(normalizeNameKey(leftName));
    if (rightName) return `"${leftName}" matches "${rightName}"`;
  }
  return null;
}

function residenceOwnerKey(name: string): string | null {
  const n = normalizeNameKey(name).replace(/[’‘`]/g, "'");
  const kin = /^(mom|dad|mother|father|abuela|abuelo|grandma|grandpa|tio|tío|tia|tía|aunt|uncle)s?\s+(?:house|home|place|apartment|apt|condo|residence|casa)\b/.exec(n);
  const possessive = /^([a-zà-ÿ][\wà-ÿ.\s-]*?)(?:'s|s)\s+(?:house|home|place|apartment|apt|condo|residence|casa)\b/i.exec(n);
  const raw = kin?.[1] ?? possessive?.[1];
  if (!raw) return null;
  return raw
    .replace(/^mother$/, 'mom')
    .replace(/^father$/, 'dad')
    .replace(/^grandma$/, 'abuela')
    .replace(/^grandpa$/, 'abuelo')
    .replace(/^tía$/, 'tia')
    .replace(/^tío$/, 'tio');
}

function isGenericResidenceName(name: string): boolean {
  const n = normalizeNameKey(name);
  return /\bfamily\s+(?:home|house)\b/.test(n) || /^(?:home|house|family home|family house|the house|our house|my house)$/.test(n);
}

function isElderFamilyResidenceOwner(owner: string | null): boolean {
  return owner != null && /^(?:abuela|abuelo|grandma|grandpa)$/.test(owner);
}

export function buildLocationDuplicateGroups(rows: LocationDuplicateRow[]): LocationDuplicateGroup[] {
  const groups: LocationDuplicateGroup[] = [];

  const byKey = new Map<string, LocationDuplicateRow[]>();
  for (const row of rows) {
    // Apostrophe-insensitive so "Mom's House" and "Moms House" group as one.
    const key = normalizeDuplicateKey(row.name);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(row);
  }

  for (const [canonical_name, locations] of byKey.entries()) {
    if (locations.length > 1) {
      const exactLabel = labelPlaceDuplicate(locations[0].name, locations[1].name);
      groups.push({
        match_type: 'exact',
        canonical_name: exactLabel.canonicalSuggestion || canonical_name,
        confidence: 1,
        reason: exactLabel.variantReason ?? 'normalized name match',
        label: exactLabel.label,
        place_subtype: exactLabel.placeSubtype,
        owner_display_name: exactLabel.ownerDisplayName,
        privacy_sensitive: exactLabel.privacySensitive,
        variant_reason: exactLabel.variantReason,
        evidence: ['exact duplicate normalized_name'],
        locations,
      });
    }
  }

  const ownerSpecificResidenceOwners = new Set(
    rows
      .map((row) => residenceOwnerKey(row.name))
      .filter((owner): owner is string => !!owner)
  );
  const hasElderResidenceOwner = Array.from(ownerSpecificResidenceOwners).some(isElderFamilyResidenceOwner);
  const seenPairs = new Set<string>();
  const seenGenericOwnerPairs = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const left = rows[i];
      const right = rows[j];
      const leftKey = normalizeDuplicateKey(left.name);
      const rightKey = normalizeDuplicateKey(right.name);
      if (leftKey === rightKey) continue;

      const review = reviewPlaceDuplicateCompatibility(left.name, right.name);
      const genericResidencePair = isGenericResidenceName(left.name) || isGenericResidenceName(right.name);
      const pairedOwner = residenceOwnerKey(left.name) ?? residenceOwnerKey(right.name);
      const genericOwnerAmbiguous =
        ownerSpecificResidenceOwners.size > 1 &&
        genericResidencePair &&
        pairedOwner &&
        review.relationship === 'possible_alias' &&
        (hasElderResidenceOwner ? !isElderFamilyResidenceOwner(pairedOwner) : true);
      if (genericOwnerAmbiguous) continue;

      if (genericResidencePair && pairedOwner) {
        const genericName = isGenericResidenceName(left.name) ? left.name : right.name;
        const genericOwnerKey = `${normalizeDuplicateKey(genericName)}:${pairedOwner}`;
        if (seenGenericOwnerPairs.has(genericOwnerKey)) continue;
        seenGenericOwnerPairs.add(genericOwnerKey);
      }

      const containment = namesOverlapByContainment(leftKey, rightKey);
      const aliasesOverlap = aliasMatch(left, right);
      if (!review.canMerge && !containment && !aliasesOverlap) continue;
      if (!review.canMerge && !aliasesOverlap) continue;

      const pairKey = [left.id, right.id].sort().join(':');
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      const match_type = aliasesOverlap || review.relationship === 'alias_of' ? 'alias' as const : 'containment' as const;
      const dupLabel = labelPlaceDuplicate(left.name, right.name);
      groups.push({
        match_type,
        canonical_name: dupLabel.canonicalSuggestion || (leftKey.length <= rightKey.length ? left.name : right.name),
        confidence: aliasesOverlap ? Math.max(review.confidence, 0.95) : review.confidence,
        reason: dupLabel.variantReason ?? (aliasesOverlap ? 'possible_alias' : review.reason),
        label: dupLabel.label,
        place_subtype: dupLabel.placeSubtype,
        owner_display_name: dupLabel.ownerDisplayName,
        privacy_sensitive: dupLabel.privacySensitive,
        variant_reason: dupLabel.variantReason,
        evidence: [
          ...(aliasesOverlap ? [`alias: ${aliasesOverlap}`] : []),
          `relationship: ${review.relationship}`,
          `score: ${review.confidence.toFixed(2)}`,
          `names: "${left.name}" ↔ "${right.name}"`,
          ...review.evidence,
        ],
        locations: [left, right],
      });
    }
  }

  return groups;
}

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

    const groups = buildLocationDuplicateGroups((data ?? []) as LocationDuplicateRow[]);

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
      .eq('id', report.targetId)
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
    name: z.string().trim().min(1).max(160).optional(),
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
    const message = error instanceof Error ? error.message : 'Failed to update location';
    res.status(message.includes('already exists') || message.includes('required') ? 400 : 500).json({
      success: false,
      error: message,
    });
  }
});

router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const locationId = String(req.params.id);
  const schema = z.object({
    reason: z.string().trim().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.issues });
    return;
  }
  try {
    const canonicalId = (await locationMergeService.resolveCanonicalLocationId(userId, locationId)) ?? locationId;
    const existing = await locationService.getLocationProfile(userId, canonicalId);
    const deletionReason = parsed.data.reason || 'User deleted place card';
    const deleted = await locationService.deleteLocation(userId, canonicalId, {
      reason: deletionReason,
    });
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Location not found' });
      return;
    }
    if (existing) {
      void entityLearningService.recordDeletionLearning({
        userId,
        domain: 'locations',
        entityId: canonicalId,
        name: existing.name,
        aliases: Array.isArray(existing.metadata?.aliases) ? (existing.metadata!.aliases as string[]) : [],
        reason: deletionReason,
      });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error({ error, locationId }, 'Failed to delete location');
    res.status(500).json({ success: false, error: 'Failed to delete location' });
  }
});

export const locationsRouter = router;
