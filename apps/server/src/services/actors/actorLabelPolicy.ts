/**
 * Actor label policy — shared rules for Cast/Actors quality.
 *
 * LoreBook is a memory retrieval system. Vague noun phrases ("one girl",
 * "people in the scene") must never become PERSON characters. Groups and
 * anonymous individuals need context-aware labels that still make sense
 * months later.
 */

import {
  isCollectivePersonName,
  normalizePersonNameKey,
} from '../../utils/personNameValidation';

export type ActorType =
  | 'PERSON'
  | 'GROUP'
  | 'ORGANIZATION'
  | 'COMMUNITY'
  | 'ANONYMOUS_PERSON';

export type ActorLabelAction = 'reject' | 'group' | 'anonymous' | 'person';

export type ActorLabelClassification = {
  actorType: ActorType;
  action: ActorLabelAction;
  reason?: string;
};

/** Exact bare generics (role words without context). */
export const BARE_GENERIC_EXACT = new Set([
  'guy',
  'girl',
  'man',
  'woman',
  'person',
  'someone',
  'somebody',
  'everyone',
  'everybody',
  'nobody',
  'anybody',
  'anyone',
  'friend',
  'best friend',
  'cousin',
  'professor',
  'recruiter',
  'investor',
  'promoter',
  'coworker',
  'coworkers',
  'co-worker',
  'co-workers',
  'manager',
  'boss',
  'neighbor',
  'homie',
  'new guy',
  'the new guy',
  'old roommate',
  'old college roommate',
  'roommate',
  'tio',
  'tia',
  'tía',
  'tío',
  'mr',
  'dr',
  'coach',
  'people',
  'folks',
  'guys',
  'girls',
  'boys',
  'friends',
  'organizers',
  'attendees',
  'fans',
  'users',
  'community',
  'egirls',
  'e-girls',
  'egirl',
  'e-girl',
]);

/** Self / narrator labels that must never appear on the Actors bar. */
const SELF_LABELS = new Set([
  'you',
  'also you',
  'me',
  'myself',
  'i',
  'the user',
  'user',
  'narrator',
  'author',
  'self',
]);

/** Indefinite person references — no entity. */
const INDEFINITE_PERSON_RE =
  /^(?:(?:a|an|one|some|that|this|the)\s+)?(?:girl|guy|man|woman|person|dude|lady|kid|boy)s?$/i;

/** Vague collective / crowd phrases without role context. */
const VAGUE_COLLECTIVE_RE =
  /^(?:(?:the|some|other|those|these|my|our)\s+)?(?:other\s+)?(?:girls|guys|people|folks|friends|coworkers|co-workers|organizers|attendees|fans|users|boys|kids|egirls|e-girls)(?:\s+in\s+the\s+scene)?$/i;

const PEOPLE_IN_SCENE_RE =
  /^(?:(?:the|some|other|those|these)\s+)?(?:people|folks|girls|guys|fans|egirls|e-girls)(?:\s+in\s+the\s+(?:scene|crowd|room|chat|comments?))?$/i;

/** Truncated span extraction: "people in" / "people in the" without the rest of the phrase. */
const TRUNCATED_COLLECTIVE_RE =
  /^(?:(?:the|some|other|those|these)\s+)?(?:people|folks|girls|guys|fans|egirls|e-girls)\s+in(?:\s+the)?$/i;

const POPULAR_CATEGORY_RE =
  /^(?:popular\s+)?(?:egirls?|e-girls?|influencers?|creators?)$/i;

/**
 * Cues that a label has enough narrative context for future recall.
 * Note: bare `\bin\b` is NOT a cue — it caused "people in" to bypass vague-scene rejection.
 */
const CONTEXT_CUE_RE =
  /\b(?:who|that|from|with|at|during|about|discussing|repost(?:ed|ing)?|amplif(?:y|ied|ying)|attend(?:ed|ing)|comment(?:ed|ing)|interview(?:ed|ing)?|panel|teammates?|classmates?|incident|allegations?|controversy|afters?|afterparty|beta\s*testers?|in the (?:scene|crowd|room|chat|comments?))\b/i;

