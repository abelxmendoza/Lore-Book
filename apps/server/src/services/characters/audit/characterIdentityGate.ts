/**
 * Identity gate for the character card audit.
 *
 * Hard rule: a phrase can have provenance and still not be a character.
 * Provenance proves the phrase was *mentioned*; it does not prove the phrase
 * is a *human*. Before a card can be `valid_identity` it must survive:
 *
 *   1. Sentence-bleed / pronoun-fragment rejection ("Also You", "You")
 *   2. Domain arbitration — if the name strongly matches a tool, band, media
 *      title, event, work process, or role/occupation, Character loses.
 *   3. A human-likeness gate — at least one positive person signal
 *      (person-name shape, family/honorific title, stage name, person or
 *      public-figure evidence in provenance).
 */

import { normalizePersonNameKey } from '../../../utils/personNameValidation';

// ── Sentence bleed / pronoun fragments ──────────────────────────────────────

// First-person tokens (I/me/my…) are deliberately excluded: ingestion maps
// self-reference to the user's own card, and a card literally named "Me" must
// never be auto-flagged for deletion here.
const PRONOUN_TOKENS = new Set([
  'you', 'he', 'she', 'we', 'they', 'him', 'her', 'us', 'them',
  'yourself', 'himself', 'herself', 'themselves', 'yours',
]);

const CONNECTIVE_TOKENS = new Set([
  'also', 'and', 'but', 'then', 'so', 'too', 'just', 'even', 'still',
  'again', 'well', 'maybe', 'plus', 'or', 'however', 'anyway',
]);

export type SentenceBleedResult =
  | { rejected: false }
  | { rejected: true; kind: 'sentence_bleed' | 'pronoun_fragment'; reason: string };

export function evaluateSentenceBleed(name: string): SentenceBleedResult {
  const tokens = normalizePersonNameKey(name).split(' ').filter(Boolean);
  if (tokens.length === 0) return { rejected: false };

  const allNoise = tokens.every(
    (t) => PRONOUN_TOKENS.has(t) || CONNECTIVE_TOKENS.has(t),
  );
  if (!allNoise) return { rejected: false };

  if (tokens.length === 1 && PRONOUN_TOKENS.has(tokens[0])) {
    return {
      rejected: true,
      kind: 'pronoun_fragment',
      reason: `"${name}" is a bare pronoun, not a person's name`,
    };
  }
  return {
    rejected: true,
    kind: 'sentence_bleed',
    reason: `"${name}" reads as sentence bleed (pronoun/connective fragment), not a person's name`,
  };
}

// ── Domain arbitration ───────────────────────────────────────────────────────

export type ArbitrationDomain = 'tool' | 'media' | 'band' | 'role' | 'event' | 'process';

export type DomainArbitrationResult = {
  domain: ArbitrationDomain | null;
  /** strong = name-level evidence (lexicon/pattern); weak = provenance-only. */
  strength: 'strong' | 'weak' | null;
  reason?: string;
};

const NO_MATCH: DomainArbitrationResult = { domain: null, strength: null };

/** Software / AI tools that extraction keeps mistaking for people. */
const TOOL_NAME_KEYS = new Set([
  'claude code', 'chatgpt', 'chat gpt', 'copilot', 'github copilot', 'cursor',
  'vs code', 'vscode', 'visual studio code', 'github', 'gitlab', 'jira',
  'slack', 'discord', 'notion', 'figma', 'photoshop', 'illustrator',
  'supabase', 'postgres', 'postgresql', 'mysql', 'mongodb', 'redis',
  'docker', 'kubernetes', 'playwright', 'vitest', 'terraform',
]);

/** Media / fandom titles (anime, franchises) that read like proper names. */
const MEDIA_TITLE_KEYS = new Set([
  'one piece', 'naruto', 'dragon ball', 'dragon ball z', 'bleach',
  'attack on titan', 'jujutsu kaisen', 'demon slayer', 'my hero academia',
  'sailor moon', 'cowboy bebop', 'evangelion', 'hunter x hunter',
  'star wars', 'star trek', 'harry potter', 'lord of the rings',
  'game of thrones', 'pokemon', 'zelda', 'final fantasy',
]);

/** Work / onboarding process phrases — events in a pipeline, not people. */
const PROCESS_PHRASE_KEYS = new Set([
  'background check', 'background screening', 'onboarding', 'orientation',
  'interview', 'phone screen', 'drug test', 'performance review',
  'offer letter', 'hiring process', 'code review', 'stand up', 'standup',
]);

/** "Los/Las X" naming is a band/group convention — except real place names. */
const SPANISH_ARTICLE_PLACES = new Set([
  'los angeles', 'las vegas', 'los altos', 'los gatos', 'las cruces',
  'los feliz', 'los banos',
]);

