/**
 * Character Book category — which tab (Family / Romantic / Friends / ...) a
 * character belongs in. Inferred from kinship, romance, and work context;
 * manually pinnable when the inference lands in the wrong tab.
 */

import { isKinshipShapedRelationshipToYou } from './relationshipToYou';

export type BookCategory = 'family' | 'romantic' | 'friends' | 'professional' | 'creative' | 'acquaintances';

export const BOOK_CATEGORY_OPTIONS: Array<{ value: 'auto' | BookCategory; label: string }> = [
  { value: 'auto', label: 'Auto (recommended)' },
  { value: 'family', label: 'Family' },
  { value: 'romantic', label: 'Romantic' },
  { value: 'friends', label: 'Friends' },
  { value: 'professional', label: 'Professional' },
  { value: 'creative', label: 'Creative' },
  { value: 'acquaintances', label: 'Acquaintances' },
];

const KNOWN_CATEGORIES = new Set<string>(
  BOOK_CATEGORY_OPTIONS.filter((o) => o.value !== 'auto').map((o) => o.value),
);

/** Archetypes whose meaning is inherently romantic/crush — pinning one of
 *  these should exclude the character from Family unless Family is pinned. */
export const ROMANTIC_OR_CRUSH_ARCHETYPES = new Set<string>([
  'romantic',
  'crush',
  'unrequited_crush',
  'past_romantic',
  'romantic_interest',
  'one_night_stand',
]);

const FAMILY_NAME_TITLE_RE =
  /^(?:my\s+)?(?:t[ií]o|t[ií]a|uncle|aunt|mom|mother|dad|father|grandma|grandpa|abuela|abuelo|cousin|sister|brother|stepmom|stepdad)(?:\s|$)/i;

