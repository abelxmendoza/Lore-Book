/**
 * Shared pollution filters for People / Places / Actors / Recent-mentions chrome.
 *
 * Write-path gates (stageContract, characterRegistry) should reject most of these
 * before persistence. These helpers scrub threadMeta merges, episode titles, and
 * display rematch so already-polluted rows stop resurfacing in chat UI.
 */

import { isInvalidPersonName } from '@lorebook/api-contracts';
import { normalizeDuplicateKey, normalizeNameKey } from '../../utils/nameNormalization';
import { classifyMentionKind } from '../../utils/entityMentionClassifier';
import { arbitrateDomainStrong } from '../characters/audit/characterIdentityGate';
import { classifyActorLabel, mayPromoteToCharacter } from './actorLabelPolicy';

/** Persona / pipeline role words that extractors treat as people. */
const PERSONA_ROLE_KEYS = new Set([
  'therapist',
  'archivist',
  'narrator',
  'assistant',
  'system',
]);

/** Non-place temporal / meta labels that leak into Places. */
const PLACE_JUNK_KEYS = new Set([
  'current event',
  'this weekend',
  'this week',
  'last weekend',
  'memorial day',
  'memorial day weekend',
  'today',
  'yesterday',
  'tonight',
  'tomorrow',
]);

const DATE_LABEL_RE =
  /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?$/i;

const SENTENCE_PRONOUN_BLEED_RE = /[.!?]\s*(?:he|she|they|we|i|it)\b/i;
const PERSON_COLLECTIVE_RE =
  /\b(?:clubs?|communities|scenes?|majors?|students?|departments?|classes|programs?)$/i;
const ACADEMIC_SUBJECT_RE =
  /^(?:computer science|software engineering|electrical engineering|mechanical engineering|data science|mathematics|psychology|biology|chemistry)$/i;
