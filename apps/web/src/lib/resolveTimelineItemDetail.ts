import { fetchJson } from './api';
import type { Event } from '../components/events/EventProfileCard';

export type TimelineDetailSourceKind =
  | 'resolved_event'
  | 'journal_entry'
  | 'timeline_event'
  | 'occasion'
  | 'life_arc'
  | 'unknown';

export type TimelineDetailRoute =
  | 'event'
  | 'journal'
  | 'memory'
  | 'life_arc'
  | 'occasion'
  | 'none';

export type UnresolvedLinkageReason =
  | 'missing_entity_ids'
  | 'no_direct_entity_match'
  | 'unknown_source'
  | 'timeline_event_not_resolved_event'
  | 'missing_source_id'
  | null;

export type TimelineItemDetailInput = {
  id?: string | null;
  kind?: 'moment' | 'event' | 'occasion' | string | null;
  sourceKind?: string | null;
  sourceId?: string | null;
  sourceIds?: string[] | null;
  sourceType?: string | null;
  type?: string | null;
  peopleIds?: string[] | null;
  locationIds?: string[] | null;
  organizationIds?: string[] | null;
  lifeArcId?: string | null;
  title?: string | null;
  body?: string | null;
  sortTime?: string | null;
  date?: string | null;
  content?: string | null;
};

export type TimelineItemEntityIds = {
  peopleIds: string[];
  locationIds: string[];
  organizationIds: string[];
};

export type TimelineItemDetailDiagnostics = {
  canonicalItemId: string | null;
  sourceType: string | null;
  sourceId: string | null;
  entityIds: TimelineItemEntityIds;
  detailRoute: TimelineDetailRoute;
  unresolvedLinkageReason: UnresolvedLinkageReason;
};

export type TimelineItemDetailResolution = {
  canonicalItemId: string | null;
  sourceKind: TimelineDetailSourceKind;
  sourceId: string | null;
  entityIds: TimelineItemEntityIds;
  route: TimelineDetailRoute;
  unresolvedLinkageReason: UnresolvedLinkageReason;
  diagnostics: TimelineItemDetailDiagnostics;
};

export type TimelineMemoryOpen = {
  id: string;
  journal_entry_id: string;
  content?: string;
  date?: string;
  start_time?: string;
  title?: string;
};

const CANONICAL_PREFIX = /^(moment|event|occasion|life_arc):/;

