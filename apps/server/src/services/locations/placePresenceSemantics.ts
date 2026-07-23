/**
 * Place presence semantics — separate mentions from visits, and co-mentions from
 * participation. Same-message entity/emotion/timestamp contamination is the main
 * Places-book trust bug; these helpers keep that out of card counters.
 */

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalize = (value: string) =>
  (value ?? '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** First-person / explicit presence language near a place name. */
const VISIT_PREDICATES = [
  'went to',
  'go to',
  'going to',
  'visited',
  'visit',
  'drove to',
  'drive to',
  'driving to',
  'headed to',
  'heading to',
  'arrived at',
  'arrive at',
  'got to',
  'back from',
  'coming from',
  'came from',
  'left',
  'leaving',
  'live at',
  'live in',
  'lived at',
  'lived in',
  'living at',
  'living in',
  'stayed at',
  'stay at',
  'staying at',
  'ran at',
  'run at',
  'running at',
  'worked at',
  'work at',
  'working at',
  'was at',
  'were at',
  'am at',
  'is at',
  'at the',
  'inside',
  'outside',
];

/** Language that proves someone else shared the place with the user. */
const PARTICIPATION_PATTERNS = [
  /\b(?:went|go(?:ing)?|drove|drive(?:ing)?|headed|heading)\s+with\s+{person}\b/i,
  /\b{person}\s+and\s+i\b/i,
  /\bi\s+and\s+{person}\b/i,
  /\b(?:met|meet(?:ing)?)\s+{person}\s+(?:at|in)\s+{place}\b/i,
  /\b(?:met|meet(?:ing)?)\s+(?:at|in)\s+{place}\s+with\s+{person}\b/i,
  /\b(?:was|were)\s+(?:there\s+)?with\s+{person}\b/i,
  /\b(?:ran|run(?:ning)?|jogged|jogging)\s+with\s+{person}\b/i,
  /\b(?:took|brought)\s+{person}\s+(?:to|with)\b/i,
  /\bwith\s+{person}\s+(?:at|in|to)\s+{place}\b/i,
  /\b{person}\s+(?:was|were)\s+(?:there|at|in)\b/i,
];

const STORY_TAG_BLOCKLIST = new Set([
  'technology',
  'ui',
  'design',
  'coding',
  'software',
  'engineering',
  'depressed',
  'depression',
  'anxiety',
  'lonely',
  'loneliness',
  'heartbroken',
  'relationship',
  'romantic',
  'breakup',
  'love',
  'hate',
]);

const VISIT_CONTEXT_TAGS = new Set([
  'nightlife',
  'dancing',
  'dance',
  'party',
  'clubbing',
  'intoxication',
  'drunk',
  'drinks',
  'concert',
  'show',
  'travel',
  'trip',
  'workout',
  'running',
  'family',
  'dinner',
  'lunch',
  'work',
  'school',
]);

export type PlacePresenceKind = 'mention' | 'visit' | 'attendance';

export type PlacePersonLinkKind = 'verified' | 'participated' | 'co_mentioned';

export function entryTextBlob(entry: {
  content?: string | null;
  summary?: string | null;
  original_content?: string | null;
}): string {
  return [entry.content, entry.summary, entry.original_content].filter(Boolean).join('\n');
}

/**
 * Classify whether an entry that names a place is a real visit/attendance or only a mention.
 * Default is mention — provenance over vibes.
 */
export function classifyPlacePresence(
  placeName: string,
  entryText: string,
  opts?: { source?: string | null; hasCoordinates?: boolean },
): PlacePresenceKind {
  const place = normalize(placeName);
  const text = normalize(entryText);

  // GPS/coordinate-linked memories are stronger than bare name co-occurrence.
  if (opts?.hasCoordinates && place) {
    if (/\b(?:attended|attendance|afters|afterparty|convention|expo|festival)\b/i.test(text)) {
      return 'attendance';
    }
    return 'visit';
  }

  if (!place || !text.includes(place)) {
    // Metadata may tag the place without repeating the name in body — still not a visit.
    return 'mention';
  }

  const placePattern = escapeRegExp(place);
  const nearPlace = new RegExp(
    `(?:${VISIT_PREDICATES.map(escapeRegExp).join('|')})\\s+(?:the\\s+|my\\s+|our\\s+)?${placePattern}\\b|\\b(?:at|in|to|from|near)\\s+(?:the\\s+|my\\s+|our\\s+)?${placePattern}\\b`,
    'i',
  );

  if (!nearPlace.test(text) && !VISIT_PREDICATES.some((p) => text.includes(`${p} ${place}`))) {
    // Pure name drop / X import chatter without locative language.
    return 'mention';
  }

  // Event-series attendance cue (still not a durable place visit).
  if (/\b(?:attended|attendance|afters|afterparty|convention|expo|festival)\b/i.test(text)) {
    return 'attendance';
  }

  // Social posts that only name a place without first-person presence stay mentions.
  const source = normalize(opts?.source ?? '');
  if ((source.includes('x') || source.includes('twitter') || source.includes('social')) && !/\b(?:i|we)\b/.test(text)) {
    return 'mention';
  }

  return 'visit';
}

/**
 * Same-message co-occurrence ≠ presence. Require an explicit participation predicate.
 */
export function hasPlaceParticipation(
  personName: string,
  placeName: string,
  entryText: string,
): boolean {
  const person = normalize(personName);
  const place = normalize(placeName);
  const text = normalize(entryText);
  if (!person || !place || !text) return false;

  const personPat = escapeRegExp(person);
  const placePat = escapeRegExp(place);

  return PARTICIPATION_PATTERNS.some((template) => {
    const pattern = new RegExp(
      template.source.replace(/\{person\}/g, personPat).replace(/\{place\}/g, placePat),
      template.flags,
    );
    return pattern.test(text);
  });
}

export function classifyTagBucket(
  tag: string,
): 'intrinsic' | 'visit_context' | 'story' {
  const key = normalize(tag).replace(/[_-]+/g, ' ');
  if (STORY_TAG_BLOCKLIST.has(key) || key.split(' ').some((part) => STORY_TAG_BLOCKLIST.has(part))) {
    return 'story';
  }
  if (VISIT_CONTEXT_TAGS.has(key) || key.split(' ').some((part) => VISIT_CONTEXT_TAGS.has(part))) {
    return 'visit_context';
  }
  // Journal emotional moods and product/dev jargon stay out of intrinsic place identity.
  if (/\b(?:mood|feeling|emotion|depressed|anxious|lonely|ui|ux|api|bug|feature)\b/i.test(key)) {
    return 'story';
  }
  return 'visit_context';
}

/** Detect "Catch One and Club Metro"-style compound place cards that should be split. */
export function detectCompoundPlaceNames(name: string): string[] | null {
  const text = (name ?? '').trim();
  if (!/\s+and\s+/i.test(text)) return null;
  // Possessives / household phrases are not compound venues.
  if (/\b(?:mom|dad|abuela|abuelo|grandma|grandpa|t[ií]o|t[ií]a|uncle|aunt)\b/i.test(text)) {
    return null;
  }
  const parts = text.split(/\s+and\s+/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  const bothLookNamed =
    parts.every((part) => part.length >= 3 && /[A-Za-z]/.test(part)) &&
    parts.every((part) => !/^(?:i|me|you|we|they|him|her|them)$/i.test(part));
  return bothLookNamed ? parts : null;
}

/** Alias cleanup: "X the club" → canonical "X". */
export function stripVenueAliasTail(name: string): string | null {
  const match = (name ?? '').trim().match(/^(.+?)\s+the\s+(?:club|venue|bar|spot)$/i);
  if (!match?.[1]) return null;
  const canonical = match[1].trim();
  return canonical.length >= 2 ? canonical : null;
}