const ANONYMOUS_PREFIX_RE =
  /^anonymous\s+(?:woman|man|person|girl|guy|attendee|commenter|interviewer|recruiter|coworker)\b/i;

export function isSelfActorLabel(name: string | null | undefined): boolean {
  if (name == null || !String(name).trim()) return false;
  return SELF_LABELS.has(normalizePersonNameKey(String(name)));
}

/**
 * True when the label is a bare generic or indefinite phrase that cannot
 * become a PERSON without contextual enrichment.
 */
export function isVagueOrIndefiniteActorPhrase(name: string | null | undefined): boolean {
  if (name == null || !String(name).trim()) return true;
  const key = normalizePersonNameKey(String(name));
  if (!key) return true;
  if (BARE_GENERIC_EXACT.has(key)) return true;
  if (INDEFINITE_PERSON_RE.test(key)) return true;
  if (VAGUE_COLLECTIVE_RE.test(key)) return true;
  if (PEOPLE_IN_SCENE_RE.test(key)) return true;
  if (TRUNCATED_COLLECTIVE_RE.test(key)) return true;
  if (POPULAR_CATEGORY_RE.test(key)) return true;
  // "one girl", "this guy", "that woman" with nothing after
  if (/^(?:a|an|one|some|that|this)\s+(?:girl|guy|man|woman|person|dude|lady)\b$/i.test(key)) {
    return true;
  }
  // "other girls" / "other people" with no role clause
  if (/^other\s+(?:girls|guys|people|folks|friends|women|men)\b$/i.test(key)) {
    return true;
  }
  return false;
}

/**
 * Six-month recall check: does this label explain role-in-story?
 * Contextual labels with who/from/at/etc. pass; bare plurals fail.
 */
export function isVagueActorLabel(label: string | null | undefined): boolean {
  if (label == null || !String(label).trim()) return true;
  const trimmed = String(label).trim();
  if (isVagueOrIndefiniteActorPhrase(trimmed)) return true;
  if (ANONYMOUS_PREFIX_RE.test(trimmed) && CONTEXT_CUE_RE.test(trimmed)) return false;
  if (isCollectivePersonName(trimmed) && !CONTEXT_CUE_RE.test(trimmed)) return true;
  // Short collective-ish without cues
  const key = normalizePersonNameKey(trimmed);
  const tokens = key.split(' ').filter(Boolean);
  if (tokens.length <= 2 && !CONTEXT_CUE_RE.test(trimmed) && isCollectivePersonName(trimmed)) {
    return true;
  }
  return false;
}