function firstString(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function uniqueIds(values: string[] | null | undefined): string[] {
  return [...new Set((values ?? []).map((id) => id.trim()).filter(Boolean))];
}

function stripCanonicalPrefix(id: string | null): string | null {
  if (!id) return null;
  const match = CANONICAL_PREFIX.exec(id);
  if (!match) return id;
  return id.slice(match[0].length) || null;
}

function inferSourceKind(item: TimelineItemDetailInput): TimelineDetailSourceKind {
  const sourceKind = item.sourceKind?.trim();
  if (sourceKind === 'resolved_event') return 'resolved_event';
  if (sourceKind === 'journal_entry') return 'journal_entry';
  if (sourceKind === 'timeline_event') return 'timeline_event';
  if (sourceKind === 'occasion') return 'occasion';
  if (sourceKind === 'life_arc') return 'life_arc';

  const sourceType = item.sourceType?.trim();
  if (sourceType === 'journal' || sourceType === 'journal_entry') return 'journal_entry';
  if (sourceType === 'occasion') return 'occasion';
  if (item.type === 'journal_entry') return 'journal_entry';
  if (item.kind === 'moment') return 'journal_entry';
  if (item.kind === 'occasion') return 'occasion';
  if (item.lifeArcId && item.kind !== 'event' && item.kind !== 'moment') return 'occasion';
  if (typeof item.id === 'string' && item.id.startsWith('moment:')) return 'journal_entry';
  if (typeof item.id === 'string' && item.id.startsWith('occasion:')) return 'occasion';
  if (typeof item.id === 'string' && item.id.startsWith('life_arc:')) return 'life_arc';
  if (item.kind === 'event' || typeof item.id === 'string' && item.id.startsWith('event:')) {
    return 'resolved_event';
  }
  return 'unknown';
}

function inferCanonicalItemId(
  item: TimelineItemDetailInput,
  sourceKind: TimelineDetailSourceKind,
  sourceId: string | null,
): string | null {
  if (typeof item.id === 'string' && CANONICAL_PREFIX.test(item.id)) return item.id;
  if (sourceKind === 'journal_entry' && sourceId) return `moment:${sourceId}`;
  if (sourceKind === 'occasion' && sourceId) return `occasion:${sourceId}`;
  if (sourceKind === 'life_arc' && sourceId) return `life_arc:${sourceId}`;
  if ((sourceKind === 'resolved_event' || sourceKind === 'timeline_event') && sourceId) {
    return `event:${sourceId}`;
  }
  return item.id?.trim() || sourceId;
}

function inferSourceId(item: TimelineItemDetailInput, sourceKind: TimelineDetailSourceKind): string | null {
  if (sourceKind === 'occasion' || sourceKind === 'life_arc') {
    return firstString(item.lifeArcId, item.sourceId, stripCanonicalPrefix(item.id ?? null));
  }
  return firstString(item.sourceId, stripCanonicalPrefix(item.id ?? null));
}

function routeForSourceKind(sourceKind: TimelineDetailSourceKind): TimelineDetailRoute {
  switch (sourceKind) {
    case 'resolved_event':
      return 'event';
    case 'journal_entry':
      return 'journal';
    case 'occasion':
      return 'occasion';
    case 'life_arc':
      return 'life_arc';
    case 'timeline_event':
      return 'none';
    default:
      return 'none';
  }
}

/**
 * Map a stitched / calendar / life-arc timeline item to the correct detail
 * surface using canonical source metadata. Never treats a journal UUID as a
 * resolved_event id.
 */
export function resolveTimelineItemDetail(item: TimelineItemDetailInput): TimelineItemDetailResolution {
  const sourceKind = inferSourceKind(item);
  const sourceId = inferSourceId(item, sourceKind);
  const canonicalItemId = inferCanonicalItemId(item, sourceKind, sourceId);
  const entityIds: TimelineItemEntityIds = {
    peopleIds: uniqueIds(item.peopleIds),
    locationIds: uniqueIds(item.locationIds),
    organizationIds: uniqueIds(item.organizationIds),
  };
  const route = routeForSourceKind(sourceKind);
  const linkageMissing =
    item.peopleIds == null && item.locationIds == null && item.organizationIds == null;
  const unresolvedLinkageReason: UnresolvedLinkageReason = (() => {
    if (sourceKind === 'unknown') return 'unknown_source';
    if (sourceKind === 'timeline_event') return 'timeline_event_not_resolved_event';
    if (!sourceId) return 'missing_source_id';
    if (linkageMissing) return 'missing_entity_ids';
    return null;
  })();

  const diagnostics: TimelineItemDetailDiagnostics = {
    canonicalItemId,
    sourceType: item.sourceType ?? sourceKind,
    sourceId,
    entityIds,
    detailRoute: route,
    unresolvedLinkageReason,
  };

  return {
    canonicalItemId,
    sourceKind,
    sourceId,
    entityIds,
    route,
    unresolvedLinkageReason,
    diagnostics,
  };
}

export async function openTimelineItemDetail(
  item: TimelineItemDetailInput,
  actions: {
    openEvent: (event: Event) => void;
    openMemory: (memory: TimelineMemoryOpen) => void;
    openLifeArc?: (id: string, title?: string) => void;
    fetchEvent?: (sourceId: string) => Promise<Event | null>;
  },
): Promise<TimelineItemDetailResolution> {
  const resolution = resolveTimelineItemDetail(item);
  if (import.meta.env?.DEV) {
    console.debug('[timeline-detail]', resolution.diagnostics);
  }

  if (resolution.route === 'journal' || resolution.route === 'memory') {
    if (!resolution.sourceId) return resolution;
    actions.openMemory({
      id: resolution.sourceId,
      journal_entry_id: resolution.sourceId,
      content: item.body ?? item.content ?? item.title ?? undefined,
      date: item.sortTime ?? item.date ?? undefined,
      start_time: item.sortTime ?? item.date ?? undefined,
      title: item.title ?? undefined,
    });
    return resolution;
  }

  if (resolution.route === 'occasion' || resolution.route === 'life_arc') {
    if (resolution.sourceId) {
      actions.openLifeArc?.(resolution.sourceId, item.title ?? undefined);
    }
    return resolution;
  }

  if (resolution.route === 'event') {
    if (!resolution.sourceId) return resolution;
    const fetchEvent =
      actions.fetchEvent ??
      (async (sourceId: string) => {
        const result = await fetchJson<{ success?: boolean; event?: Event }>(
          `/api/conversation/events/${sourceId}`,
        );
        return result.event ?? null;
      });
    const event = await fetchEvent(resolution.sourceId);
    if (event) actions.openEvent(event);
    return resolution;
  }

  return resolution;
}
