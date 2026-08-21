import {
  canonicalLocationsFromAttributions,
  canonicalPeopleFromAttributions,
  mergeEntityAttributions,
  readStoredAttributions,
  type EntityAttribution,
} from './eventEntityAttribution';

export type AttributionCorrectionAction = 'retract' | 'replace_person' | 'replace_place';

export type AttributionCorrectionInput = {
  action: AttributionCorrectionAction;
  entityId: string;
  replacementEntityId?: string;
  replacementName?: string;
  reason?: string;
};

export type CorrectableEvent = {
  id: string;
  people?: string[] | null;
  locations?: string[] | null;
  metadata?: Record<string, unknown> | null;
};

export type AttributionCorrectionResult = {
  eventId: string;
  people: string[];
  locations: string[];
  metadata: Record<string, unknown>;
  duplicateCreated: false;
};

function markRetracted(row: EntityAttribution, reason: string): EntityAttribution {
  return {
    ...row,
    role: 'referenced',
    accepted: false,
    canonical: false,
    reason,
    confidence: 0.99,
    evidence: 'explicit',
  };
}

/**
 * Repair people/locations on an existing resolved event without creating a
 * second canonical event. Tenant scoping is the caller's responsibility
 * (always update with user_id).
 */
export function applyAttributionCorrection(
  event: CorrectableEvent,
  input: AttributionCorrectionInput,
): AttributionCorrectionResult {
  const metadata = { ...(event.metadata ?? {}) };
  const prior = readStoredAttributions(metadata);
  const people = [...new Set(event.people ?? [])];
  const locations = [...new Set(event.locations ?? [])];
  const at = new Date().toISOString();

  if (input.action === 'retract') {
    const nextPeople = people.filter((id) => id !== input.entityId);
    const nextLocations = locations.filter((id) => id !== input.entityId);
    const nextAttributions = prior.map((row) =>
      row.entityId === input.entityId ? markRetracted(row, input.reason ?? 'user_retract_participant') : row,
    );
    metadata.entityAttributions = nextAttributions;
    metadata.attributionCorrections = [
      ...((metadata.attributionCorrections as unknown[]) ?? []),
      { at, action: 'retract', entityId: input.entityId, reason: input.reason ?? 'user_retract_participant' },
    ];
    return {
      eventId: event.id,
      people: nextPeople,
      locations: nextLocations,
      metadata,
      duplicateCreated: false,
    };
  }

  if (input.action === 'replace_person') {
    if (!input.replacementEntityId) {
      throw new Error('replacementEntityId is required to swap a person');
    }
    const nextPeople = [...new Set(people.filter((id) => id !== input.entityId).concat(input.replacementEntityId))];
    const replacement: EntityAttribution = {
      entityId: input.replacementEntityId,
      entityType: 'character',
      name: input.replacementName ?? input.replacementEntityId,
      role: 'participant',
      evidence: 'explicit',
      confidence: 0.99,
      reason: input.reason ?? 'user_replace_person',
      accepted: true,
      canonical: true,
    };
    const nextAttributions = mergeEntityAttributions(
      prior.map((row) => (row.entityId === input.entityId ? markRetracted(row, 'replaced_by_correction') : row)),
      [replacement],
    );
    metadata.entityAttributions = nextAttributions;
    metadata.attributionCorrections = [
      ...((metadata.attributionCorrections as unknown[]) ?? []),
      {
        at,
        action: 'replace_person',
        entityId: input.entityId,
        replacementEntityId: input.replacementEntityId,
      },
    ];
    return {
      eventId: event.id,
      people: canonicalPeopleFromAttributions(nextAttributions).length
        ? canonicalPeopleFromAttributions(nextAttributions)
        : nextPeople,
      locations,
      metadata,
      duplicateCreated: false,
    };
  }

  if (input.action === 'replace_place') {
    if (!input.replacementEntityId) {
      throw new Error('replacementEntityId is required to swap a place');
    }
    const replacement: EntityAttribution = {
      entityId: input.replacementEntityId,
      entityType: 'location',
      name: input.replacementName ?? input.replacementEntityId,
      role: 'location',
      evidence: 'explicit',
      confidence: 0.99,
      reason: input.reason ?? 'user_replace_place',
      accepted: true,
      canonical: true,
    };
    const nextAttributions = mergeEntityAttributions(
      prior.map((row) => (row.entityId === input.entityId ? markRetracted(row, 'replaced_by_correction') : row)),
      [replacement],
    );
    metadata.entityAttributions = nextAttributions;
    metadata.attributionCorrections = [
      ...((metadata.attributionCorrections as unknown[]) ?? []),
      {
        at,
        action: 'replace_place',
        entityId: input.entityId,
        replacementEntityId: input.replacementEntityId,
      },
    ];
    return {
      eventId: event.id,
      people,
      locations: canonicalLocationsFromAttributions(nextAttributions),
      metadata,
      duplicateCreated: false,
    };
  }

  throw new Error(`Unsupported attribution correction: ${input.action}`);
}
