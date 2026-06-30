/**
 * Reject place candidates better classified as person/event/time/org unless LoreBook history rescues them.
 */

import {
  BRAND_STORES,
  EVENT_LIKE_NAMES,
  KNOWN_CITIES,
  PLACE_PREPOSITIONS,
  SCHOOL_ABBREVS,
  VENUE_COMPOUND_SUFFIX,
  type NonPlaceEntityType,
  type PlaceSuggestionOptions,
} from './placeSuggestionTypes';
import { analyzePrivateResidence, isOrphanPossessiveResidence } from './privateResidenceGuard';
import { classifySpatialReference } from '../../lorebook/quality/spatialContextResolver';

const norm = (s: string) =>
  (s ?? '').toLowerCase().replace(/['']/g, "'").replace(/\s+/g, ' ').trim();

const TIME_ONLY =
  /^(?:march|january|february|april|may|june|july|august|september|october|november|december|last\s+night|yesterday|today|tonight|ago|before\s+covid|every\s+\w+|around\s+noon|lunch\s+break|(?:a\s+)?(?:few|couple)\s+weeks?(?:\s+(?:ago|now))?|(?:a\s+)?(?:few|couple)\s+days?(?:\s+ago)?)$/i;

const ROLE_ONLY = /^(?:tio|tia|tía|mr|mrs|ms|dr|prof|professor|youtuber|streamer|influencer|creator|dj|producer|teacher|professor)$/i;

const PRONOUN_ONLY = /^(?:i|me|my|mine|you|your|he|him|his|she|her|hers|they|them|their|we|us|our|it|its)$/i;

const PROJECT_ASSET =
  /^(?:lorebook|my\s+github\s+repo|github\s+repo|repo|app|project|system|application)$/i;

