import type { Character } from '../components/characters/CharacterProfileCard';

export const BOOK_RELATIONSHIP_CATEGORIES = [
  'family',
  'friends',
  'romantic',
  'mentors',
  'professional',
  'creative',
  'exes',
  'enemies',
  'rivals',
  'estranged',
  'acquaintances',
] as const;

export type BookRelationshipCategory = (typeof BOOK_RELATIONSHIP_CATEGORIES)[number];

export const BOOK_CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'auto', label: 'Auto (let LoreBook decide)' },
  { value: 'family', label: 'Family' },
  { value: 'friends', label: 'Friends' },
  { value: 'romantic', label: 'Romantic' },
  { value: 'mentors', label: 'Mentors' },
  { value: 'professional', label: 'Professional' },
  { value: 'creative', label: 'Creative' },
  { value: 'exes', label: 'Exes' },
  { value: 'enemies', label: 'Enemies' },
  { value: 'rivals', label: 'Rivals' },
  { value: 'estranged', label: 'Estranged' },
  { value: 'acquaintances', label: 'Acquaintances' },
];

export const ROMANTIC_OR_CRUSH_ARCHETYPES = new Set([
  'romantic',
  'crush',
  'unrequited_crush',
  'romantic_interest',
  'past_romantic',
  'one_night_stand',
]);

const KIN_RELATIONSHIP_TYPES =
  /^(parent|mother|father|sibling|brother|sister|cousin|aunt|uncle|grand|step|niece|nephew|in_law)/;

const EXPLICIT_KIN_IN_TEXT =
  /\b(?:my|his|her|their|our)\s+(?:grandmother|grandfather|mom|dad|mother|father|sister|brother|cousin|aunt|uncle|grandma|grandpa|abuela|abuelo|t[ií]o|t[ií]a|family)\b/;

function normalizeSignalText(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase().replace(/[._@-]+/g, ' ').trim() : '';
}

export function displayNameHasFamilyTitle(name: string): boolean {
  const normalized = normalizeSignalText(name);
  return /^(?:my\s+)?(?:t[ií]o|t[ií]a|uncle|aunt|mom|mother|dad|father|grandma|grandpa|abuela|abuelo|cousin|sister|brother)(?:\s|$)/i.test(
    normalized,
  );
}

export function isFamilyExcluded(metadata?: Record<string, unknown> | null): boolean {
  const flag = metadata?.family_excluded as unknown;
  if (flag === true) return true;
  if (flag && typeof flag === 'object' && (flag as { value?: unknown }).value === true) return true;
  return false;
}

export function pinnedBookCategory(
  metadata?: Record<string, unknown> | null,
): BookRelationshipCategory | null {
  const source = String(metadata?.book_category_source ?? '').toLowerCase();
  if (source !== 'user' && source !== 'user_confirmed') return null;
  const value = String(metadata?.book_category ?? '').toLowerCase().trim();
  return (BOOK_RELATIONSHIP_CATEGORIES as readonly string[]).includes(value)
    ? (value as BookRelationshipCategory)
    : null;
}

