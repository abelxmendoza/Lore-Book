/** Place suggestion pipeline — types and shared constants. */

export type PlaceSuggestionStatus = 'known' | 'new' | 'rejected' | 'needs_review';

export type NonPlaceEntityType =
  | 'PERSON'
  | 'ROLE'
  | 'RELATIONSHIP'
  | 'TIME_PERIOD'
  | 'EVENT'
  | 'MUSIC_EVENT'
  | 'ORGANIZATION'
  | 'GROUP'
  | 'SKILL'
  | 'OBJECT'
  | 'EMOTION'
  | 'EDUCATION_ORGANIZATION';

export type PlaceTaxonomyType =
  | 'country'
  | 'state'
  | 'city'
  | 'neighborhood'
  | 'street'
  | 'private_residence'
  | 'family_home'
  | 'school'
  | 'university'
  | 'campus'
  | 'classroom'
  | 'workplace'
  | 'office'
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
  | 'virtual_community'
  | 'unknown_place';

export type PlaceSuggestion = {
  text: string;
  normalizedText: string;
  start: number;
  end: number;
  placeType: PlaceTaxonomyType | string;
  confidence: number;
  status: PlaceSuggestionStatus;
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
  /\b(prom|gothicumbia|graduation\s+party|code\s+red|festival|concert|gig|meetup|kickback)\b/i;

export const VENUE_COMPOUND_SUFFIX = /\b(compound|warehouse|grounds|arena|stadium|center|centre)\b/i;
