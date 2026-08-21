import type { StitchedTimelineItem } from '../api/stitchedTimeline';

export type StitchedEntityType = 'character' | 'location' | 'organization';

export type StitchedEntityLinkReason =
  | 'direct_entity_id'
  | 'missing_entity_ids'
  | 'no_direct_entity_match';

export type StitchedEntityLinkResolution = {
  associated: boolean;
  unresolved: boolean;
  reason: StitchedEntityLinkReason;
};

function idsForType(
  item: Pick<StitchedTimelineItem, 'peopleIds' | 'locationIds' | 'organizationIds'>,
  entityType: StitchedEntityType,
): string[] | undefined {
  if (entityType === 'character') return item.peopleIds;
  if (entityType === 'location') return item.locationIds;
  return item.organizationIds;
}

/**
 * Direct entity IDs are the only association signal for stitched items.
 * Name matching, date overlap, and container heuristics are not used.
 * Missing people/place arrays stay unresolved rather than assumed.
 */
export function resolveStitchedEntityLink(
  item: Pick<StitchedTimelineItem, 'peopleIds' | 'locationIds' | 'organizationIds'>,
  entity: { id: string; type: StitchedEntityType },
): StitchedEntityLinkResolution {
  const ids = idsForType(item, entity.type);
  if (ids == null) {
    return { associated: false, unresolved: true, reason: 'missing_entity_ids' };
  }
  if (ids.includes(entity.id)) {
    return { associated: true, unresolved: false, reason: 'direct_entity_id' };
  }
  return { associated: false, unresolved: false, reason: 'no_direct_entity_match' };
}

export function partitionStitchedItemsForEntity(
  items: StitchedTimelineItem[],
  entity: { id: string; type: StitchedEntityType },
): { matched: StitchedTimelineItem[]; unresolved: StitchedTimelineItem[]; excluded: StitchedTimelineItem[] } {
  const matched: StitchedTimelineItem[] = [];
  const unresolved: StitchedTimelineItem[] = [];
  const excluded: StitchedTimelineItem[] = [];
  for (const item of items) {
    const resolution = resolveStitchedEntityLink(item, entity);
    if (resolution.associated) matched.push(item);
    else if (resolution.unresolved) unresolved.push(item);
    else excluded.push(item);
  }
  return { matched, unresolved, excluded };
}
