import {
  characterBelongsOnCanonicalEvent,
  locationBelongsOnCanonicalEvent,
  type EventAssociationView,
} from './eventAttributionProjection';
import { readStoredAttributions, type EntityAttribution } from './eventEntityAttribution';

export type EventAttributionDiagnostic = {
  eventId: string | null;
  canonicalId: string | null;
  entityId: string;
  entityName: string | null;
  associationRole: string;
  evidenceSource: string;
  confidence: number | null;
  sourceText: string;
  canonicalVsCompatibility: 'canonical' | 'compatibility' | 'both' | 'neither';
  accepted: boolean;
  rejectedInferenceReason: string | null;
  storedAttribution: EntityAttribution | null;
};

export function explainEventEntityAttribution(input: {
  event: EventAssociationView;
  entityId: string;
  entityName?: string | null;
  entityKind?: 'character' | 'location';
}): EventAttributionDiagnostic {
  const { event, entityId, entityName } = input;
  const decision =
    input.entityKind === 'location'
      ? locationBelongsOnCanonicalEvent(event, { id: entityId, name: entityName ?? undefined })
      : characterBelongsOnCanonicalEvent(event, { id: entityId, name: entityName ?? undefined });
  const stored = readStoredAttributions(event.metadata).find((row) => row.entityId === entityId) ?? null;
  const canonical = decision.canonical;
  const compatibility = decision.compatibility;
  return {
    eventId: event.id ?? null,
    canonicalId: event.id ?? null,
    entityId,
    entityName: entityName ?? stored?.name ?? null,
    associationRole: decision.role,
    evidenceSource: decision.reason,
    confidence: stored?.confidence ?? decision.attribution?.confidence ?? null,
    sourceText: [event.title, event.summary].filter(Boolean).join(' — '),
    canonicalVsCompatibility: canonical && compatibility ? 'both' : canonical ? 'canonical' : compatibility ? 'compatibility' : 'neither',
    accepted: decision.associated,
    rejectedInferenceReason: decision.associated ? null : decision.reason,
    storedAttribution: stored,
  };
}
