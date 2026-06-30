/**
 * Materialize venue sub-areas ("pit", "stage", "dance floor") as NESTED locations
 * under their parent venue — implementing Rule 4: a venue area is never a
 * standalone Place; it is a child_of a known venue.
 *
 * Conservative: only creates the area when its parent venue is already a known
 * location mentioned in the same evidence line (so we never invent orphan areas
 * or guess a parent). Deduped by (area, parent). Reuses locations.parent_location_id
 * — no new tables.
 */
import { logger } from '../../logger';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { classifySpatialReference } from '../lorebook/quality/spatialContextResolver';

import { supabaseAdmin } from '../supabaseClient';

export interface VenueAreaRef {
  /** Candidate text the place guard rejected as a venue area ("Genni's Pit"). */
  name: string;
  /** The evidence line — scanned for the parent venue. */
  evidence?: string;
}

export interface KnownLocation {
  id: string;
  name: string;
  aliases?: string[] | null;
  parent_location_id?: string | null;
}

export interface VenueAreaDeps {
  loadLocations: (userId: string) => Promise<KnownLocation[]>;
  insertVenueArea: (
    userId: string,
    row: { name: string; normalized_name: string; parent_location_id: string; evidence?: string },
  ) => Promise<{ id: string } | null>;
}

const defaultDeps: VenueAreaDeps = {
  async loadLocations(userId) {
    const { data } = await supabaseAdmin
      .from('locations')
      .select('id, name, aliases, parent_location_id')
      .eq('user_id', userId);
    return (data ?? []) as KnownLocation[];
  },
  async insertVenueArea(userId, row) {
    const { data, error } = await supabaseAdmin
      .from('locations')
      .insert({
        user_id: userId,
        name: row.name,
        normalized_name: row.normalized_name,
        type: 'venue_area',
        spatial_category: 'venue_area',
        parent_location_id: row.parent_location_id,
        confidence: 0.6,
        metadata: { source: 'spatial_venue_area', evidence: row.evidence ?? null },
      })
      .select('id')
      .single();
    if (error) {
      logger.debug({ error, userId, name: row.name }, 'venue-area insert failed');
      return null;
    }
    return data as { id: string };
  },
};

export async function materializeVenueAreas(
  userId: string,
  refs: VenueAreaRef[],
  deps: VenueAreaDeps = defaultDeps,
): Promise<{ created: number; areaIds: string[] }> {
  if (refs.length === 0) return { created: 0, areaIds: [] };
  const known = await deps.loadLocations(userId);
  if (known.length === 0) return { created: 0, areaIds: [] };

  const labelIndex = known.map((loc) => ({
    loc,
    keys: [loc.name, ...((loc.aliases as string[] | null) ?? [])]
      .map(normalizeNameKey)
      .filter((k) => k.length >= 3),
  }));

  // A venue area already nested under this parent (dedupe target).
  const existingChild = new Set(
    known
      .filter((l) => l.parent_location_id)
      .map((l) => `${normalizeNameKey(l.name)}|${l.parent_location_id}`),
  );

  const findParent = (evidence?: string): KnownLocation | null => {
    if (!evidence) return null;
    const ev = normalizeNameKey(evidence);
    for (const { loc, keys } of labelIndex) {
      if (keys.some((k) => ev.includes(k))) return loc;
    }
    return null;
  };

  const areaIds: string[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const cls = classifySpatialReference(ref.name);
    if (cls.referenceType !== 'venue_area') continue;
    const areaName = (cls.venueArea || ref.name).trim();
    const parent = findParent(ref.evidence);
    if (!areaName || !parent) continue; // only nest under a known venue

    const dedupKey = `${normalizeNameKey(areaName)}|${parent.id}`;
    if (seen.has(dedupKey) || existingChild.has(dedupKey)) continue;
    seen.add(dedupKey);

    const created = await deps.insertVenueArea(userId, {
      name: areaName,
      normalized_name: normalizeNameKey(areaName),
      parent_location_id: parent.id,
      evidence: ref.evidence,
    });
    if (created?.id) {
      areaIds.push(created.id);
      logger.info({ userId, area: areaName, parent: parent.name }, 'Materialized venue area under parent venue');
    }
  }
  return { created: areaIds.length, areaIds };
}