const APP_SURFACE_OR_CONTRACTION_RE = /^(?:relationships?|i['’]?ve)$/i;

/** Keep a valid leading name when an extractor leaks the next sentence. */
export function sanitizePersonLabel(name: string): string {
  return name
    .replace(/^(?:yeah|yes|okay|ok|well)\s+/i, '')
    .replace(/[.!?]\s*(?:he|she|they|we|i|it)\b.*$/i, '')
    .trim();
}

/**
 * True when a candidate person label must not appear on People / Actors /
 * Recent mentions (and must not be used in episode participant titles).
 */
export function isPollutingPersonLabel(name: string | null | undefined): boolean {
  if (name == null || !String(name).trim()) return true;
  const trimmed = String(name).trim();
  const key = normalizeNameKey(trimmed);

  if (PERSONA_ROLE_KEYS.has(key)) return true;
  if (DATE_LABEL_RE.test(trimmed)) return true;
  if (SENTENCE_PRONOUN_BLEED_RE.test(trimmed)) return true;
  // Keep a named person with an appositive origin (for example,
  // "Neon Pixie from the Underground Scene"). The trailing collective is
  // context for the person, not the candidate itself.
  if (PERSON_COLLECTIVE_RE.test(trimmed) && !/\bfrom\s+(?:the\s+)?[^,]+$/i.test(trimmed)) {
    return true;
  }
  if (ACADEMIC_SUBJECT_RE.test(trimmed)) return true;
  if (APP_SURFACE_OR_CONTRACTION_RE.test(trimmed)) return true;

  const actor = classifyActorLabel(trimmed);
  if (actor.action === 'reject' || actor.action === 'group' || actor.action === 'anonymous') {
    return true;
  }
  if (!mayPromoteToCharacter(trimmed)) return true;

  const invalid = isInvalidPersonName(trimmed);
  if (invalid.invalid) return true;

  const mention = classifyMentionKind(trimmed);
  if (mention.kind !== 'person' && mention.kind !== 'unknown') return true;

  const domain = arbitrateDomainStrong(trimmed);
  if (domain.domain === 'tool' || domain.domain === 'media' || domain.domain === 'process') {
    return true;
  }

  return false;
}

/** True when a place label is temporal/meta junk (not a real location). */
export function isPollutingPlaceLabel(name: string | null | undefined): boolean {
  if (name == null || !String(name).trim()) return true;
  const trimmed = String(name).trim();
  const key = normalizeNameKey(trimmed);
  if (PLACE_JUNK_KEYS.has(key)) return true;
  if (DATE_LABEL_RE.test(trimmed)) return true;
  if (ACADEMIC_SUBJECT_RE.test(trimmed)) return true;
  if (/^(?:mma|bjj|muay thai|boxing|kickboxing|martial arts)$/i.test(trimmed)) return true;
  if (/^(?:this|last|next)\s+(?:weekend|week|month|year|morning|afternoon|evening|night)$/i.test(key)) {
    return true;
  }
  if (/^(?:my|his|her|their|our)\s+(?:house|home|place|room|apartment|pad)$/i.test(key)) {
    return true;
  }
  // Tools / games / holidays must never land in Places either.
  const mention = classifyMentionKind(trimmed);
  if (['holiday', 'game', 'fragment', 'common_noun'].includes(mention.kind)) return true;
  const domain = arbitrateDomainStrong(trimmed);
  if (domain.domain === 'tool' || domain.domain === 'media' || domain.domain === 'process') {
    return true;
  }
  return false;
}

/**
 * Prefer the spelling that keeps apostrophes / diacritics when collapsing
 * duplicate keys ("Abuela's house" beats "Abuelas House").
 */
function preferCanonicalSpelling(a: string, b: string): string {
  const aScore =
    (a.includes("'") || a.includes('’') ? 2 : 0) +
    (/[À-ÿ]/.test(a) ? 1 : 0) +
    a.length / 100;
  const bScore =
    (b.includes("'") || b.includes('’') ? 2 : 0) +
    (/[À-ÿ]/.test(b) ? 1 : 0) +
    b.length / 100;
  return aScore >= bScore ? a : b;
}

/**
 * Union + dedupe by {@link normalizeDuplicateKey}, dropping polluting labels.
 * Caps the tail of the list (most recent wins when over cap).
 */
export function unionThreadMetaLabels(
  existing: string[],
  add: string[] | undefined,
  opts: {
    kind: 'people' | 'places';
    cap?: number;
  },
): string[] {
  const cap = opts.cap ?? 50;
  const isJunk =
    opts.kind === 'people' ? isPollutingPersonLabel : isPollutingPlaceLabel;

  const byKey = new Map<string, string>();
  const order: string[] = [];

  const consider = (raw: string) => {
    const rawTrimmed = raw?.trim();
    const trimmed = opts.kind === 'people' && rawTrimmed
      ? sanitizePersonLabel(rawTrimmed)
      : rawTrimmed;
    if (!trimmed || isJunk(trimmed)) return;
    const key = normalizeDuplicateKey(trimmed);
    if (!key) return;
    const prev = byKey.get(key);
    if (prev) {
      byKey.set(key, preferCanonicalSpelling(prev, trimmed));
      return;
    }
    byKey.set(key, trimmed);
    order.push(key);
  };

  for (const x of existing) consider(x);
  if (add) for (const x of add) consider(x);

  const kept = order.map((k) => byKey.get(k)!).filter(Boolean);
  return kept.slice(-cap);
}

/**
 * Canonical PERSON outranks a conflicting local PLACE proposal for the same
 * surface string. Summaries and chip lists must not show Shyla as both.
 */
export function applyCanonicalEntityTypeAuthority(
  people: string[],
  places: string[],
): { people: string[]; places: string[] } {
  const personKeys = new Set(
    people.map((name) => normalizeDuplicateKey(name)).filter(Boolean),
  );
  return {
    people,
    places: places.filter((place) => !personKeys.has(normalizeDuplicateKey(place))),
  };
}

/** Filter episode participant display names before composing titles. */
export function filterEpisodeParticipantNames(names: Array<string | null | undefined>): string[] {
  return names
    .map((n) => (n == null ? '' : sanitizePersonLabel(String(n).trim())))
    .filter((n) => n.length > 0 && !isPollutingPersonLabel(n));
}
