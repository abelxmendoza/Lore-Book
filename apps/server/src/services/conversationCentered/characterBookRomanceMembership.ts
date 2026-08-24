/**
 * Character Book romance tabs → Dating & Romance membership.
 *
 * If a person is filed under Romantic / Exes / Married / Divorced / Co-parents
 * in Character Book, they belong on the Dating & Romance surface too.
 */

import { hasFamilySignal } from './datingEligibilityService';

export const CHARACTER_BOOK_ROMANCE_ARCHETYPES = new Set([
  'romantic',
  'crush',
  'unrequited_crush',
  'past_romantic',
  'romantic_interest',
  'one_night_stand',
]);

export type CharacterBookRomanceKind = 'current' | 'ex' | 'married' | 'divorced' | 'co_parent';

export type CharacterBookRomanceInput = {
  name?: string | null;
  alias?: string[] | null;
  role?: string | null;
  archetype?: string | null;
  tags?: string[] | null;
  metadata?: Record<string, unknown> | null;
  status?: string | null;
};

const MARRIED_TYPES = new Set(['wife', 'husband']);
const DIVORCED_TYPES = new Set(['divorced', 'ex_wife', 'ex_husband']);
const CO_PARENT_TYPES = new Set(['co_parent', 'baby_mama', 'baby_daddy']);

const EX_TEXT_RE =
  /\b(ex.?girlfriend|ex.?boyfriend|ex.?lover|ex.?partner|ex.?wife|ex.?husband|my ex\b|former (?:partner|girlfriend|boyfriend|lover)|broke up|breakup)\b/i;

function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
}

function archetypeList(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export function characterBookRomanceKind(
  character: CharacterBookRomanceInput,
): CharacterBookRomanceKind | null {
  if (character.status === 'archived' || character.status === 'pending_deletion' || character.status === 'reclassified') {
    return null;
  }

  const aliases = stringList(character.alias);
  const meta = character.metadata ?? {};
  const relationLabels = [
    character.role,
    character.archetype,
    typeof meta.relationship_to_user === 'string' ? meta.relationship_to_user : null,
    typeof meta.relationship_type === 'string' ? meta.relationship_type : null,
  ].filter((label): label is string => typeof label === 'string' && label.trim().length > 0);

  if (hasFamilySignal(character.name ?? '', relationLabels, aliases)) return null;

  const pinned = normalizeKey(meta.book_category);
  const relationshipType = normalizeKey(meta.relationship_type);
  const archetypes = archetypeList(character.archetype);
  const blob = [
    character.role,
    ...(character.tags ?? []),
    ...stringList(meta.categories),
    ...stringList(meta.confirmed_categories),
    typeof meta.summary === 'string' ? meta.summary : '',
  ].join(' ');

  if (MARRIED_TYPES.has(relationshipType) || pinned === 'married') return 'married';
  if (DIVORCED_TYPES.has(relationshipType)) return 'divorced';
  if (CO_PARENT_TYPES.has(relationshipType)) return 'co_parent';
  if (
    relationshipType.startsWith('ex_')
    || relationshipType === 'ex'
    || archetypes.includes('past_romantic')
    || EX_TEXT_RE.test(blob)
  ) {
    return 'ex';
  }
  if (pinned === 'romantic') return 'current';
  if (archetypes.some((item) => CHARACTER_BOOK_ROMANCE_ARCHETYPES.has(item))) {
    return 'current';
  }
  if (/\b(girlfriend|boyfriend|dating|crush|situationship|romantic|lover|partner)\b/i.test(relationshipType.replace(/_/g, ' '))) {
    return 'current';
  }
  return null;
}

export function belongsOnDatingSurface(character: CharacterBookRomanceInput): boolean {
  return characterBookRomanceKind(character) != null;
}

export function datingRowDefaultsForRomanceKind(kind: CharacterBookRomanceKind): {
  relationship_type: string;
  status: string;
  is_current: boolean;
} {
  switch (kind) {
    case 'married':
      return { relationship_type: 'wife', status: 'active', is_current: true };
    case 'divorced':
      return { relationship_type: 'divorced', status: 'ended', is_current: false };
    case 'co_parent':
      return { relationship_type: 'co_parent', status: 'active', is_current: true };
    case 'ex':
      return { relationship_type: 'ex_lover', status: 'ended', is_current: false };
    default:
      return { relationship_type: 'dating', status: 'active', is_current: true };
  }
}
