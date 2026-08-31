/**
 * Detect placeholder / unresolved person labels that should never appear as
 * a character name in user-facing UI (e.g. Dating & Romance cards).
 */

import {
  evaluateTitleOnlyPersonGuard,
  isMinimumPersonEntity,
} from '../services/lexical/intelligence/titleOnlyEntityGuard';

const PLACEHOLDER_NAME_KEYS = new Set([
  'unknown',
  'unknown person',
  'unnamed',
  'unnamed person',
  'someone',
  'somebody',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
]);

/**
 * LoreBook navigation/surface labels are product vocabulary, never people.
 * Keep this exact-label based so real names containing an adjacent word such
 * as "Book" or "Character" remain valid.
 */
const APP_SURFACE_NAME_KEYS = new Set([
  'lorebook',
  'character book',
  'characters book',
  'people book',
  'organization book',
  'organizations book',
  'group book',
  'groups book',
  'groups and organizations book',
  'groups & organizations book',
  'location book',
  'locations book',
  'place book',
  'places book',
  'places and locations book',
  'places & locations book',
]);

/** Plural roles, teams, and group labels — not individual people. */
const COLLECTIVE_TAIL_WORDS = new Set([
  'engineers', 'engineer', 'developers', 'developer', 'designers', 'designer',
  'managers', 'manager', 'employees', 'employee', 'recruiters', 'recruiter',
  'analysts', 'analyst', 'consultants', 'consultant', 'contractors', 'contractor',
  'interns', 'intern', 'staff', 'team', 'teams', 'crew', 'squad', 'department',
  'departments', 'division', 'divisions', 'unit', 'units', 'group', 'groups',
  'members', 'member', 'colleagues', 'colleague', 'coworkers', 'co-workers',
  'coworker', 'people', 'folks', 'guys', 'girls', 'boys', 'friends', 'classmates',
  'teammates', 'siblings', 'parents', 'cousins', 'nephews', 'nieces', 'children',
  'kids', 'executives', 'executive', 'leadership', 'management', 'workers',
  'worker', 'associates', 'associate', 'representatives', 'representative',
  'agents', 'agent', 'specialists', 'specialist', 'onboarding', 'hiring',
  // Deliberately narrow: only words that are essentially never a real
  // surname/last-token ("guy"/"girl"/"boy"/"kid" tail-match legacy junk like
  // "the new guy"). Broader generic nouns ("person", "fan", "user",
  // "attendee", "organizer"...) stay OUT of this tail-word set — matching on
  // last-token-alone would reject real two-word names that merely end in
  // one of those words (e.g. "Fail Person", "Sam Fisher"-shaped names). They
  // are still caught when the ENTIRE name is a generic reference via
  // GENERIC_PERSON_REFERENCE_PATTERN below.
  'guy', 'girl', 'boy', 'kid', 'egirl', 'egirls', 'e-girl', 'e-girls',
]);

const COLLECTIVE_INLINE_PATTERN =
  /\b(?:team|crew|squad|group|department|division|unit|staff|roster|committee|guild|union|society|association|board|leadership|management|workforce|personnel)\b/i;

/**
 * Generic person references like "one girl", "the new guy", or
 * "people in the scene" — whole-string anchored so real names that merely
 * contain one of these words (e.g. a surname) aren't caught in passing.
 * Mirrors the frontend's equivalent filter in
 * apps/web/src/features/chat/utils/mentionLifecycle.ts, extended to cover
 * singular forms and an open-ended "in ..." suffix.
 *
 * The modifier group requires its own trailing space (`\s+` inside the
 * group, not a bare `\s*` after it) specifically so a concatenated real
 * name like "NewPerson" can't accidentally align "new" + "person" with zero
 * separating characters — only an actual "new <noun>" with a real space
 * matches.
 */
