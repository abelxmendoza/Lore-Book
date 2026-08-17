/**
 * How this person relates to the user (you) — distinct from factual Role
 * (occupation) and Archetype (story category). Detected from chat; manually editable.
 */

export const RELATIONSHIP_TO_YOU_OPTIONS = [
  { value: 'friend', label: 'Friend' },
  { value: 'close_friend', label: 'Close friend' },
  { value: 'best_friend', label: 'Best friend' },
  { value: 'acquaintance', label: 'Acquaintance' },
  { value: 'coworker', label: 'Coworker' },
  { value: 'colleague', label: 'Colleague' },
  { value: 'classmate', label: 'Classmate' },
  { value: 'roommate', label: 'Roommate' },
  { value: 'neighbor', label: 'Neighbor' },
  { value: 'mentor', label: 'Mentor' },
  { value: 'boss', label: 'Boss / manager' },
  { value: 'bandmate', label: 'Bandmate' },
  { value: 'collaborator', label: 'Collaborator' },
  { value: 'family', label: 'Family' },
  { value: 'parent', label: 'Parent' },
  { value: 'mother', label: 'Mom / mother' },
  { value: 'father', label: 'Dad / father' },
  { value: 'step_parent', label: 'Step-parent' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'cousin', label: 'Cousin' },
  { value: 'aunt', label: 'Aunt / tía' },
  { value: 'uncle', label: 'Uncle / tío' },
  { value: 'child', label: 'Child' },
  { value: 'son', label: 'Son' },
  { value: 'daughter', label: 'Daughter' },
  { value: 'grandmother', label: 'Grandmother' },
  { value: 'grandfather', label: 'Grandfather' },
  { value: 'grandson', label: 'Grandson' },
  { value: 'granddaughter', label: 'Granddaughter' },
  { value: 'grandchild', label: 'Grandchild' },
  { value: 'niece', label: 'Niece' },
  { value: 'nephew', label: 'Nephew' },
  { value: 'partner', label: 'Partner' },
  { value: 'girlfriend', label: 'Girlfriend' },
  { value: 'boyfriend', label: 'Boyfriend' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'dating', label: 'Dating' },
  { value: 'crush', label: 'Crush' },
  { value: 'ex', label: 'Ex' },
  { value: 'situationship', label: 'Seeing each other' },
  { value: 'rival', label: 'Rival' },
  { value: 'enemy', label: 'Enemy' },
  { value: 'public_figure', label: 'Public figure' },
] as const;

export type RelationshipToYouValue = (typeof RELATIONSHIP_TO_YOU_OPTIONS)[number]['value'];

/** "Relationship to you" values whose meaning is already owned by a typed
 *  Family Tree kinship edge (e.g. "cousin_of"). Setting one of these when a
 *  typed kinship edge already exists must not create a second, untyped
 *  character_relationships row for the same pair — the kinship edge stays
 *  authoritative and metadata.relationship_to_user alone carries the label. */
const KINSHIP_SHAPED_VALUES = new Set<string>([
  'family', 'parent', 'mother', 'father', 'step_parent', 'sibling', 'cousin',
  'aunt', 'uncle', 'child', 'son', 'daughter', 'grandmother', 'grandfather',
  'grandson', 'granddaughter', 'grandchild', 'niece', 'nephew',
]);

export function isKinshipShapedRelationshipToYou(value: string): boolean {
  return KINSHIP_SHAPED_VALUES.has(normalizeRelKey(value));
}

export type RelationshipToYouSignal = {
  character_name?: string | null;
  relationship_type?: string | null;
  status?: string | null;
};

function normalizeRelKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function isSelfSideName(name?: string | null): boolean {
  return /^(you|me)$/i.test(String(name ?? '').trim());
}

/**
 * Prefer explicit user field, then You-link from chat, then romantic type, then kinship label.
 */
