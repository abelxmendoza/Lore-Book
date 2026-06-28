/**
 * Place Intelligence — spatial ontology + deterministic classification for the
 * Places Book. Classifies a raw location string into the canonical spatial model,
 * splits possessive locations (person + place), detects rooms (belong to a
 * household), disambiguates events from places, and normalizes venue aliases.
 *
 *   PLACE
 *   ├── GEOGRAPHIC (Country/State/City/Neighborhood)
 *   ├── PROPERTY   (Household/Apartment/House/Residence)
 *   ├── ROOM       (Kitchen/Bathroom/Bedroom/Garage)
 *   ├── VENUE      (Nightclub/MusicVenue/Restaurant/Bar/Gym/EventSpace/Park)
 *   ├── BUSINESS
 *   └── LANDMARK
 *
 * Events that masquerade as places (shows, anniversaries, parties) are flagged
 * EVENT_LOCATION so they become an EVENT linked to a venue, never a place card.
 */
import { scoreKinshipInContext } from './lexicalIntelligence';

export type PlaceClass =
  | 'HOUSEHOLD' | 'ROOM' | 'PROPERTY' | 'VENUE' | 'BUSINESS'
  | 'CITY' | 'REGION' | 'EVENT_LOCATION' | 'LANDMARK' | 'UNKNOWN';

export interface PlaceClassification {
  input: string;
  rootType: 'PLACE' | 'EVENT';
  category: PlaceClass;
  subcategory?: string;
  isRoom: boolean;
  isEvent: boolean;
  /** When the name fuses a person + place ("Abuela's Costco", "Tío Juan's Doctor"). */
  possessive?: { ownerName: string; ownerIsKin: boolean; ownerRelation?: string; placePart: string };
  /** Canonical venue/place name after stripping event/alias noise. */
  canonicalName: string;
  /** "in <City>" / "<City> ..." geographic container, if detected. */
  locatedIn?: string;
  confidence: number;
  reason: string;
}

export type PlaceDuplicateRelationship =
  | 'alias_of'
  | 'possible_alias'
  | 'contains'
  | 'located_in'
  | 'hosted_event_at'
  | 'room_of'
  | 'incompatible_type';

export type PlaceDuplicateReviewReason =
  | 'possible_alias'
  | 'contained_location'
  | 'hosted_event'
  | 'room_or_area'
  | 'incompatible_type';

export interface PlaceDuplicateReview {
  canMerge: boolean;
  requiresReview: boolean;
  confidence: number;
  relationship: PlaceDuplicateRelationship;
  reason: PlaceDuplicateReviewReason;
  evidence: string[];
  left: PlaceClassification;
  right: PlaceClassification;
}

