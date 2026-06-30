/**
 * Spatial Context Resolver.
 *
 * Spatial language ("front of Shyla", "in the pit", "at Ink Fest") is NOT proof
 * that the candidate is a Place. This resolver classifies a spatial reference by
 * WHAT it actually points at — a person, an event, a venue sub-area, a relative
 * position, an unknown venue, or an age — so only stable, identifiable locations
 * become Place cards.
 *
 * Deterministic, no LLM. Optional known-entity hints sharpen target typing but
 * the structural rules stand alone.
 *
 * Precedence (Place is the LAST option):
 *   demographic → spatial-relationship/relative-position → event → venue-area →
 *   unresolved-location → place
 */

import { normalizeNameKey } from '../../../utils/nameNormalization';

export type SpatialReferenceType =
  | 'place' // stable, identifiable location → may become a Place card
  | 'event' // show / fest / prom / concert …
  | 'venue_area' // pit / stage / dance floor …
  | 'spatial_relationship' // "in front of <Person>"
  | 'relative_position' // "front of <X>" where X isn't a known person
  | 'unresolved_location' // "that venue", "the place" — unnamed
  | 'demographic'; // "my age", "same age"

export interface SpatialReference {
  text: string;
  referenceType: SpatialReferenceType;
  reason: string;
  /** For events: the possessive organizer ("Ink" in "Ink's Ska Prom"). */
  organizer?: string;
  /** For events: the event name with the organizer stripped ("Ska Prom"). */
  eventName?: string;
  /** For venue areas: the area noun ("pit"). */
  venueArea?: string;
  /** For relative positions: the referenced entity ("Shyla"). */
  target?: string;
  rulesFired: string[];
  /** Convenience: true only when this should be allowed to become a Place. */
  isPlace: boolean;
}

export interface SpatialResolverHints {
  knownPersonNames?: Iterable<string>;
  knownPlaceNames?: Iterable<string>;
  knownEventNames?: Iterable<string>;
}

// ── Vocabulary ───────────────────────────────────────────────────────────────

/** Rule 6: nouns that make something an EVENT, never a Place. */
const EVENT_NOUNS = new Set([
  'show', 'shows', 'concert', 'concerts', 'gig', 'gigs', 'festival', 'fest',
  'prom', 'party', 'parties', 'meetup', 'meetups', 'competition', 'battle',
  'conference', 'anniversary', 'tour', 'afterparty', 'rave', 'set', 'gathering',
  'reunion', 'fundraiser', 'showcase', 'matinee', 'recital', 'opener', 'headliner',
]);

/** Rule 4: venue sub-areas — never a standalone Place. */
const VENUE_AREA_NOUNS = new Set([
  'pit', 'moshpit', 'floor', 'dancefloor', 'stage', 'backstage', 'lot', 'parking',
  'entrance', 'booth', 'balcony', 'patio', 'restroom', 'bathroom', 'greenroom',
  'vip', 'section', 'corner', 'doorway', 'doorman', 'merch',
]);

/** Rule 1/10: spatial prepositions that introduce a relative position. */
const SPATIAL_PREFIX =
  /^(?:(?:in|to)\s+(?:the\s+)?)?(?:front|back|left|right|top)\s+of\s+(.+)$|^(?:next\s+to|beside|behind|near|around|across\s+from|in\s+back\s+of|in\s+front\s+of|on\s+top\s+of|underneath|below|above|between)\s+(.+)$/i;

/** Rule 5/11: generic, unnamed venue references. */
const GENERIC_VENUE_REF = new Set([
  'the venue', 'that venue', 'this venue', 'a venue', 'venue',
  'the place', 'that place', 'this place', 'the spot', 'that spot',
  'there', 'here', 'inside', 'outside', 'somewhere', 'someplace',
]);

/** Rule 5: generic location head nouns — "… Venue", "… Place" with no real brand. */
const GENERIC_LOCATION_HEAD = new Set(['venue', 'place', 'spot', 'location']);

/** Rule 9: age / demographic phrases. */
const AGE_PHRASE = /^(?:my|same|their|our|your|his|her)?\s*age$/i;

