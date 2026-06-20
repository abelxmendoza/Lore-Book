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

const norm = (s: string) =>
  (s ?? '').toLowerCase().replace(/['']/g, "'").replace(/\s+/g, ' ').trim();

const TIME_ONLY =
  /^(?:last\s+night|yesterday|today|tonight|ago|(?:a\s+)?(?:few|couple)\s+weeks?(?:\s+ago)?|(?:a\s+)?(?:few|couple)\s+days?(?:\s+ago)?)$/i;

const ROLE_ONLY = /^(?:youtuber|streamer|influencer|creator|dj|producer|teacher|professor)$/i;

const PERSON_ALIAS = /^[A-Za-z][\w.-]*\.(?:dad|mom|bro|sis|uncle|aunt)$/i;

const EDUCATION_ORG =
  /\b(bootcamp|boot camp|academy|program|school\s+of|university\s+of)\b/i;

const EVENT_NAME =
  /\b(prom|gothicumbia|graduation\s+party|code\s+red|festival|concert|gig|anniversary|birthday\s+party|quincea[ñn]era)\b/i;

const MUSIC_EVENT = /\b(gothicumbia|rave|show|set)\b/i;

const AGENT_BY_PATTERN = /\b(?:run|written|hosted|owned|created|made|built|designed|operated)\s+by\s+/i;

const ORG_ONLY = /^(amazon|google|meta|apple|microsoft|netflix)$/i;

function isAmbiguousVenueName(text: string): boolean {
  const n = norm(text);
  if (VENUE_COMPOUND_SUFFIX.test(n)) return false;
  if (BRAND_STORES.has(n) || SCHOOL_ABBREVS.has(n) || KNOWN_CITIES.has(n)) return false;
  if (/\b(house|home|store|office|university|campus|warehouse|compound|stadium|park|gym|walmart|costco)\b/i.test(n)) {
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

  if (analyzePrivateResidence(text)) {
    return { allowed: true, confidenceBoost: 0.1, rulesFired: ['private_residence'], needsReview: true };
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