const norm = (s: string) => (s ?? '').trim().toLowerCase().replace(/['’]/g, "'").replace(/\s+/g, ' ');

const ROOMS = /\b(kitchen|bathroom|bedroom|garage|living\s?room|dining\s?room|backyard|basement|attic|patio|porch|closet)\b/;
const PROPERTY = /\b(house|home|apartment|apt|residence|casa|household|condo|duplex|trailer)\b/;
const VENUE = /\b(club|nightclub|bar|pub|lounge|venue|warehouse|stage|arena|stadium|theater|theatre|restaurant|cafe|gym|dojo|pool\s?hall|billiards|pool|park|studio|hall)\b/;
const BUSINESS = /\b(costco|walmart|target|store|shop|market|mall|doctor|dentist|clinic|hospital|office|bank|salon|barber|pharmacy|dealership|agency)\b/;
const EVENT_KW = /\b(show|concert|festival|gig|party|anniversary|graduation|birthday|meetup|gathering|wedding|funeral|quincea[ñn]era|reunion|ceremony|recital|premiere|kickback|function)\b/;
const GEO_SUFFIX = /\b(valley|hills?|heights|springs?|beach|city|lake|mountains?|canyon|mesa|grove|ridge|falls|gardens?|county|harbor|bay|island)\b/;
// Known cities/regions (extend over time / from geocoding).
const KNOWN_CITIES = new Set(['anaheim', 'san diego', 'los angeles', 'moreno valley', 'riverside', 'long beach', 'santa ana', 'orange', 'irvine']);

function canonicalCityName(raw: string): string | null {
  const n = norm(raw).replace(/^city of\s+/, '').trim();
  return KNOWN_CITIES.has(n) ? n.replace(/\b\w/g, (c) => c.toUpperCase()) : null;
}

/** Strip event/alias noise to a canonical venue name: "The Club Nova anniversary where Goth Tio danced" → "Club Nova". */
export function canonicalVenueName(raw: string): string {
  let s = (raw ?? '').trim().replace(/^the\s+/i, '');
  // "<X> show/concert/party/gig/set by|at <VENUE>" → extract the venue.
  const byVenue = /\b(?:show|concert|gig|set|party|night|festival)\s+(?:by|at)\s+(.+)$/i.exec(s);
  if (byVenue) return byVenue[1].trim();
  // Otherwise drop trailing event descriptors and relative clauses.
  s = s.replace(/\s+(anniversary|show|concert|party|night|reunion|gathering|festival)\b.*$/i, '');
  s = s.replace(/\s+(where|when|with|by|at)\b.*$/i, '');
  return s.trim() || raw.trim();
}

export function classifyPlace(rawName: string, context = ''): PlaceClassification {
  const input = (rawName ?? '').trim();
  const n = norm(input);
  const canonicalCity = canonicalCityName(input);
  const base: PlaceClassification = {
    input, rootType: 'PLACE', category: 'UNKNOWN', isRoom: false, isEvent: false,
    canonicalName: input, confidence: 0.4, reason: 'unclassified',
  };
  if (!input) return base;

  // ── Possessive split: "X's Y" OR kinship-leading "Abuelas House" ────────────
  const apostrophe = /^([a-zà-ÿ][\wà-ÿ'’.\s-]*?)'s\s+(.+)$/i.exec(input);
  if (apostrophe) {
    const ownerName = apostrophe[1].trim();
    const placePart = apostrophe[2].trim();
    const kin = scoreKinshipInContext(ownerName, context);
    const inner = classifyPlace(placePart, context); // classify the place half
    return {
      ...inner,
      input,
      possessive: { ownerName, ownerIsKin: kin.isKin, ownerRelation: kin.relation, placePart },
      reason: `possessive: ${kin.isKin ? `${kin.relation} ` : ''}owner + ${inner.category}`,
      confidence: Math.max(inner.confidence, 0.8),
    };
  }

  // ── Event masquerading as a place ───────────────────────────────────────────
  if (EVENT_KW.test(n)) {
    return {
      ...base, rootType: 'EVENT', category: 'EVENT_LOCATION', isEvent: true,
      canonicalName: canonicalVenueName(input),
      subcategory: (n.match(EVENT_KW)?.[0] ?? 'event').toUpperCase(),
      confidence: 0.85, reason: 'event keyword — link to venue, not a place card',
    };
  }

  // ── Geographic container ("... in Anaheim") ─────────────────────────────────
  const inCity = /\bin\s+([a-zà-ÿ][\wà-ÿ\s-]+)$/i.exec(input);
  const locatedIn = inCity && KNOWN_CITIES.has(norm(inCity[1])) ? inCity[1].trim() : undefined;

  // ── Room (belongs to a household) ───────────────────────────────────────────
  if (ROOMS.test(n)) {
    return { ...base, category: 'ROOM', isRoom: true, subcategory: (n.match(ROOMS)?.[0] ?? 'room').replace(/\s+/g, '_').toUpperCase(), locatedIn, confidence: 0.85, reason: 'room keyword — belongs to a household, not top-level' };
  }

  // ── Property / Household ────────────────────────────────────────────────────
  if (PROPERTY.test(n)) {
    const isHousehold = /\b(family|home|household)\b/.test(n) || /\bhouse\b/.test(n);
    return { ...base, category: isHousehold ? 'HOUSEHOLD' : 'PROPERTY', subcategory: (n.match(PROPERTY)?.[0] ?? 'residence').toUpperCase(), locatedIn, confidence: 0.82, reason: 'property/dwelling keyword' };
  }

  // ── City / Region ───────────────────────────────────────────────────────────
  if (canonicalCity) return { ...base, category: 'CITY', subcategory: 'CITY', canonicalName: canonicalCity, confidence: 0.9, reason: 'known city' };
  if (GEO_SUFFIX.test(n)) return { ...base, category: /\b(county|region|valley)\b/.test(n) ? 'REGION' : 'CITY', subcategory: 'GEOGRAPHIC', confidence: 0.78, reason: 'geographic suffix' };

  // ── Business ────────────────────────────────────────────────────────────────
  if (BUSINESS.test(n)) return { ...base, category: 'BUSINESS', subcategory: (n.match(BUSINESS)?.[0] ?? 'business').toUpperCase(), locatedIn, confidence: 0.82, reason: 'business keyword' };

  // ── Venue ───────────────────────────────────────────────────────────────────
  if (VENUE.test(n)) {
    const sub = n.match(VENUE)?.[0] ?? 'venue';
    const subcategory = /club|nightclub/.test(sub) ? 'NIGHTCLUB' : /pool|billiards/.test(sub) ? 'POOL_HALL' : /park/.test(sub) ? 'PARK' : /gym|dojo/.test(sub) ? 'GYM' : /bar|pub|lounge/.test(sub) ? 'BAR' : 'MUSIC_VENUE';
    return { ...base, category: 'VENUE', subcategory, canonicalName: canonicalVenueName(input), locatedIn, confidence: 0.8, reason: 'venue keyword' };
  }

  return { ...base, locatedIn };
}

function tokenOverlapScore(a: string, b: string): number {
  const na = norm(a), nb = norm(b);
  const ta = new Set(na.split(' ').filter((w) => w.length > 2));
  const tb = new Set(nb.split(' ').filter((w) => w.length > 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  const inter = [...ta].filter((w) => tb.has(w)).length;
  const jaccard = inter / new Set([...ta, ...tb]).size;
  // Containment ("moms house" vs "anaheim family home" share "home"? no — but
  // "family kitchen" vs "family kitchen in anaheim" share most tokens).
  const containment = inter / Math.min(ta.size, tb.size);
  return Math.max(jaccard, containment * 0.85);
}

function provenanceOverlaps(left: string[] = [], right: string[] = []): boolean {
  const l = new Set(left.map(norm).filter(Boolean));
  return right.map(norm).some((item) => l.has(item));
}

function categoryFamily(c: PlaceClassification): string {
  if (c.category === 'HOUSEHOLD' || c.category === 'PROPERTY') return 'PROPERTY';
  if (c.category === 'ROOM') return 'ROOM';
  if (c.category === 'CITY' || c.category === 'REGION') return 'GEOGRAPHY';
  if (c.category === 'VENUE' || c.category === 'BUSINESS' || c.category === 'LANDMARK') return 'PLACE';
  if (c.category === 'EVENT_LOCATION' || c.rootType === 'EVENT') return 'EVENT';
  return c.category;
}

function residentialAliasKey(name: string): string {
  return norm(name)
    .replace(/\bmoms\b/g, "mom's")
    .replace(/\bdads\b/g, "dad's")
    .replace(/\babuelas\b/g, "abuela's")
    .replace(/\babuelos\b/g, "abuelo's")
    .replace(/\btios\b/g, "tio's")
    .replace(/\btias\b/g, "tia's")
    .replace(/\bhome\b/g, 'house')
    .replace(/\s+/g, ' ')
    .trim();
}

function residentialOwnerKey(classification: PlaceClassification, rawName: string): string | null {
  const owner = classification.possessive?.ownerName ?? (() => {
    const n = norm(rawName);
    const kin = /^(mom|dad|mother|father|abuela|abuelo|grandma|grandpa|tio|tío|tia|tía|aunt|uncle)s?\s+(?:house|home|place|apartment|apt|condo|residence|casa)\b/.exec(n);
    if (kin) return kin[1];
    const possessive = /^([a-zà-ÿ][\wà-ÿ.\s-]*?)(?:'s|s)\s+(?:house|home|place|apartment|apt|condo|residence|casa)\b/i.exec(rawName.trim());
    return possessive?.[1];
  })();
  if (!owner) return null;
  return norm(owner)
    .replace(/^mother$/, 'mom')
    .replace(/^father$/, 'dad')
    .replace(/^grandma$/, 'abuela')
    .replace(/^grandpa$/, 'abuelo')
    .replace(/^tía$/, 'tia')
    .replace(/^tío$/, 'tio');
}

function isGenericResidenceName(name: string): boolean {
  const n = norm(name);
  return /\bfamily\s+(?:home|house)\b/.test(n) || /^(?:home|house|family home|family house|the house|our house|my house)$/.test(n);
}

function reviewResult(
  left: PlaceClassification,
  right: PlaceClassification,
  relationship: PlaceDuplicateRelationship,
  reason: PlaceDuplicateReviewReason,
  confidence: number,
  canMerge: boolean,
  requiresReview: boolean,
  evidence: string[],
): PlaceDuplicateReview {
  return { left, right, relationship, reason, confidence, canMerge, requiresReview, evidence };
}

export function reviewPlaceDuplicateCompatibility(
  a: string,
  b: string,
  options: { leftProvenance?: string[]; rightProvenance?: string[] } = {},
): PlaceDuplicateReview {
  const left = classifyPlace(a);
  const right = classifyPlace(b);
  const exact = norm(a) === norm(b);
  const canonicalMatch = norm(left.canonicalName) === norm(right.canonicalName);
  const overlap = tokenOverlapScore(a, b);
  const evidence = [
    `types: ${left.category} vs ${right.category}`,
    `canonical: "${left.canonicalName}" vs "${right.canonicalName}"`,
    `token_overlap: ${overlap.toFixed(2)}`,
  ];

  if (exact) {
    return reviewResult(left, right, 'alias_of', 'possible_alias', 1, true, false, ['normalized name match', ...evidence]);
  }

  const leftFamily = categoryFamily(left);
  const rightFamily = categoryFamily(right);

  if (leftFamily === 'EVENT' && rightFamily === 'PLACE' && canonicalMatch) {
    return reviewResult(left, right, 'hosted_event_at', 'hosted_event', 0.9, false, false, evidence);
  }
  if (rightFamily === 'EVENT' && leftFamily === 'PLACE' && canonicalMatch) {
    return reviewResult(left, right, 'hosted_event_at', 'hosted_event', 0.9, false, false, evidence);
  }

  if (leftFamily === 'GEOGRAPHY' && (rightFamily === 'PROPERTY' || rightFamily === 'ROOM')) {
    return reviewResult(left, right, 'located_in', 'contained_location', Math.max(overlap, 0.7), false, false, evidence);
  }
  if (rightFamily === 'GEOGRAPHY' && (leftFamily === 'PROPERTY' || leftFamily === 'ROOM')) {
    return reviewResult(left, right, 'located_in', 'contained_location', Math.max(overlap, 0.7), false, false, evidence);
  }

  if (leftFamily === 'ROOM' && rightFamily === 'PROPERTY') {
    return reviewResult(left, right, 'room_of', 'room_or_area', Math.max(overlap, 0.7), false, true, evidence);
  }
  if (rightFamily === 'ROOM' && leftFamily === 'PROPERTY') {
    return reviewResult(left, right, 'room_of', 'room_or_area', Math.max(overlap, 0.7), false, true, evidence);
  }

  if (leftFamily === 'ROOM' && rightFamily === 'ROOM') {
    const sameProvenance = provenanceOverlaps(options.leftProvenance, options.rightProvenance);
    const possible = canonicalMatch || overlap >= 0.65;
    return reviewResult(
      left,
      right,
      possible && sameProvenance ? 'possible_alias' : 'room_of',
      possible && sameProvenance ? 'possible_alias' : 'room_or_area',
      possible ? overlap : 0.3,
      possible && sameProvenance,
      true,
      sameProvenance ? ['same household/location provenance', ...evidence] : ['room aliases require same household provenance', ...evidence],
    );
  }

  if (leftFamily !== rightFamily) {
    return reviewResult(left, right, 'incompatible_type', 'incompatible_type', overlap, false, false, evidence);
  }

  if (leftFamily === 'PROPERTY' && residentialAliasKey(a) === residentialAliasKey(b)) {
    return reviewResult(left, right, 'alias_of', 'possible_alias', 0.92, true, false, ['residential alias key match', ...evidence]);
  }

  if (leftFamily === 'PROPERTY' && rightFamily === 'PROPERTY') {
    const leftOwner = residentialOwnerKey(left, a);
    const rightOwner = residentialOwnerKey(right, b);
    if (leftOwner && rightOwner && leftOwner !== rightOwner) {
      return reviewResult(
        left,
        right,
        'incompatible_type',
        'incompatible_type',
        0.2,
        false,
        false,
        [`different residence owners: ${leftOwner} vs ${rightOwner}`, ...evidence],
      );
    }

    if ((leftOwner || rightOwner) && !(isGenericResidenceName(a) || isGenericResidenceName(b))) {
      return reviewResult(
        left,
        right,
        'incompatible_type',
        'incompatible_type',
        Math.min(overlap, 0.4),
        false,
        false,
        ['owner-specific residence does not match an unowned residence alias', ...evidence],
      );
    }

    return reviewResult(
      left,
      right,
      'possible_alias',
      'possible_alias',
      Math.max(overlap, 0.72),
      true,
      true,
      ['both are residential/family-home places', ...evidence],
    );
  }

  if (canonicalMatch) {
    return reviewResult(left, right, 'alias_of', 'possible_alias', 0.92, true, false, ['canonical name match', ...evidence]);
  }

  if (left.category === right.category && overlap >= 0.65) {
    return reviewResult(left, right, 'possible_alias', 'possible_alias', overlap, true, true, ['same compatible type with strong token overlap', ...evidence]);
  }

  return reviewResult(left, right, 'incompatible_type', 'incompatible_type', overlap, false, false, evidence);
}

/** Duplicate confidence between two place names (0..1), after type/hierarchy compatibility. */
export function placeDuplicateScore(a: string, b: string): number {
  const review = reviewPlaceDuplicateCompatibility(a, b);
  return review.canMerge ? review.confidence : 0;
}

export const placeIntelligence = { classifyPlace, canonicalVenueName, placeDuplicateScore, reviewPlaceDuplicateCompatibility };
