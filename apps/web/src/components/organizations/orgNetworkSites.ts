/**
 * Company sites as intermediate hierarchy nodes: company → location → groups.
 * Matching uses Places Book ids when present, otherwise case-insensitive names.
 */

export type OrgNetworkLocation = {
  locationId?: string;
  name: string;
};

export type OrgSiteBucket = {
  key: string;
  name: string;
  locationId?: string;
  childIds: string[];
};

export function locationMatchKey(loc: {
  locationId?: string;
  location_id?: string;
  name?: string;
  location_name?: string;
}): string {
  const id = loc.locationId ?? loc.location_id;
  if (id) return `id:${id}`;
  const name = (loc.name ?? loc.location_name ?? '').trim().toLowerCase();
  return name ? `name:${name}` : '';
}

export function orgSiteNodeId(ownerOrgId: string, key: string): string {
  return `site:${ownerOrgId}:${key}`;
}

export function isOrgSiteNodeId(id: string): boolean {
  return id.startsWith('site:');
}

export function groupChildrenBySite(
  parentLocations: OrgNetworkLocation[] | undefined,
  childIds: string[],
  getChildLocations: (id: string) => OrgNetworkLocation[] | undefined,
): { buckets: OrgSiteBucket[]; unassigned: string[] } {
  const bucketsByKey = new Map<string, OrgSiteBucket>();

  const ensureBucket = (loc: OrgNetworkLocation): OrgSiteBucket | null => {
    const key = locationMatchKey(loc);
    if (!key) return null;
    let bucket = bucketsByKey.get(key);
    if (!bucket) {
      bucket = {
        key,
        name: loc.name,
        locationId: loc.locationId,
        childIds: [],
      };
      bucketsByKey.set(key, bucket);
    } else if (!bucket.locationId && loc.locationId) {
      bucket.locationId = loc.locationId;
      bucket.name = loc.name;
    }
    return bucket;
  };

  for (const loc of parentLocations ?? []) {
    ensureBucket(loc);
  }

  const unassigned: string[] = [];
  for (const childId of childIds) {
    const childLocs = getChildLocations(childId) ?? [];
    let placed = false;
    for (const loc of childLocs) {
      const key = locationMatchKey(loc);
      if (!key) continue;
      const existing = bucketsByKey.get(key);
      if (existing) {
        if (!existing.childIds.includes(childId)) existing.childIds.push(childId);
        placed = true;
        break;
      }
    }
    if (placed) continue;
    const first = childLocs.find((loc) => locationMatchKey(loc));
    if (first) {
      const bucket = ensureBucket(first);
      if (bucket && !bucket.childIds.includes(childId)) bucket.childIds.push(childId);
      continue;
    }
    unassigned.push(childId);
  }

  return { buckets: [...bucketsByKey.values()], unassigned };
}