export function resolveRelationshipToYou(input: {
  metadata?: Record<string, unknown> | null;
  relationships?: RelationshipToYouSignal[] | null;
  romanticType?: string | null;
}): { value: string; source: unknown } {
  const meta = input.metadata ?? {};
  const stored =
    typeof meta.relationship_to_user === 'string' ? meta.relationship_to_user.trim() : '';
  if (stored) {
    return { value: normalizeRelKey(stored), source: meta.relationship_to_user_source };
  }

  const youLink = (input.relationships ?? []).find((rel) => isSelfSideName(rel.character_name));
  if (youLink?.relationship_type?.trim()) {
    return {
      value: normalizeToYouValue(youLink.relationship_type),
      source: youLink.status === 'inferred' ? 'auto' : 'chat',
    };
  }

  const romantic = input.romanticType?.trim();
  if (romantic) {
    return { value: normalizeToYouValue(romantic), source: 'chat' };
  }

  const kinship =
    typeof meta.kinship_label === 'string' ? meta.kinship_label.trim() : '';
  if (kinship) {
    return { value: normalizeToYouValue(kinship), source: 'chat' };
  }

  return { value: '', source: undefined };
}

/** Map surface labels ("Cousin", "cousin_of") onto Relationship-to-you option keys. */
export function normalizeToYouValue(raw: string): string {
  const key = normalizeRelKey(raw);
  if (!key) return '';
  const withoutOf = key.replace(/_of$/, '');
  if (RELATIONSHIP_TO_YOU_OPTIONS.some((o) => o.value === withoutOf)) return withoutOf;
  if (RELATIONSHIP_TO_YOU_OPTIONS.some((o) => o.value === key)) return key;
  if (withoutOf === 'stepmother' || withoutOf === 'stepfather' || withoutOf === 'stepdad' || withoutOf === 'stepmom') {
    return 'step_parent';
  }
  if (withoutOf === 'brother' || withoutOf === 'sister' || withoutOf === 'hermano' || withoutOf === 'hermana') {
    return 'sibling';
  }
  if (withoutOf === 'mom' || withoutOf === 'mama' || withoutOf === 'mamá') return 'mother';
  if (withoutOf === 'dad' || withoutOf === 'papa' || withoutOf === 'papá') return 'father';
  if (withoutOf === 'tio' || withoutOf === 'tío') return 'uncle';
  if (withoutOf === 'tia' || withoutOf === 'tía' || withoutOf === 'auntie') return 'aunt';
  if (withoutOf === 'nieto') return 'grandson';
  if (withoutOf === 'nieta') return 'granddaughter';
  if (withoutOf === 'abuela' || withoutOf === 'grandma') return 'grandmother';
  if (withoutOf === 'abuelo' || withoutOf === 'grandpa') return 'grandfather';
  return withoutOf || key;
}

export function relationshipToYouLabel(value: string): string {
  const key = normalizeRelKey(value);
  const preset = RELATIONSHIP_TO_YOU_OPTIONS.find((o) => o.value === key);
  if (preset) return preset.label;
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Mirrors `romanticTypeMap` in apps/server/src/routes/relationships.ts (kept
 * in sync manually — no shared package between client/server). When a
 * "Relationship to you" value is synced into romantic_relationships via the
 * character-links route, the server remaps it to its romantic-book vocabulary
 * (e.g. partner -> dating, spouse -> lover, ex -> ex_lover). Callers comparing
 * a relationship-to-you value against a stored romantic relationship_type
 * must apply the same remap first, or semantically-identical values will
 * never compare equal.
 */
const ROMANTIC_TYPE_SERVER_REMAP: Record<string, string> = {
  romantic: 'dating',
  romantic_interest: 'crush',
  partner: 'dating',
  spouse: 'lover',
  ex: 'ex_lover',
  fiance: 'fiancé',
  fiancee: 'fiancée',
};

export function toRomanticRelationshipType(value: string): string {
  const key = normalizeRelKey(value);
  return ROMANTIC_TYPE_SERVER_REMAP[key] ?? value;
}