export function classifyActorLabel(name: string | null | undefined): ActorLabelClassification {
  if (name == null || !String(name).trim()) {
    return { actorType: 'PERSON', action: 'reject', reason: 'empty' };
  }
  const trimmed = String(name).trim();

  if (isSelfActorLabel(trimmed)) {
    return { actorType: 'PERSON', action: 'reject', reason: 'self' };
  }

  // Truncated span extraction ("people in") — never a person or contextual group.
  if (TRUNCATED_COLLECTIVE_RE.test(normalizePersonNameKey(trimmed))) {
    return { actorType: 'GROUP', action: 'reject', reason: 'vague_scene' };
  }

  if (ANONYMOUS_PREFIX_RE.test(trimmed)) {
    if (isVagueActorLabel(trimmed) && !CONTEXT_CUE_RE.test(trimmed)) {
      return { actorType: 'ANONYMOUS_PERSON', action: 'reject', reason: 'anonymous_vague' };
    }
    return { actorType: 'ANONYMOUS_PERSON', action: 'anonymous', reason: 'anonymous_prefix' };
  }

  // Indefinite singular with no context → reject (not even anonymous)
  if (
    /^(?:a|an|one|some|that|this)\s+(?:girl|guy|man|woman|person|dude|lady)\b$/i.test(
      normalizePersonNameKey(trimmed)
    )
  ) {
    return { actorType: 'PERSON', action: 'reject', reason: 'indefinite_reference' };
  }

  if (BARE_GENERIC_EXACT.has(normalizePersonNameKey(trimmed))) {
    // Bare plurals / crowd words → group if we keep them; else reject for PERSON path
    if (isCollectivePersonName(trimmed) || /s$/.test(normalizePersonNameKey(trimmed))) {
      if (CONTEXT_CUE_RE.test(trimmed)) {
        return { actorType: 'GROUP', action: 'group', reason: 'contextual_collective' };
      }
      return { actorType: 'GROUP', action: 'reject', reason: 'bare_collective' };
    }
    return { actorType: 'PERSON', action: 'reject', reason: 'bare_generic' };
  }

  if (isCollectivePersonName(trimmed) || VAGUE_COLLECTIVE_RE.test(normalizePersonNameKey(trimmed))) {
    if (CONTEXT_CUE_RE.test(trimmed) && !isVagueOrIndefiniteActorPhrase(trimmed)) {
      // "other girls who reposted…" — good group
      if (/\b(?:scene|community|crowd)\b/i.test(trimmed)) {
        return { actorType: 'COMMUNITY', action: 'group', reason: 'contextual_community' };
      }
      return { actorType: 'GROUP', action: 'group', reason: 'contextual_collective' };
    }
    // Vague collective — reject for PERSON; callers may still show as GROUP if enriched
    if (isVagueOrIndefiniteActorPhrase(trimmed) || isVagueActorLabel(trimmed)) {
      return { actorType: 'GROUP', action: 'reject', reason: 'vague_collective' };
    }
    return { actorType: 'GROUP', action: 'group', reason: 'collective' };
  }

  if (POPULAR_CATEGORY_RE.test(normalizePersonNameKey(trimmed))) {
    return { actorType: 'GROUP', action: 'reject', reason: 'social_category' };
  }

  if (PEOPLE_IN_SCENE_RE.test(normalizePersonNameKey(trimmed))) {
    return { actorType: 'COMMUNITY', action: 'reject', reason: 'vague_scene' };
  }

  // Plural collective with role context mid-phrase (last token may be a place/topic).
  // e.g. "Other girls who reposted allegations on Instagram"
  const hasPluralCollective =
    /\b(?:girls|guys|people|folks|friends|coworkers|co-workers|organizers|attendees|fans|commenters|members|teammates|classmates|egirls|e-girls|women|men)\b/i.test(
      trimmed
    );
  if (hasPluralCollective && CONTEXT_CUE_RE.test(trimmed)) {
    if (/\b(?:scene|community|crowd)\b/i.test(trimmed)) {
      return { actorType: 'COMMUNITY', action: 'group', reason: 'contextual_community' };
    }
    return { actorType: 'GROUP', action: 'group', reason: 'contextual_collective_phrase' };
  }

  // Contextual anonymous-style nicknames without "Anonymous" prefix
  // e.g. "barista at Blue Bottle" — treat as anonymous person if no proper name shape
  const looksLikeProperName = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}$/.test(trimmed);
  if (!looksLikeProperName && CONTEXT_CUE_RE.test(trimmed) && !isCollectivePersonName(trimmed)) {
    // Singular role descriptors with context → anonymous individual (not Character Book)
    if (
      /\b(?:girl|guy|man|woman|person|barista|commenter|attendee|interviewer|recruiter)\b/i.test(
        trimmed
      ) &&
      !hasPluralCollective
    ) {
      return { actorType: 'ANONYMOUS_PERSON', action: 'anonymous', reason: 'contextual_unnamed' };
    }
  }

  return { actorType: 'PERSON', action: 'person', reason: 'named_or_identifiable' };
}

/**
 * Whether this label may be promoted to a Character Book PERSON card.
 */
export function mayPromoteToCharacter(name: string | null | undefined): boolean {
  const c = classifyActorLabel(name);
  return c.action === 'person' && c.actorType === 'PERSON';
}