const OBJECT_OR_VEHICLE =
  /^(?:phone|vape|car|bike|ring\s+doorbell|(?:my\s+|our\s+)?mom'?s\s+car)$/i;

const GROUP_ONLY = /^(?:family|crowd|people|computer\s+science\s+majors)$/i;

const RELATIVE_ONLY =
  /^(?:here|there|home|around\s+the\s+corner|pit|inside|outside|near\s+the\s+stage)$/i;

const PERSON_ALIAS = /^[A-Za-z][\w.-]*\.(?:dad|mom|bro|sis|uncle|aunt)$/i;

const EDUCATION_ORG =
  /\b(bootcamp|boot camp|academy|program|school\s+of|university\s+of)\b/i;

const EVENT_NAME =
  /\b(afters?|prom|gothicumbia|graduation\s+party|code\s+red|festival|concert|gig|anniversary|birthday\s+party|quincea[ñn]era)\b/i;

const MUSIC_EVENT = /\b(gothicumbia|rave|show|set)\b/i;

const AGENT_BY_PATTERN = /\b(?:run|written|hosted|owned|created|made|built|designed|operated)\s+by\s+/i;

const ORG_ONLY = /^(amazon|google|meta|apple|microsoft|netflix)$/i;

function isAmbiguousVenueName(text: string): boolean {
  const n = norm(text);
  if (VENUE_COMPOUND_SUFFIX.test(n)) return false;
  if (BRAND_STORES.has(n) || SCHOOL_ABBREVS.has(n) || KNOWN_CITIES.has(n)) return false;
  if (/\b(house|home|store|office|university|campus|school|academy|warehouse|compound|stadium|park|gym|walmart|costco)\b/i.test(n)) {
    return false;
  }
  return /^[A-Z][a-z]+(?:\s+[A-Z][a-z.]+)+$/.test(text.trim());
}

export type PlaceGuardResult = {
  allowed: boolean;
  rejectedAs?: NonPlaceEntityType | string;
  confidenceBoost: number;
  rulesFired: string[];
  needsReview?: boolean;
};

function isKnownPlace(span: string, options?: PlaceSuggestionOptions): boolean {
  const key = norm(span);
  if (!options?.knownPlaces?.size) return false;
  for (const known of options.knownPlaces) {
    if (norm(known) === key) return true;
  }
  return false;
}

export function guardPlaceCandidate(
  span: string,
  contextLine: string,
  options?: PlaceSuggestionOptions
): PlaceGuardResult {
  const text = span.trim();
  const n = norm(text);
  const rulesFired: string[] = [];

  if (!text || text.length < 2) {
    return { allowed: false, rejectedAs: 'OBJECT', confidenceBoost: 0, rulesFired: ['too_short'] };
  }

  if (isOrphanPossessiveResidence(text)) {
    return { allowed: false, rejectedAs: 'OBJECT', confidenceBoost: 0, rulesFired: ['orphan_possessive'] };
  }

  if (TIME_ONLY.test(text)) {
    return { allowed: false, rejectedAs: 'TIME_PERIOD', confidenceBoost: 0, rulesFired: ['time_only'] };
  }

  if (PRONOUN_ONLY.test(text) || /^[.!?]?\s*(?:her|she|him|he|they|it)(?:\s*[.!?]\s*(?:her|she|him|he|they|it))*\s*$/i.test(text)) {
    return { allowed: false, rejectedAs: 'PERSON', confidenceBoost: 0, rulesFired: ['pronoun_fragment'] };
  }

  if (PROJECT_ASSET.test(text)) {
    return { allowed: false, rejectedAs: 'PROJECT_ASSET', confidenceBoost: 0, rulesFired: ['project_asset'] };
  }

  if (OBJECT_OR_VEHICLE.test(text)) {
    return { allowed: false, rejectedAs: 'OBJECT', confidenceBoost: 0, rulesFired: ['object_or_vehicle'] };
  }

  if (GROUP_ONLY.test(text)) {
    return { allowed: false, rejectedAs: 'GROUP', confidenceBoost: 0, rulesFired: ['group_not_place'] };
  }

  if (RELATIVE_ONLY.test(text)) {
    return { allowed: false, rejectedAs: 'RELATIVE_LOCATION_CONTEXT', confidenceBoost: 0, rulesFired: ['relative_location_context'] };
  }

  if (ROLE_ONLY.test(text)) {
    return { allowed: false, rejectedAs: 'ROLE', confidenceBoost: 0, rulesFired: ['role_only'] };
  }

  if (PERSON_ALIAS.test(text)) {
    return { allowed: false, rejectedAs: 'PERSON', confidenceBoost: 0, rulesFired: ['person_alias'] };
  }

  if (AGENT_BY_PATTERN.test(contextLine) && /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?$/.test(text)) {
    return { allowed: false, rejectedAs: 'PERSON', confidenceBoost: 0, rulesFired: ['agent_by_person'] };
  }

  const known = isKnownPlace(text, options);
  if (known) {
    rulesFired.push('history_rescue');
    return { allowed: true, confidenceBoost: 0.15, rulesFired, needsReview: EVENT_NAME.test(n) };
  }

  if (EVENT_NAME.test(n) || EVENT_LIKE_NAMES.test(n)) {
    return {
      allowed: false,
      rejectedAs: MUSIC_EVENT.test(n) ? 'MUSIC_EVENT' : 'EVENT',
      confidenceBoost: 0,
      rulesFired: ['event_not_place'],
      needsReview: /\bcode\s+red\b/i.test(n),
    };
  }

  // Spatial Context Resolver — catches the event/venue-area/relative-position/
  // generic-reference/age cases the patterns above miss ("Ink's Ska Prom",
  // "Genni's Pit", "front of Shyla", "Security Kickout Venue", "my age").
  const spatial = classifySpatialReference(text);
  if (!spatial.isPlace) {
    const rejectedAs: NonPlaceEntityType =
      spatial.referenceType === 'event'
        ? MUSIC_EVENT.test(n)
          ? 'MUSIC_EVENT'
          : 'EVENT'
        : spatial.referenceType === 'venue_area'
          ? 'VENUE_AREA'
          : spatial.referenceType === 'demographic'
            ? 'DEMOGRAPHIC'
            : spatial.referenceType === 'unresolved_location'
              ? 'UNRESOLVED_LOCATION'
              : 'RELATIVE_LOCATION_CONTEXT'; // spatial_relationship | relative_position
    return { allowed: false, rejectedAs, confidenceBoost: 0, rulesFired: [`spatial:${spatial.reason}`] };
  }

  if (analyzePrivateResidence(text)) {
    return { allowed: true, confidenceBoost: 0.1, rulesFired: ['private_residence'], needsReview: true };
  }

  if (/^(?:club nova|bad dogg compound)$/i.test(n)) {
    rulesFired.push('known_named_place');
    return { allowed: true, confidenceBoost: 0.14, rulesFired };
  }

  if (BRAND_STORES.has(n) || SCHOOL_ABBREVS.has(n) || KNOWN_CITIES.has(n)) {
    const boost = PLACE_PREPOSITIONS.test(contextLine) ? 0.12 : 0.05;
    rulesFired.push('high_confidence_place_token');
    return { allowed: true, confidenceBoost: boost, rulesFired };
  }

  if (/^[A-Z][a-z]{1,15}$/.test(text) && !PLACE_PREPOSITIONS.test(contextLine)) {
    return { allowed: false, rejectedAs: 'PERSON', confidenceBoost: 0, rulesFired: ['single_given_name'] };
  }

  if (/^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(text) && !PLACE_PREPOSITIONS.test(contextLine)) {
    if (!/\b(compound|warehouse|university|college|store|office|park|gym|house|home|center|centre)\b/i.test(text)) {
      return { allowed: false, rejectedAs: 'PERSON', confidenceBoost: 0, rulesFired: ['person_full_name'] };
    }
  }

  if (isAmbiguousVenueName(text)) {
    return {
      allowed: false,
      rejectedAs: 'EVENT',
      confidenceBoost: 0,
      rulesFired: ['ambiguous_venue_unknown'],
      needsReview: true,
    };
  }

  if (EDUCATION_ORG.test(text) && !PLACE_PREPOSITIONS.test(contextLine)) {
    return {
      allowed: false,
      rejectedAs: 'EDUCATION_ORGANIZATION',
      confidenceBoost: 0,
      rulesFired: ['education_org_default'],
      needsReview: true,
    };
  }

  if (ORG_ONLY.test(n) && !/\b(warehouse|office|store|campus|at|in)\b/i.test(contextLine)) {
    return { allowed: false, rejectedAs: 'ORGANIZATION', confidenceBoost: 0, rulesFired: ['org_not_place'] };
  }

  const boost = PLACE_PREPOSITIONS.test(contextLine) ? 0.1 : 0;
  if (boost) rulesFired.push('place_preposition_cue');

  if (
    text.split(/\s+/).length >= 3 &&
    boost === 0 &&
    !/\b(street|avenue|blvd|road|compound|park|gym|house|store|office|campus|university|center|centre)\b/i.test(text)
  ) {
    return { allowed: false, rejectedAs: 'UNKNOWN', confidenceBoost: 0, rulesFired: ['weak_place_signal'] };
  }

  rulesFired.push('place_allowed');
  return { allowed: true, confidenceBoost: boost, rulesFired };
}