function normalizeCategoryKey(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

export function bookCategoryLabel(value: string): string {
  const key = normalizeCategoryKey(value);
  const preset = BOOK_CATEGORY_OPTIONS.find((o) => o.value === key);
  if (preset) return preset.label;
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Reads the user's pinned category, if any. Returns null for "auto" or an
 *  unrecognized value (falls back to inference). */
export function pinnedBookCategory(meta: Record<string, unknown> | null | undefined): BookCategory | null {
  const raw = meta?.book_category;
  if (typeof raw !== 'string') return null;
  const key = normalizeCategoryKey(raw);
  return KNOWN_CATEGORIES.has(key) ? (key as BookCategory) : null;
}

type InferenceInput = {
  archetype?: string | null;
  metadata?: Record<string, unknown> | null;
  name?: string | null;
};

function hasFamilyContext(input: InferenceInput): boolean {
  const meta = input.metadata ?? {};
  if (typeof meta.relationship_to_user === 'string' && isKinshipShapedRelationshipToYou(meta.relationship_to_user)) {
    return true;
  }
  if (typeof meta.relationship_type === 'string' && isKinshipShapedRelationshipToYou(meta.relationship_type)) {
    return true;
  }
  if (typeof meta.kinship_label === 'string' && meta.kinship_label.trim()) return true;
  return FAMILY_NAME_TITLE_RE.test((input.name ?? '').trim());
}

/**
 * Best-effort tab for a character with no pin. Always returns a category
 * plus a short human-readable reason shown under the picker.
 */
export function inferredBookCategory(
  character: InferenceInput,
  context: { hasDatingRow?: boolean } = {},
): { category: BookCategory; reason: string } {
  const meta = character.metadata ?? {};
  const familyExcluded = Boolean((meta.family_excluded as { value?: boolean } | null | undefined)?.value);
  const archetypeList = String(character.archetype ?? '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  const primary = archetypeList[0] ?? '';

  if (context.hasDatingRow || archetypeList.some((a) => ROMANTIC_OR_CRUSH_ARCHETYPES.has(a))) {
    return { category: 'romantic', reason: 'A romantic or dating connection is on record for them.' };
  }
  if (!familyExcluded && (primary === 'family' || hasFamilyContext(character))) {
    return { category: 'family', reason: 'Kinship context (name or relationship label) points to Family.' };
  }
  if (primary === 'professional') {
    return { category: 'professional', reason: 'Work or professional context is on record for them.' };
  }
  if (primary === 'muse') {
    return { category: 'creative', reason: 'Their story role centers on creative collaboration or inspiration.' };
  }
  if (primary === 'acquaintance') {
    return { category: 'acquaintances', reason: 'Not much story context yet — filed as an acquaintance.' };
  }
  return { category: 'friends', reason: 'Defaulting to Friends — no stronger kinship, romance, or work signal found.' };
}

/**
 * Builds the metadata patch for a manual Character Book category correction.
 * "auto" clears the pin (and any exclusion it implied) so inference decides
 * again. Pinning away from Family marks family_excluded so the character
 * won't drift back on its own; pinning Family clears any prior exclusion and
 * marks it reviewed so the family tree keeps them.
 */
export function buildBookCategoryMetadataPatch(input: {
  nextRaw: string;
  previousCategory?: string | null;
  previousExcluded?: unknown;
}): Record<string, unknown> {
  const confirmedAt = new Date().toISOString();
  const nextKey = normalizeCategoryKey(input.nextRaw);
  const next = nextKey && nextKey !== 'auto' && KNOWN_CATEGORIES.has(nextKey) ? (nextKey as BookCategory) : null;
  const previous = typeof input.previousCategory === 'string' ? normalizeCategoryKey(input.previousCategory) : null;

  if (!next) {
    const patch: Record<string, unknown> = {
      book_category: null,
      book_category_source: 'user_cleared',
      book_category_reason: null,
      book_category_confirmed_at: confirmedAt,
    };
    if (input.previousExcluded) patch.family_excluded = null;
    return patch;
  }

  const patch: Record<string, unknown> = {
    book_category: next,
    book_category_source: 'user_confirmed',
    book_category_confirmed_at: confirmedAt,
    manual_book_category_correction: {
      field: 'book_category',
      previous: previous || null,
      corrected: next,
      corrected_at: confirmedAt,
    },
  };

  if (next === 'family') {
    patch.family_excluded = null;
    patch.family_reviewed = true;
  } else if (previous !== next || input.previousExcluded) {
    patch.family_excluded = { value: true, reason: `book_category:${next}`, at: confirmedAt };
  }

  return patch;
}

export type FamilyBookExtras = {
  hasDatingRow?: boolean;
  onFamilyTree?: boolean;
};

type FamilyMembershipInput = {
  name?: string | null;
  alias?: string[] | null;
  archetype?: string | null;
  role?: string | null;
  metadata?: Record<string, unknown> | null;
};

function isFamilyTitledName(value: string | null | undefined): boolean {
  return FAMILY_NAME_TITLE_RE.test((value ?? '').trim());
}

/** A specific kinship term (cousin, aunt, sister, ...) — excludes the generic
 *  "family" bucket label, which alone isn't strong enough evidence for Family
 *  Book membership (unlike inferredBookCategory's looser default-tab guess). */
function isSpecificKinshipValue(value: string | null | undefined): boolean {
  if (!value) return false;
  if (value.trim().toLowerCase() === 'family') return false;
  return isKinshipShapedRelationshipToYou(value);
}

/**
 * Strict membership check for the Family Book tab/tree — distinct from
 * inferredBookCategory's single-best-guess-tab logic. Requires real kinship
 * evidence (titled name/alias, kinship role, kinship-shaped relationship, or
 * family-tree placement), not just a generic "family" archetype/category tag,
 * so the tree doesn't fill up with false positives.
 */
export function decideFamilyBookMembership(
  character: FamilyMembershipInput,
  extras: FamilyBookExtras = {},
): { matches: boolean; reason: string } {
  const meta = character.metadata ?? {};

  // An explicit exclusion always wins, even over a user pin or tree placement.
  const excluded = meta.family_excluded as { value?: boolean } | null | undefined;
  if (excluded?.value) {
    return { matches: false, reason: 'Explicitly excluded from Family.' };
  }

  // A confirmed user pin to Family is authoritative next.
  if (pinnedBookCategory(meta) === 'family' && meta.book_category_source === 'user_confirmed') {
    return { matches: true, reason: 'Pinned to Family by the user.' };
  }

  // A romantic/crush archetype (or an active dating row) means this is a
  // Dating & Romance person, never Family — even with stale family metadata.
  const archetypeList = String(character.archetype ?? '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  if (extras.hasDatingRow || archetypeList.some((a) => ROMANTIC_OR_CRUSH_ARCHETYPES.has(a))) {
    return { matches: false, reason: 'This is a crush/dating connection, not a family member.' };
  }

  if (extras.onFamilyTree) {
    return { matches: true, reason: 'Placed on the family tree.' };
  }

  const aliases = character.alias ?? [];
  if (isFamilyTitledName(character.name) || aliases.some((a) => isFamilyTitledName(a))) {
    return { matches: true, reason: 'Their name carries a kinship title (aunt, cousin, mom, ...).' };
  }
  if (isSpecificKinshipValue(character.role)) {
    return { matches: true, reason: 'Their role is a specific kinship term.' };
  }
  if (
    isSpecificKinshipValue(meta.relationship_to_user as string | undefined) ||
    isSpecificKinshipValue(meta.relationship_type as string | undefined) ||
    (typeof meta.kinship_label === 'string' && meta.kinship_label.trim())
  ) {
    return { matches: true, reason: 'A specific kinship relationship is on record for them.' };
  }

  return { matches: false, reason: 'No kinship evidence (name, role, relationship, or tree placement) found.' };
}

/** Convenience boolean wrapper around decideFamilyBookMembership. */
export function characterBelongsInFamilyBook(
  character: FamilyMembershipInput,
  extras: FamilyBookExtras = {},
): boolean {
  return decideFamilyBookMembership(character, extras).matches;
}

type FamilyTreeMember = {
  id: string;
  is_self?: boolean;
  has_card?: boolean;
  is_placeholder?: boolean;
};

/** Real, card-backed member ids from a family tree — excludes the self node,
 *  placeholders, and any member with no linked character card. */
export function familyTreeCardIds(
  tree: { members?: FamilyTreeMember[] | null } | null | undefined,
): Set<string> {
  const members = tree?.members ?? [];
  const ids = new Set<string>();
  for (const member of members) {
    if (member.is_self || member.is_placeholder) continue;
    if (member.has_card) ids.add(member.id);
  }
  return ids;
}
