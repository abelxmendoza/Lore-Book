import type { Timeline, TimelineType } from '../types/timelineV2';
import type { LifeArc } from '../hooks/useLifeArcs';
import { getArcMetadata } from './lifeArcLabels';

/** `occasion` is a life-arc type with no Timeline v2 counterpart. */
export function lifeArcTypeToTimelineType(arcType: LifeArc['arc_type']): TimelineType {
  return arcType === 'occasion' ? 'custom' : arcType;
}

/**
 * Project a canonical life_arc into the Timeline-container shape EntityDetailModal
 * already renders (title, dates, type, progress bar). IDs stay life_arc ids.
 */
export function lifeArcToTimelineContainer(arc: LifeArc, userId = ''): Timeline {
  return {
    id: arc.id,
    user_id: userId,
    title: arc.title,
    description: arc.summary,
    timeline_type: lifeArcTypeToTimelineType(arc.arc_type),
    parent_id: arc.parent_id,
    start_date: arc.start_date ?? '',
    end_date: arc.end_date,
    tags: arc.tags ?? [],
    metadata: arc.metadata ?? {},
    created_at: '',
    updated_at: '',
  };
}

export function searchLifeArcs(arcs: LifeArc[], query: string): LifeArc[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return arcs.filter((arc) => {
    const haystack = [
      arc.title,
      arc.summary ?? '',
      arc.arc_type.replace('_', ' '),
      ...(arc.tags ?? []),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export type MomentArcAssociation = {
  sourceId?: string | null;
  membershipIds?: string[];
  /** Direct character / location / organization ids. Outranks name and date. */
  entityIds?: string[];
  occurredStart?: string | null;
  occurredEnd?: string | null;
  entityName?: string | null;
};

export type LifeArcAssociationReason =
  | 'membership_id'
  | 'source_event_id'
  | 'direct_entity_id'
  | 'unresolved';

export type LifeArcAssociationResult = {
  arcs: LifeArc[];
  unresolvedLinkageReason: 'missing_entity_ids' | 'no_direct_entity_match' | null;
  reason: LifeArcAssociationReason;
};

function metadataEntityIds(arc: LifeArc): string[] {
  const meta = (arc.metadata ?? {}) as Record<string, unknown>;
  const ids: string[] = [];
  for (const key of ['character_ids', 'location_ids', 'organization_ids', 'entity_ids'] as const) {
    const value = meta[key];
    if (!Array.isArray(value)) continue;
    for (const id of value) {
      if (typeof id === 'string' && id.trim()) ids.push(id.trim());
    }
  }
  return ids;
}

/**
 * Resolve associated chapter/arc containers from stable ids only:
 * membership, source_event_ids, then direct entity ids on arc metadata.
 * Date overlap and name matching are not used — those invent association.
 */
export function resolveAssociatedLifeArcs(
  arcs: LifeArc[],
  assoc: MomentArcAssociation,
): LifeArcAssociationResult {
  const membershipIds = (assoc.membershipIds ?? []).filter(Boolean);
  if (membershipIds.length > 0) {
    const byMembership = arcs.filter((arc) => membershipIds.includes(arc.id));
    if (byMembership.length > 0) {
      return { arcs: byMembership, unresolvedLinkageReason: null, reason: 'membership_id' };
    }
  }

  const sourceId = assoc.sourceId?.trim();
  if (sourceId) {
    const bySource = arcs.filter((arc) =>
      (getArcMetadata(arc)?.source_event_ids ?? []).includes(sourceId),
    );
    if (bySource.length > 0) {
      return { arcs: bySource, unresolvedLinkageReason: null, reason: 'source_event_id' };
    }
  }

  const entityIds = (assoc.entityIds ?? []).filter(Boolean);
  if (entityIds.length > 0) {
    const byEntity = arcs.filter((arc) =>
      metadataEntityIds(arc).some((id) => entityIds.includes(id)),
    );
    if (byEntity.length > 0) {
      return { arcs: byEntity, unresolvedLinkageReason: null, reason: 'direct_entity_id' };
    }
    return {
      arcs: [],
      unresolvedLinkageReason: 'no_direct_entity_match',
      reason: 'unresolved',
    };
  }

  return {
    arcs: [],
    unresolvedLinkageReason: 'missing_entity_ids',
    reason: 'unresolved',
  };
}

export function associatedLifeArcs(arcs: LifeArc[], assoc: MomentArcAssociation): LifeArc[] {
  return resolveAssociatedLifeArcs(arcs, assoc).arcs;
}
