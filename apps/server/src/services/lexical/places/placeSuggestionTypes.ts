/** Place suggestion pipeline — types and shared constants. */

export type PlaceSuggestionStatus =
  | 'known'
  | 'new'
  | 'possible_duplicate'
  | 'attached_context'
  | 'rejected'
  | 'needs_review';

export type NonPlaceEntityType =
  | 'PERSON'
  | 'ROLE'
  | 'RELATIONSHIP'
  | 'TIME_PERIOD'
  | 'PROJECT_ASSET'
  | 'EVENT'
  | 'MUSIC_EVENT'
  | 'ORGANIZATION'
  | 'GROUP'
  | 'SKILL'
  | 'OBJECT'
  | 'EMOTION'
  | 'EDUCATION_ORGANIZATION'
  | 'VENUE_AREA'
  | 'UNRESOLVED_LOCATION'
  | 'DEMOGRAPHIC'
  | 'RELATIVE_LOCATION_CONTEXT';

export type PlaceTaxonomyType =
  | 'country'
  | 'state'
  | 'city'
  | 'city_or_region'
  | 'district'
  | 'neighborhood'
  | 'street'
  | 'private_residence'
  | 'family_home'
  | 'school'
  | 'university'
  | 'campus'
  | 'middle_school'
  | 'high_school'
  | 'classroom'
  | 'workplace'
  | 'office'
  | 'clinic'
  | 'store'
  | 'pharmacy'
  | 'restaurant'
  | 'bar'
  | 'nightclub'
  | 'music_venue'
  | 'event_space'
  | 'gym'
  | 'dojo'
  | 'park'
  | 'stadium'
  | 'convention_center'
  | 'festival_ground'
  | 'worksite'
  | 'deployment_site'
  | 'online_location'
  | 'virtual_location'
  | 'relative_location_context'
  | 'venue_subarea_context'
  | 'unknown_place';

export type PlaceSuggestion = {
  text: string;
  normalizedText: string;
  start: number;
  end: number;
  placeType: PlaceTaxonomyType | string;
  placeSubtype?: PlaceTaxonomyType | string;
  confidence: number;
  status: PlaceSuggestionStatus;
  displayName?: string;
  ownerEntityId?: string;
  ownerDisplayName?: string;
  privacySensitive?: boolean;
  rejectionReason?: string;
  splitFrom?: string;
  evidencePhrases: string[];
  originalCandidate?: string;
  finalSpan?: string;
  boundaryFixes?: string[];
  splitChildren?: string[];
  rejectedAs?: NonPlaceEntityType | string;
  rulesFired?: string[];
  requiresReview?: boolean;
  existingPlaceId?: string;
  mergeCandidates?: PlaceMergeCandidate[];
  sourceMessageIds?: string[];
};

export type PlaceMergeCandidate = {
  id?: string;
  displayName: string;
  placeType?: PlaceTaxonomyType | string;
  normalizedText: string;
  compatibility: 'allowed' | 'rejected';
  reason: string;
};

export type KnownPlaceRecord = {
  id?: string;
  displayName: string;
  aliases?: string[];
  placeType?: PlaceTaxonomyType | string;
};

export type RawPlaceCandidate = {
  text: string;
  start: number;
  end: number;
  evidenceLine: string;
  prepositionCue?: string;
};

export type PlaceSuggestionOptions = {
  knownPlaces?: Set<string>;
  knownPlaceTypes?: Map<string, PlaceTaxonomyType | string>;
  existingPlaces?: KnownPlaceRecord[];
  sourceMessageIds?: string[];
};

export const PLACE_PREPOSITIONS =
  /\b(?:at|in|from|near|around|outside|inside|by|next to|drove to|went to|take (?:her|him|them|me) to)\b/i;

export const BRAND_STORES = new Set([
  'walmart',
  'costco',
  'target',
  'cvs',
  'walgreens',
  'whole foods',
  'trader joes',
  'trader joe',
  'starbucks',
  'mcdonalds',
  'home depot',
  'lowes',
  'safeway',
  'kroger',
  'aldi',
  "denny's",
  'dennys',
]);

export const KNOWN_CITIES = new Set([
  'la',
  'los angeles',
  'dtla',
  'downey',
  'moreno valley',
  'riverside',
  'anaheim',
  'san diego',
  'long beach',
  'irvine',
  'orange',
]);

export const SCHOOL_ABBREVS = new Set(['csuf', 'uci', 'ucla', 'usc', 'cal poly']);

export const EVENT_LIKE_NAMES =
  /\b(afters?|prom|gothicumbia|graduation\s+party|code\s+red|festival|concert|gig|meetup|kickback)\b/i;

export const VENUE_COMPOUND_SUFFIX = /\b(compound|warehouse|grounds|arena|stadium|center|centre)\b/i;
