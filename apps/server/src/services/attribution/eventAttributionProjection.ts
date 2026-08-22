import {
  classifyPersonAttribution,
  classifyPlaceAttribution,
  canonicalLocationsFromAttributions,
  canonicalPeopleFromAttributions,
  readStoredAttributions,
  type EntityAttribution,
} from './eventEntityAttribution';

export type EventAssociationView = {
  id?: string | null;
  title?: string | null;
  summary?: string | null;
  people?: string[] | null;
  locations?: string[] | null;
  metadata?: Record<string, unknown> | null;
};

export type AssociationDecision = {
  associated: boolean;
  role: EntityAttribution['role'] | 'unverified_legacy' | 'none';
  reason: string;
  canonical: boolean;
  compatibility: boolean;
  attribution: EntityAttribution | null;
};

function eventText(event: EventAssociationView): string {
  return [event.title, event.summary].filter(Boolean).join(' ');
}

function storedFor(event: EventAssociationView, entityId: string): EntityAttribution | undefined {
  return readStoredAttributions(event.metadata).find((row) => row.entityId === entityId);
}

/**
 * Chronology membership: canonical attribution wins over compatibility people[].
 * Legacy rows without attributions stay on people[] unless the event text
 * proves the association is only a mention/reference.
 */
export function characterBelongsOnCanonicalEvent(
  event: EventAssociationView,
  entity: { id: string; name?: string | null; aliases?: string[] },
): AssociationDecision {
  const stored = storedFor(event, entity.id);
  const compatibility = (event.people ?? []).includes(entity.id);

  if (stored) {
    return {
      associated: stored.canonical && stored.accepted,
      role: stored.role,
      reason: stored.reason,
      canonical: stored.canonical,
      compatibility,
      attribution: stored,
    };
  }

  if (entity.name) {
    const classified = classifyPersonAttribution(entity.name, eventText(event), {
      entityId: entity.id,
      aliases: entity.aliases,
    });
    if (classified.reason !== 'no_mention') {
      return {
        associated: classified.canonical && classified.accepted,
        role: classified.role,
        reason: classified.reason,
        canonical: classified.canonical,
        compatibility,
        attribution: classified,
      };
    }
  }

  if (compatibility) {
    return {
      associated: true,
      role: 'unverified_legacy',
      reason: 'legacy_people_array',
      canonical: false,
      compatibility: true,
      attribution: null,
    };
  }

  return {
    associated: false,
    role: 'none',
    reason: 'no_association',
    canonical: false,
    compatibility: false,
    attribution: null,
  };
}

export function locationBelongsOnCanonicalEvent(
  event: EventAssociationView,
  entity: { id: string; name?: string | null; aliases?: string[] },
): AssociationDecision {
  const stored = storedFor(event, entity.id);
  const compatibility = (event.locations ?? []).includes(entity.id);

  if (stored) {
    return {
      associated: stored.canonical && stored.accepted,
      role: stored.role,
      reason: stored.reason,
      canonical: stored.canonical,
      compatibility,
      attribution: stored,
    };
  }

  if (entity.name) {
    const classified = classifyPlaceAttribution(entity.name, eventText(event), {
      entityId: entity.id,
      aliases: entity.aliases,
    });
    if (classified.reason !== 'no_mention') {
      return {
        associated: classified.canonical && classified.accepted,
        role: classified.role,
        reason: classified.reason,
        canonical: classified.canonical,
        compatibility,
        attribution: classified,
      };
    }
  }

  if (compatibility) {
    return {
      associated: true,
      role: 'unverified_legacy',
      reason: 'legacy_locations_array',
      canonical: false,
      compatibility: true,
      attribution: null,
    };
  }

  return {
    associated: false,
    role: 'none',
    reason: 'no_association',
    canonical: false,
    compatibility: false,
    attribution: null,
  };
}

export function peopleIdsForChronology(event: EventAssociationView): string[] {
  const stored = readStoredAttributions(event.metadata);
  if (stored.length > 0) return canonicalPeopleFromAttributions(stored);
  return [...new Set(event.people ?? [])];
}

export function locationIdsForChronology(event: EventAssociationView): string[] {
  const stored = readStoredAttributions(event.metadata);
  if (stored.length > 0) return canonicalLocationsFromAttributions(stored);
  return [...new Set(event.locations ?? [])];
}