export function bookCategoryLabel(value: string): string {
  return BOOK_CATEGORY_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function primaryArchetype(value?: string | null): string {
  return String(value ?? '')
    .split(',')[0]
    ?.trim()
    .toLowerCase() ?? '';
}

function hasExplicitKinPhrase(...values: unknown[]): boolean {
  return values.some((value) => {
    if (Array.isArray(value)) return value.some((item) => EXPLICIT_KIN_IN_TEXT.test(normalizeSignalText(item)));
    return EXPLICIT_KIN_IN_TEXT.test(normalizeSignalText(value));
  });
}

export function hasStrongFamilyEvidence(char: Pick<Character, 'name' | 'alias' | 'role' | 'summary' | 'tags' | 'context_of_mention' | 'metadata'>): boolean {
  const meta = char.metadata ?? {};
  const kinship = String(meta.kinship_label ?? meta.kinship_role ?? '').trim();
  if (kinship) return true;
  if (displayNameHasFamilyTitle(char.name)) return true;
  const relationshipType = String(meta.relationship_type ?? '').toLowerCase().trim();
  if (KIN_RELATIONSHIP_TYPES.test(relationshipType)) return true;
  const role = String(char.role ?? '').toLowerCase().trim();
  if (KIN_RELATIONSHIP_TYPES.test(role)) return true;
  const relationshipToYou = String(meta.relationship_to_user ?? '').toLowerCase().trim();
  if (KIN_RELATIONSHIP_TYPES.test(relationshipToYou)) return true;
  return hasExplicitKinPhrase(
    char.summary,
    char.role,
    char.context_of_mention,
    char.alias,
    char.tags,
  );
}

export type FamilyBookMatchInput = {
  hasDatingRow?: boolean;
  /** True when this character is a real card on the user's family tree. */
  onFamilyTree?: boolean;
};

export type FamilyBookDecision = {
  matches: boolean;
  reason: string;
};

export function decideFamilyBookMembership(
  char: Pick<Character, 'name' | 'alias' | 'role' | 'summary' | 'tags' | 'archetype' | 'context_of_mention' | 'metadata'>,
  input: FamilyBookMatchInput = {},
): FamilyBookDecision {
  const meta = char.metadata ?? {};
  if (isFamilyExcluded(meta)) {
    return { matches: false, reason: 'This person is marked as not family — they stay off the Family tab and the family tree.' };
  }
  const pinned = pinnedBookCategory(meta);
  if (pinned === 'family') {
    return { matches: true, reason: 'You set Character Book to Family, which also keeps them on the family tree.' };
  }
  if (pinned) {
    return { matches: false, reason: `You set Character Book to ${bookCategoryLabel(pinned)}, so this card stays out of Family and the family tree.` };
  }
  if (input.onFamilyTree) {
    return { matches: true, reason: 'They are on your family tree, so they belong in the Family tab too.' };
  }

  const archetype = primaryArchetype(char.archetype);
  if (ROMANTIC_OR_CRUSH_ARCHETYPES.has(archetype)) {
    return {
      matches: false,
      reason: `This is a ${archetype.replace(/_/g, ' ')} connection, not kin — Family is for blood, in-laws, and chosen family.`,
    };
  }
  if (input.hasDatingRow) {
    return {
      matches: false,
      reason: 'This person is in Dating & Romance, so they belong on the Romantic tab unless you pin them to Family.',
    };
  }
  if (!hasStrongFamilyEvidence(char)) {
    return {
      matches: false,
      reason: 'No kinship title, “my cousin …” phrasing, or family role is on this card yet.',
    };
  }
  return { matches: true, reason: 'Kinship evidence is on this card (title, role, or “my [family] …” phrasing).' };
}

export function characterBelongsInFamilyBook(
  char: Pick<Character, 'name' | 'alias' | 'role' | 'summary' | 'tags' | 'archetype' | 'context_of_mention' | 'metadata'>,
  input: FamilyBookMatchInput = {},
): boolean {
  return decideFamilyBookMembership(char, input).matches;
}

export function inferredBookCategory(
  char: Pick<Character, 'name' | 'alias' | 'role' | 'summary' | 'tags' | 'archetype' | 'context_of_mention' | 'metadata'>,
  input: FamilyBookMatchInput = {},
): { category: BookRelationshipCategory; reason: string } {
  const pinned = pinnedBookCategory(char.metadata);
  if (pinned) {
    return { category: pinned, reason: `You set Character Book to ${bookCategoryLabel(pinned)}.` };
  }
  const family = decideFamilyBookMembership(char, input);
  if (family.matches) return { category: 'family', reason: family.reason };
  const archetype = primaryArchetype(char.archetype);
  if (ROMANTIC_OR_CRUSH_ARCHETYPES.has(archetype) || input.hasDatingRow) {
    return { category: 'romantic', reason: family.reason };
  }
  if (archetype === 'friend' || archetype === 'ally') {
    return { category: 'friends', reason: 'Friendship is the primary archetype on this card.' };
  }
  if (archetype === 'mentor' || archetype === 'professional' || archetype === 'acquaintance') {
    return { category: archetype === 'mentor' ? 'mentors' : archetype === 'professional' ? 'professional' : 'acquaintances', reason: `Primary archetype is ${archetype.replace(/_/g, ' ')}.` };
  }
  return { category: 'acquaintances', reason: family.reason };
}

export function buildBookCategoryMetadataPatch(input: {
  nextRaw: string;
  previousCategory?: string | null;
  previousExcluded?: unknown;
}): Record<string, unknown> {
  const confirmedAt = new Date().toISOString();
  const next = input.nextRaw.trim().toLowerCase();
  const isAuto = !next || next === 'auto';
  const previousExcluded = input.previousExcluded;
  const excludedFromBookCategory =
    previousExcluded &&
    typeof previousExcluded === 'object' &&
    String((previousExcluded as { reason?: unknown }).reason ?? '').startsWith('book_category:');

  if (isAuto) {
    return {
      book_category: null,
      book_category_source: 'user_cleared',
      book_category_reason: 'You cleared the pin so LoreBook can classify this card again.',
      book_category_previous: input.previousCategory ?? null,
      book_category_confirmed_at: confirmedAt,
      family_excluded: excludedFromBookCategory ? null : previousExcluded ?? null,
      manual_book_category_correction: {
        field: 'book_category',
        previous: input.previousCategory ?? null,
        corrected: null,
        corrected_at: confirmedAt,
      },
    };
  }

  const familyExcluded =
    next === 'family'
      ? null
      : { value: true, reason: `book_category:${next}`, at: confirmedAt };

  return {
    book_category: next,
    book_category_source: 'user_confirmed',
    book_category_reason: `You set Character Book to ${bookCategoryLabel(next)}.`,
    book_category_previous: input.previousCategory ?? null,
    book_category_confirmed_at: confirmedAt,
    family_excluded: familyExcluded,
    family_reviewed: next === 'family' ? true : undefined,
    manual_book_category_correction: {
      field: 'book_category',
      previous: input.previousCategory ?? null,
      corrected: next,
      corrected_at: confirmedAt,
    },
  };
}

const SYNTHETIC_TREE_ID = /^(?:__|name-|head-|group-)/;

/** Character-card ids on a family tree (excludes You and placeholders). */
export function familyTreeCardIds(
  tree: {
    members?: Array<{
      id?: string;
      is_self?: boolean;
      is_placeholder?: boolean;
      has_card?: boolean;
    }>;
  } | null
  | undefined,
): Set<string> {
  const ids = new Set<string>();
  for (const member of tree?.members ?? []) {
    const id = String(member.id ?? '').trim();
    if (!id || member.is_self || member.is_placeholder || SYNTHETIC_TREE_ID.test(id)) continue;
    if (member.has_card === false) continue;
    ids.add(id);
  }
  return ids;
}