// Exported so the legacy wrong-domain guard and this arbitration stay in sync.
export const ROLE_TITLE_NAME_PATTERNS: RegExp[] = [
  /\b(technician|engineer|manager|operator|developer|analyst)\b/i,
  /\b(agent|specialist|coordinator|consultant|architect|scientist|intern|supervisor|administrator|director)$/i,
];

/**
 * Provenance that names a distinct third person ("a guy named…", "her name
 * is…") rescues a role title from work-role arbitration. First-person context
 * ("I work as…", "my job") does NOT — that is evidence the phrase is the
 * user's own work role, which is exactly what must not become a Character.
 */
const ROLE_NAMES_A_PERSON =
  /\b(named|his name|her name|their name|guy named|girl named|met (him|her)|introduced (me|us) to)\b/i;

const EVENT_NAME_PATTERN =
  /\b(prom|fest|festival|concert|expo|rave|gala|showcase|show)\b/i;

const TOOL_PROVENANCE = /\b(tool|software|app|cli|ide|terminal|coding|installed?|api|sdk|version)\b/i;
const MEDIA_PROVENANCE = /\b(anime|manga|fandom|series|episode|season|film|movie|franchise|binge[- ]?watch\w*|watch(ed|ing)?)\b/i;
const BAND_PROVENANCE = /\b(band|gig|album|setlist|set list|on stage|opened for|toured?|ska|cumbia|punk rock)\b/i;
const EVENT_PROVENANCE = /\b(event|show|festival|prom|concert|performed|hosted|attended|venue|lineup|tickets?)\b/i;

/**
 * Name-level (strong) arbitration: the phrase itself identifies a non-person
 * domain. Runs before everything else in the audit — Character loses.
 */
export function arbitrateDomainStrong(
  name: string,
  provenanceText = '',
): DomainArbitrationResult {
  const key = normalizePersonNameKey(name);
  if (!key) return NO_MATCH;

  if (PROCESS_PHRASE_KEYS.has(key)) {
    return {
      domain: 'process',
      strength: 'strong',
      reason: `"${name}" is a work/onboarding process, not a person`,
    };
  }

  if (TOOL_NAME_KEYS.has(key)) {
    return {
      domain: 'tool',
      strength: 'strong',
      reason: `"${name}" is a software tool, not a person`,
    };
  }

  if (MEDIA_TITLE_KEYS.has(key)) {
    return {
      domain: 'media',
      strength: 'strong',
      reason: `"${name}" is a media/fandom title, not a person`,
    };
  }

  if (/^(los|las)\s+\S+/i.test(key) && !SPANISH_ARTICLE_PLACES.has(key)) {
    return {
      domain: 'band',
      strength: 'strong',
      reason: `"${name}" follows band/group naming (Los/Las …), not a person`,
    };
  }
  if (/^the\s+\w+s$/i.test(key) && BAND_PROVENANCE.test(provenanceText)) {
    return {
      domain: 'band',
      strength: 'strong',
      reason: `"${name}" is a band/group per its story context`,
    };
  }

  if (
    ROLE_TITLE_NAME_PATTERNS.some((re) => re.test(name)) &&
    !ROLE_NAMES_A_PERSON.test(provenanceText)
  ) {
    return {
      domain: 'role',
      strength: 'strong',
      reason: `"${name}" is a role/occupation title — belongs on a work role, not a Character card`,
    };
  }

  if (EVENT_NAME_PATTERN.test(key)) {
    return {
      domain: 'event',
      strength: 'strong',
      reason: `"${name}" names an event/show, not a person`,
    };
  }

  return NO_MATCH;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Apposition beats bag-of-words: provenance like `the "Self Made" show` names
 * the domain right next to the phrase, so it wins over other domain keywords
 * that merely appear elsewhere in the same story ("…that the band X threw").
 */
function nameAdjacentDomain(
  name: string,
  provenanceText: string,
): ArbitrationDomain | null {
  const esc = escapeRegExp(name.trim());
  if (!esc) return null;
  const quotes = `["'\\u201C\\u201D\\u2018\\u2019]*`;
  const eventAfter = new RegExp(
    `${esc}${quotes}\\s+(show|event|festival|concert|party|night|prom)\\b`,
    'i',
  );
  if (eventAfter.test(provenanceText)) return 'event';
  const bandNear = new RegExp(
    `(band|group|act)\\s+${quotes}${esc}|${esc}${quotes}\\s+(band|played|performed)\\b`,
    'i',
  );
  if (bandNear.test(provenanceText)) return 'band';
  const mediaAfter = new RegExp(`${esc}${quotes}\\s+(anime|manga|series|movie|film|fan)\\b`, 'i');
  if (mediaAfter.test(provenanceText)) return 'media';
  return null;
}

/**
 * Provenance-level (weak) arbitration. Only consulted after the human-likeness
 * name checks failed — a real person's card must not be re-routed just because
 * their story context mentions a band or a show.
 */
export function arbitrateDomainWeak(
  name: string,
  provenanceText = '',
): DomainArbitrationResult {
  if (!provenanceText.trim()) return NO_MATCH;

  const adjacent = nameAdjacentDomain(name, provenanceText);
  if (adjacent) {
    return {
      domain: adjacent,
      strength: 'weak',
      reason: `"${name}" is named as ${adjacent === 'media' ? 'a media title' : adjacent === 'event' ? 'an event' : 'a band'} in its own story context, not as a person`,
    };
  }

  if (TOOL_PROVENANCE.test(provenanceText)) {
    return { domain: 'tool', strength: 'weak', reason: `"${name}" appears in tool/software context, not as a person` };
  }
  if (MEDIA_PROVENANCE.test(provenanceText)) {
    return { domain: 'media', strength: 'weak', reason: `"${name}" appears in media/fandom context, not as a person` };
  }
  if (BAND_PROVENANCE.test(provenanceText)) {
    return { domain: 'band', strength: 'weak', reason: `"${name}" appears in band/music-act context, not as a person` };
  }
  if (EVENT_PROVENANCE.test(provenanceText)) {
    return { domain: 'event', strength: 'weak', reason: `"${name}" appears in event/show context, not as a person` };
  }
  return NO_MATCH;
}

// ── Human-likeness gate ──────────────────────────────────────────────────────

/**
 * Common English words that show up capitalized in extracted titles. A phrase
 * made only of these is title-shaped, not name-shaped ("Self Made",
 * "Background Check", "One Piece").
 */
const COMMON_TITLE_WORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with',
  'from', 'by', 'up', 'out', 'off', 'over', 'under', 'about',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'self', 'made', 'make', 'making', 'check', 'checks', 'background', 'piece',
  'pieces', 'code', 'coding', 'work', 'working', 'life', 'live', 'living',
  'love', 'story', 'stories', 'time', 'times', 'day', 'days', 'night',
  'nights', 'new', 'old', 'big', 'small', 'good', 'bad', 'best', 'first',
  'last', 'next', 'real', 'true', 'free', 'high', 'low', 'long', 'short',
  'hard', 'soft', 'right', 'left', 'also', 'you', 'me', 'we', 'they',
  'thing', 'things', 'stuff', 'plan', 'plans', 'goal', 'goals', 'idea',
  'ideas', 'note', 'notes', 'list', 'lists', 'call', 'calls', 'talk',
  'meeting', 'meetings', 'review', 'reviews', 'process', 'status', 'update',
  'updates', 'report', 'reports', 'project', 'projects', 'task', 'tasks',
  'home', 'house', 'place', 'places', 'world', 'money', 'game', 'games',
  'music', 'sound', 'sounds', 'art', 'show', 'shows', 'event', 'events',
  'quality', 'assurance', 'still', 'never', 'always', 'more', 'less', 'own',
]);

