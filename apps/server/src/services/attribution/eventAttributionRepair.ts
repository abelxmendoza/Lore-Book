import {
  classifyPersonAttribution,
  classifyPlaceAttribution,
  canonicalLocationsFromAttributions,
  canonicalPeopleFromAttributions,
  readStoredAttributions,
  type EntityAttribution,
} from './eventEntityAttribution';

export type NamedEntityRef = {
  id: string;
  names: string[];
};

export type RepairableEvent = {
  id: string;
  title?: string | null;
  summary?: string | null;
  people?: string[] | null;
  locations?: string[] | null;
  metadata?: Record<string, unknown> | null;
};

export type AttributionRepairPlan = {
  eventId: string;
  people: string[];
  locations: string[];
  attributions: EntityAttribution[];
  peopleRemoved: string[];
  locationsRemoved: string[];
  peopleAdded: string[];
  locationsAdded: string[];
  changed: boolean;
};

function unique(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

function retractedEntityIds(metadata: Record<string, unknown> | null | undefined): Set<string> {
  const rows = Array.isArray(metadata?.attributionCorrections)
    ? (metadata.attributionCorrections as Array<Record<string, unknown>>)
    : [];
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.action === 'retract' || row.action === 'replace_person' || row.action === 'replace_place') {
      if (typeof row.entityId === 'string') ids.add(row.entityId);
    }
  }
  return ids;
}

function namesFor(ref: NamedEntityRef): string[] {
  return ref.names.map((name) => name.trim()).filter(Boolean);
}

function sameIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const other = new Set(right);
  return left.every((id) => other.has(id));
}

function mentionedPerson(ref: NamedEntityRef, text: string): boolean {
  const names = namesFor(ref);
  if (names.length === 0) return false;
  return classifyPersonAttribution(names[0]!, text, { aliases: names.slice(1) }).reason !== 'no_mention';
}

function mentionedPlace(ref: NamedEntityRef, text: string): boolean {
  const names = namesFor(ref);
  if (names.length === 0) return false;
  return classifyPlaceAttribution(names[0]!, text, { aliases: names.slice(1) }).reason !== 'no_mention';
}

/**
 * Recompute canonical people/locations for one event from title, summary, and
 * optional source-unit text. User retractions are preserved. Event id is unchanged.
 */
export function planResolvedEventAttributionRepair(
  event: RepairableEvent,
  characterRefs: NamedEntityRef[],
  locationRefs: NamedEntityRef[],
  extraText = '',
): AttributionRepairPlan {
  const text = [event.title, event.summary, extraText].filter(Boolean).join('\n');
  const retracted = retractedEntityIds(event.metadata);
  const currentPeople = unique(event.people ?? []);
  const currentLocations = unique(event.locations ?? []);
  const characterById = new Map(characterRefs.map((ref) => [ref.id, ref]));
  const locationById = new Map(locationRefs.map((ref) => [ref.id, ref]));

  // Only reclassify entities already on the row or actually named in evidence.
  // The rest of the tenant roster is not a candidate — mention ≠ roster membership.
  const peopleCandidates = unique([
    ...currentPeople,
    ...characterRefs.filter((ref) => mentionedPerson(ref, text)).map((ref) => ref.id),
  ]);
  const locationCandidates = unique([
    ...currentLocations,
    ...locationRefs.filter((ref) => mentionedPlace(ref, text)).map((ref) => ref.id),
  ]);

  const attributions: EntityAttribution[] = [];
  const nextPeople: string[] = [];
  for (const id of peopleCandidates) {
    if (retracted.has(id)) continue;
    const ref = characterById.get(id);
    const names = ref ? namesFor(ref) : [];
    if (names.length === 0) continue;
    const row = classifyPersonAttribution(names[0]!, text, { entityId: id, aliases: names.slice(1) });
    attributions.push(row);
    if (row.canonical && row.accepted) nextPeople.push(id);
  }

  const nextLocations: string[] = [];
  for (const id of locationCandidates) {
    if (retracted.has(id)) continue;
    const ref = locationById.get(id);
    const names = ref ? namesFor(ref) : [];
    if (names.length === 0) continue;
    const row = classifyPlaceAttribution(names[0]!, text, { entityId: id, aliases: names.slice(1) });
    attributions.push(row);
    if (row.canonical && row.accepted) nextLocations.push(id);
  }

  const people = unique(nextPeople);
  const locations = unique(nextLocations);
  const peopleRemoved = currentPeople.filter((id) => !people.includes(id));
  const locationsRemoved = currentLocations.filter((id) => !locations.includes(id));
  const peopleAdded = people.filter((id) => !currentPeople.includes(id));
  const locationsAdded = locations.filter((id) => !currentLocations.includes(id));
  const stored = readStoredAttributions(event.metadata);
  const arrayChanged =
    peopleRemoved.length > 0 ||
    locationsRemoved.length > 0 ||
    peopleAdded.length > 0 ||
    locationsAdded.length > 0;
  const storedDrift =
    stored.length > 0 &&
    (!sameIds(canonicalPeopleFromAttributions(stored), people) ||
      !sameIds(canonicalLocationsFromAttributions(stored), locations));
  const needsStamp = stored.length === 0 && attributions.length > 0;
  const changed = arrayChanged || storedDrift || needsStamp;

  return {
    eventId: event.id,
    people,
    locations,
    attributions,
    peopleRemoved,
    locationsRemoved,
    peopleAdded,
    locationsAdded,
    changed,
  };
}