// "friends" stays plural-only (no `?`) — bare singular "Friend" already has
// its own, deliberately distinct rejection path (isRoleDescriptorPersonName
// / isTitleOnlyPersonName, reason "bare_title_without_context") that a
// test pins; widening this word to match singular would silently reclassify
// it as "collective_not_individual" instead.
const GENERIC_PERSON_REFERENCE_PATTERN =
  /^(?:(?:the|some|other|those|these|my|our|one|a|an)\s+)?(?:(?:other|new|random|popular)\s+)?(?:girls?|guys?|boys?|kids?|persons?|people|folks?|friends|coworkers?|co-workers?|organizers?|attendees?|fans?|users?|egirls?|e-girls?)(?:\s+in\s+.+)?$/i;

const HONORIFIC_ONLY = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'sir', 'maam', "ma'am"]);

const ROLE_DESCRIPTOR_WORDS =
  /\b(?:dj|dancer|promoter|organizer|admirer|guardian|colleague|mentor|connection|recruiter|boyfriend|girlfriend|onboarding)\b/i;

const ROLE_PHRASE_PATTERN =
  /\bfrom\s+the\b|\bfor\b.+\b(?:show|meeting|event|scene|run)\b/i;

export function normalizePersonNameKey(name: string): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isPlaceholderPersonName(name: string | null | undefined): boolean {
  if (name == null || !String(name).trim()) return true;
  const key = normalizePersonNameKey(String(name));
  if (!key) return true;
  if (PLACEHOLDER_NAME_KEYS.has(key)) return true;
  // "Alex Unknown" and similar — title ends with unresolved token
  if (/\bunknown\b/.test(key)) return true;
  return false;
}

export function isAppSurfacePersonName(name: string | null | undefined): boolean {
  if (name == null || !String(name).trim()) return false;
  return APP_SURFACE_NAME_KEYS.has(normalizePersonNameKey(String(name)));
}

/** Groups, teams, departments, and org+role labels like "Amazon Engineers". */
export function isCollectivePersonName(name: string | null | undefined): boolean {
  if (name == null || !String(name).trim()) return false;
  const trimmed = String(name).trim();
  const key = normalizePersonNameKey(trimmed);
  const tokens = key.split(' ').filter(Boolean);
  if (tokens.length === 0) return false;

  if (GENERIC_PERSON_REFERENCE_PATTERN.test(trimmed)) return true;

  const last = tokens[tokens.length - 1];
  if (COLLECTIVE_TAIL_WORDS.has(last)) return true;

  if (COLLECTIVE_INLINE_PATTERN.test(trimmed)) return true;

  // "The engineers", "my coworkers"
  if (/^(?:the|my|our)\s+/.test(trimmed) && tokens.length >= 2) {
    const head = tokens[1];
    if (COLLECTIVE_TAIL_WORDS.has(head) || COLLECTIVE_INLINE_PATTERN.test(tokens.slice(1).join(' '))) {
      return true;
    }
  }

  return false;
}

/** Epithet / role labels like "DJ for Hell Fairy's Show" — not stable person names. */
export function isRoleDescriptorPersonName(name: string | null | undefined): boolean {
  if (name == null || !String(name).trim()) return false;
  const trimmed = String(name).trim();
  const key = normalizePersonNameKey(trimmed);
  const tokens = key.split(' ').filter(Boolean);
  if (tokens.length === 1 && HONORIFIC_ONLY.has(key)) return true;
  if (ROLE_PHRASE_PATTERN.test(trimmed)) return true;
  if (/\bfrom\b.+\b(?:scene|underground|club|goth)\b/i.test(trimmed)) return true;
  if (ROLE_DESCRIPTOR_WORDS.test(trimmed) && tokens.length >= 3) return true;
  return false;
}

export function isDisplayablePersonName(name: string | null | undefined): boolean {
  return !isPlaceholderPersonName(name);
}

export function isTitleOnlyPersonName(name: string | null | undefined): boolean {
  if (name == null || !String(name).trim()) return false;
  return evaluateTitleOnlyPersonGuard(String(name)).isTitleOnly;
}

export function isIndividualPersonName(name: string | null | undefined): boolean {
  if (!isDisplayablePersonName(name)) return false;
  if (isAppSurfacePersonName(name)) return false;
  if (isCollectivePersonName(name)) return false;
  if (isRoleDescriptorPersonName(name)) return false;
  if (isTitleOnlyPersonName(name)) return false;
  return isMinimumPersonEntity(String(name));
}