function toSet(it?: Iterable<string>): Set<string> {
  const s = new Set<string>();
  for (const v of it ?? []) {
    const k = normalizeNameKey(v);
    if (k) s.add(k);
  }
  return s;
}

function lastToken(key: string): string {
  const t = key.split(' ').filter(Boolean);
  return t[t.length - 1] ?? '';
}

function ref(
  text: string,
  type: SpatialReferenceType,
  reason: string,
  extra: Partial<SpatialReference> = {},
): SpatialReference {
  return {
    text,
    referenceType: type,
    reason,
    rulesFired: [reason],
    isPlace: type === 'place',
    ...extra,
  };
}

/**
 * Classify a spatial candidate. Returns a place verdict ONLY when nothing more
 * specific (person/event/area/position/unknown/age) explains it.
 */
export function classifySpatialReference(name: string, hints: SpatialResolverHints = {}): SpatialReference {
  const text = (name ?? '').trim();
  if (!text) return ref(text, 'unresolved_location', 'empty');
  const key = normalizeNameKey(text);
  const persons = toSet(hints.knownPersonNames);
  const events = toSet(hints.knownEventNames);

  // Rule 9 — age / demographic.
  if (AGE_PHRASE.test(text)) return ref(text, 'demographic', 'age_demographic_not_place');

  // Rule 5/11 — generic / unnamed venue references.
  if (GENERIC_VENUE_REF.has(key)) return ref(text, 'unresolved_location', 'generic_venue_reference');

  // Rule 1/2/10 — relative position ("front of Shyla", "next to Genni").
  const spatial = SPATIAL_PREFIX.exec(text);
  if (spatial) {
    const target = (spatial[1] ?? spatial[2] ?? '').trim();
    const targetKey = normalizeNameKey(target);
    if (targetKey && persons.has(targetKey)) {
      return ref(text, 'spatial_relationship', 'relative_position_to_person', { target });
    }
    return ref(text, 'relative_position', 'spatial_preposition_not_place', { target });
  }

  // Possessive lead — "Ink's Ska Prom", "Genni's Pit".
  const poss = text.match(/^(.+?)['’]s\s+(.+)$/);
  const remainder = poss ? poss[2].trim() : text;
  const remainderKey = normalizeNameKey(remainder);
  const organizer = poss ? poss[1].trim() : undefined;

  // Rule 3/6/7 — event (incl. promoter-owned "Ink's Show").
  if (events.has(key) || events.has(remainderKey)) {
    return ref(text, 'event', 'known_event', { organizer, eventName: remainder });
  }
  const tokens = key.split(' ').filter(Boolean);
  if (tokens.some((t) => EVENT_NOUNS.has(t))) {
    return ref(text, 'event', poss ? 'promoter_owned_event' : 'event_noun_not_place', {
      organizer,
      eventName: remainder,
    });
  }

  // Rule 4/8 — venue sub-area (incl. "Genni's Pit": person possessive doesn't own an area).
  if (VENUE_AREA_NOUNS.has(remainderKey) || VENUE_AREA_NOUNS.has(lastToken(remainderKey))) {
    return ref(text, 'venue_area', poss ? 'possessive_person_venue_area' : 'venue_area_not_place', {
      venueArea: remainder,
    });
  }

  // Rule 5 — a generic location head ("Security Kickout Venue") is an unnamed
  // reference, not an identifiable place. A known place name is exempt.
  if (GENERIC_LOCATION_HEAD.has(lastToken(remainderKey)) && !toSet(hints.knownPlaceNames).has(key)) {
    return ref(text, 'unresolved_location', 'generic_location_head');
  }

  // Nothing more specific — allow as a place candidate (still subject to the
  // other placeCandidateGuard rules).
  return ref(text, 'place', 'place_candidate');
}

/** True when the name should be allowed to become a Place card. */
export function isSpatialPlace(name: string, hints?: SpatialResolverHints): boolean {
  return classifySpatialReference(name, hints).isPlace;
}