const HONORIFIC_NAME_PATTERN =
  /^(mr|mrs|ms|miss|dr|prof|sir|don|do[nñ]a|t[ií]o|t[ií]a|se[nñ]or|se[nñ]ora)\.?\s+\S+/i;

/** Person evidence in provenance — third-person narrative about a human. */
const PERSON_PROVENANCE =
  /\b(met|friend|cousin|brother|sister|mom|dad|mother|father|uncle|aunt|grandma|grandpa|dated?|dating|married|boyfriend|girlfriend|partner|talked (to|with)|hung out|he|she|him|her|his|hers)\b/i;

/** Public figure / artist evidence — a named human even if never met. */
const PUBLIC_FIGURE_PROVENANCE =
  /\b(artist|singer|musician|actor|actress|author|writer|rapper|producer|celebrity|famous|public figure|influencer|athlete)\b/i;

/**
 * Name-level human-likeness: does the phrase itself look like a person's
 * name? Passes when at least one token is a distinctive (non-dictionary)
 * name-shaped word — "Bill Skasby" passes on "Skasby"; "Self Made",
 * "Background Check", and "One Piece" have no such token and fail.
 */
export function hasPersonNameShape(name: string): boolean {
  if (HONORIFIC_NAME_PATTERN.test(name.trim())) return true;

  const tokens = normalizePersonNameKey(name).split(' ').filter(Boolean);
  if (tokens.length === 0 || tokens.length > 4) return false;

  return tokens.some(
    (t) =>
      t.length >= 3 &&
      /^[a-zà-ÿ'’-]+$/i.test(t) &&
      !COMMON_TITLE_WORDS.has(t) &&
      !PRONOUN_TOKENS.has(t) &&
      !CONNECTIVE_TOKENS.has(t),
  );
}

export function hasPersonProvenanceEvidence(provenanceText: string): boolean {
  if (!provenanceText.trim()) return false;
  return (
    PERSON_PROVENANCE.test(provenanceText) ||
    PUBLIC_FIGURE_PROVENANCE.test(provenanceText)
  );
}
