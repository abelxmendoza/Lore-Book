/**
 * Classifies extracted mentions so character creation only runs for real people.
 * Holidays, events, games, and phrase fragments (e.g. "Magic" / "Gathering" from MTG)
 * are routed to the omega memory graph instead.
 */

import { normalizeNameKey } from './nameNormalization';

export type MentionKind =
  | 'person'
  | 'holiday'
  | 'event'
  | 'game'
  | 'concept'
  | 'fragment'
  | 'common_noun';

export type MentionClassification = {
  kind: MentionKind;
  /** Target omega entity type when kind !== person */
  omegaType?: 'EVENT' | 'ORG';
  /** Canonical label for merged/retyped entities */
  canonicalName?: string;
  reason?: string;
};

const US_HOLIDAYS = new Set([
  'new years day',
  'new year\'s day',
  'martin luther king day',
  'mlk day',
  'presidents day',
  'president\'s day',
  'memorial day',
  'juneteenth',
  'independence day',
  'fourth of july',
  '4th of july',
  'labor day',
  'columbus day',
  'indigenous peoples day',
  'veterans day',
  'thanksgiving',
  'thanksgiving day',
  'christmas',
  'christmas day',
  'easter',
  'halloween',
  'valentines day',
  'valentine\'s day',
  'mothers day',
  'mother\'s day',
  'fathers day',
  'father\'s day',
]);

/** Known events, shows, and recurring gatherings — not people. */
const KNOWN_EVENTS = new Set([
  'gothicumbia',
  'goth club',
  'goth night',
]);

/** Game / product names that must never become person cards. */
const KNOWN_GAMES_AND_PRODUCTS: Record<string, string> = {
  'magic the gathering': 'Magic: The Gathering',
  'magic: the gathering': 'Magic: The Gathering',
  'mtg': 'Magic: The Gathering',
};

/** Single-token fragments from multi-word proper names (MTG split). */
const PHRASE_FRAGMENTS = new Set([
  'magic',
  'gathering',
  'memorial',
  'independence',
  'thanksgiving',
  'christmas',
  'valentine',
  'valentines',
]);

/** Capitalized common English nouns that extractors mistake for first names. */
const COMMON_NOUN_TOKENS = new Set([
  'magic', 'gathering', 'memorial', 'holiday', 'party', 'night', 'show',
  'event', 'festival', 'concert', 'game', 'club', 'dance', 'music',
]);

const HOLIDAY_SUFFIX = /\b(?:day|weekend|eve)\b/i;
const EVENT_NAME_PATTERN =
  /\b(?:fest(?:ival)?|show|concert|party|night|ball|gala|expo|convention|summit|meetup|dance|festival)\b/i;

export function classifyMentionKind(name: string, rawContext?: string): MentionClassification {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return { kind: 'fragment', reason: 'empty' };

  const key = normalizeNameKey(trimmed);
  const tokens = key.split(' ').filter(Boolean);

  if (US_HOLIDAYS.has(key)) {
    return { kind: 'holiday', omegaType: 'EVENT', canonicalName: trimmed, reason: 'us_holiday' };
  }

  if (KNOWN_EVENTS.has(key)) {
    return { kind: 'event', omegaType: 'EVENT', canonicalName: trimmed, reason: 'known_event' };
  }

  const gameCanonical = KNOWN_GAMES_AND_PRODUCTS[key];
  if (gameCanonical) {
    return { kind: 'game', omegaType: 'ORG', canonicalName: gameCanonical, reason: 'known_game' };
  }

  // "Memorial Day", "Labor Day", etc.
  if (tokens.length >= 2 && HOLIDAY_SUFFIX.test(trimmed) && tokens.some((t) => US_HOLIDAYS.has(`${tokens.slice(0, -1).join(' ')} ${t}`) || US_HOLIDAYS.has(key))) {
    return { kind: 'holiday', omegaType: 'EVENT', canonicalName: trimmed, reason: 'holiday_pattern' };
  }
  if (tokens.length === 2 && HOLIDAY_SUFFIX.test(trimmed)) {
    const first = tokens[0];
    if (['memorial', 'labor', 'independence', 'thanksgiving', 'valentine', 'valentines', 'presidents', 'veterans', 'mothers', 'fathers'].includes(first)) {
      return { kind: 'holiday', omegaType: 'EVENT', canonicalName: trimmed, reason: 'holiday_suffix' };
    }
  }

  if (EVENT_NAME_PATTERN.test(trimmed) || /\b(?:umbia|fest|athon)\b/i.test(trimmed)) {
    return { kind: 'event', omegaType: 'EVENT', canonicalName: trimmed, reason: 'event_pattern' };
  }

  if (tokens.length === 1 && PHRASE_FRAGMENTS.has(key)) {
    if (rawContext) {
      const ctx = normalizeNameKey(rawContext);
      if (key === 'magic' && ctx.includes('gathering')) {
        return { kind: 'game', omegaType: 'ORG', canonicalName: 'Magic: The Gathering', reason: 'mtg_context' };
      }
      if (key === 'gathering' && ctx.includes('magic')) {
        return { kind: 'game', omegaType: 'ORG', canonicalName: 'Magic: The Gathering', reason: 'mtg_context' };
      }
    }
    return { kind: 'fragment', reason: 'phrase_fragment' };
  }

  if (tokens.length === 1 && COMMON_NOUN_TOKENS.has(key)) {
    return { kind: 'common_noun', reason: 'common_noun' };
  }

  return { kind: 'person' };
}

/** Single-token names need multiple mentions before auto-promotion to the Characters book. */
export function shouldDeferCharacterPromotion(name: string, mentionCount: number): boolean {
  const key = normalizeNameKey(name);
  const tokens = key.split(' ').filter(Boolean);
  if (tokens.length >= 2) return false;
  if (mentionCount >= 2) return false;
  return true;
}

export function isNonPersonMention(name: string, rawContext?: string): boolean {
  return classifyMentionKind(name, rawContext).kind !== 'person';
}
