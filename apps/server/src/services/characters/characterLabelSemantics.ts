/**
 * Classify character labels and resolve the head person before duplicate
 * comparison. Relational / spatial descriptors must not flatten referenced
 * people into aliases.
 */

import {
  isRelationalPlaceholder,
  normalizeForMatching,
  parseCharacterName,
  parseRelationalPlaceholder,
  type NameProfile,
  type RelationalPlaceholder,
} from '../../utils/characterNameMatching';
import type { CharacterLabelClass } from './characterNameEvidence';

export type SpatialOrEventDescriptor = {
  /** Person the card is actually about. */
  head: string;
  /** Person mentioned only for context (must not become an alias). */
  referencedPerson: string | null;
  /** Free-text context (desk, venue, etc.). */
  context: string | null;
};

export type ClassifiedCharacterLabel = {
  raw: string;
  labelClass: CharacterLabelClass;
  headPerson: string | null;
  referencedPeople: string[];
  associatedPlace: string | null;
  relational: RelationalPlaceholder | null;
  spatial: SpatialOrEventDescriptor | null;
  kinshipRole: string | null;
  coreName: string;
};

const SPATIAL_RE =
  /^(.+?)\s+(?:next to|beside|near|by|across from)\s+(.+)$/i;

const FROM_PLACE_RE = /\s+from\s+(.+)$/i;

/**
 * "Hassan Next to Khalil's Desk" → head Hassan, referenced Khalil, context desk.
 */
export function parseSpatialOrEventDescriptor(name: string): SpatialOrEventDescriptor | null {
  const cleaned = (name ?? '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const m = cleaned.match(SPATIAL_RE);
  if (!m) return null;
  const head = m[1].trim();
  let rest = m[2].trim();
  if (!head || !rest) return null;
  // Avoid treating kinship titles alone as spatial heads.
  if (/^(?:tio|tia|uncle|aunt|mom|dad)\b/i.test(head) && head.split(/\s+/).length === 1) {
    return null;
  }

  let referencedPerson: string | null = null;
  let context: string | null = null;
  const poss = rest.match(/^(.+?)['’]s\s+(.+)$/i);
  if (poss) {
    referencedPerson = poss[1].trim();
    context = poss[2].trim();
  } else {
    // "Khalil Desk" / bare place — keep as context only.
    context = rest;
    const maybePerson = rest.match(/^([A-ZÀ-Ý][a-zà-ÿ]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ]+)?)\b/);
    if (maybePerson && !/\b(?:desk|office|station|table|booth|bar)\b/i.test(maybePerson[1])) {
      referencedPerson = maybePerson[1];
    }
  }

  return { head, referencedPerson, context };
}

/**
 * Extend relational parse for "Shyla's Friend from Bad Dogg Compound".
 */
export function parseRelationalDescriptorWithPlace(name: string): {
  relational: RelationalPlaceholder;
  place: string | null;
} | null {
  const cleaned = (name ?? '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;

  const placeMatch = cleaned.match(FROM_PLACE_RE);
  const withoutPlace = placeMatch ? cleaned.slice(0, placeMatch.index).trim() : cleaned;
  const place = placeMatch?.[1]?.trim() ?? null;

  const relational = parseRelationalPlaceholder(withoutPlace);
  if (!relational) return null;
  return { relational, place };
}

export function classifyCharacterLabel(
  name: string,
  opts?: { aliases?: string[] | null; nameProfile?: NameProfile | null },
): ClassifiedCharacterLabel {
  const raw = (name ?? '').replace(/\s+/g, ' ').trim();
  const parsed = parseCharacterName(raw);
  const withPlace = parseRelationalDescriptorWithPlace(raw);
  const spatial = parseSpatialOrEventDescriptor(raw);

  if (withPlace) {
    return {
      raw,
      labelClass: 'RELATIONAL_PERSON_DESCRIPTOR',
      headPerson: null,
      referencedPeople: [withPlace.relational.anchor],
      associatedPlace: withPlace.place,
      relational: withPlace.relational,
      spatial: null,
      kinshipRole: parsed.kinshipRole,
      coreName: parsed.coreName,
    };
  }

  if (isRelationalPlaceholder(raw)) {
    const relational = parseRelationalPlaceholder(raw)!;
    return {
      raw,
      labelClass: 'RELATIONAL_PERSON_DESCRIPTOR',
      headPerson: null,
      referencedPeople: [relational.anchor],
      associatedPlace: null,
      relational,
      spatial: null,
      kinshipRole: parsed.kinshipRole,
      coreName: parsed.coreName,
    };
  }

  if (spatial) {
    return {
      raw,
      labelClass: 'SPATIAL_OR_EVENT_DESCRIPTOR',
      headPerson: spatial.head,
      referencedPeople: spatial.referencedPerson ? [spatial.referencedPerson] : [],
      associatedPlace: spatial.context,
      relational: null,
      spatial,
      kinshipRole: parsed.kinshipRole,
      coreName: normalizeForMatching(spatial.head),
    };
  }

  const profile = opts?.nameProfile;
  const hasSceneAlias =
    Boolean(profile?.nickname?.trim()) ||
    (opts?.aliases ?? []).some(
      (a) => a && normalizeForMatching(a) !== parsed.coreName && a.split(/\s+/).length === 1,
    );

  if (parsed.kinshipRole && parsed.coreName) {
    return {
      raw,
      labelClass: 'NAMED_PERSON',
      headPerson: raw,
      referencedPeople: [],
      associatedPlace: null,
      relational: null,
      spatial: null,
      kinshipRole: parsed.kinshipRole,
      coreName: parsed.coreName,
    };
  }

  if (hasSceneAlias || (profile?.nickname && profile?.givenName)) {
    return {
      raw,
      labelClass: 'NAMED_PERSON_WITH_ALIAS',
      headPerson: raw,
      referencedPeople: [],
      associatedPlace: null,
      relational: null,
      spatial: null,
      kinshipRole: parsed.kinshipRole,
      coreName: parsed.coreName,
    };
  }

  if (!parsed.coreName || parsed.coreName.split(/\s+/).length === 0) {
    return {
      raw,
      labelClass: 'AMBIGUOUS_MENTION',
      headPerson: raw || null,
      referencedPeople: [],
      associatedPlace: null,
      relational: null,
      spatial: null,
      kinshipRole: parsed.kinshipRole,
      coreName: parsed.coreName,
    };
  }

  return {
    raw,
    labelClass: 'NAMED_PERSON',
    headPerson: raw,
    referencedPeople: [],
    associatedPlace: null,
    relational: null,
    spatial: null,
    kinshipRole: parsed.kinshipRole,
    coreName: parsed.coreName,
  };
}
